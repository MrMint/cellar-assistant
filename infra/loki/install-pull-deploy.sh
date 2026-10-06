#!/usr/bin/env bash
# Install (or remove) the pull-based deploy for the CURRENT user on Loki — the
# unprivileged account that owns the production stack. No sudo, idempotent:
# re-running it updates the installed script and changes nothing else.
#
#   infra/loki/install-pull-deploy.sh            # install / update
#   infra/loki/install-pull-deploy.sh uninstall  # stop the schedule, remove the script
#
# Run it from a tree of this repository (a release under ~/cellar-prod/releases/,
# or any checkout of a commit you have reviewed). It:
#
#   1. copies scripts/deploy/pull-deploy.sh to ~/.local/lib/cellar-pull-deploy/.
#      The schedule runs THAT copy, not the one in each new release, so a commit
#      cannot change the deployer that judges it; updating the deployer is this
#      installer, run by a human.
#   2. creates ~/.config/cellar-pull-deploy/config from pull-deploy.env.example,
#      mode 600, if it does not exist. It never overwrites one.
#   3. schedules it: systemd user units if this user has linger enabled
#      (`loginctl show-user $USER -p Linger`), else a user crontab line. Without
#      linger, user units stop at logout, which is why cron is the fallback.
#      PULL_DEPLOY_SCHEDULER=systemd|cron overrides the choice.
#
# Uninstall keeps the config, the state, the logs and the running stack.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LIB="$HOME/.local/lib/cellar-pull-deploy"
CONF_DIR="$HOME/.config/cellar-pull-deploy"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CRON_TAG="# cellar-pull-deploy"
CRON_LOG="$HOME/.local/state/cellar-pull-deploy-cron.log"
CRON_LINE="*/5 * * * * $LIB/pull-deploy.sh >> $CRON_LOG 2>&1 $CRON_TAG"

say() { printf 'install-pull-deploy: %s\n' "$*"; }

cron_remove() {
  local cur
  cur="$(crontab -l 2> /dev/null || true)"
  if printf '%s\n' "$cur" | grep -qF "$CRON_TAG"; then
    printf '%s\n' "$cur" | grep -vF "$CRON_TAG" | crontab -
    say "removed the crontab line"
  fi
}

cron_install() {
  local cur
  cur="$(crontab -l 2> /dev/null || true)"
  mkdir -p "$(dirname "$CRON_LOG")"
  {
    printf '%s\n' "$cur" | grep -vF "$CRON_TAG" | sed '/^$/d' || true
    printf '%s\n' "$CRON_LINE"
  } | crontab -
  say "crontab: $CRON_LINE"
}

systemd_remove() {
  if [ -f "$UNIT_DIR/cellar-pull-deploy.timer" ]; then
    systemctl --user disable --now cellar-pull-deploy.timer > /dev/null 2>&1 || true
    rm -f "$UNIT_DIR/cellar-pull-deploy.timer" "$UNIT_DIR/cellar-pull-deploy.service"
    systemctl --user daemon-reload || true
    say "removed the systemd user timer"
  fi
}

systemd_install() {
  mkdir -p "$UNIT_DIR"
  cp "$HERE/cellar-pull-deploy.service" "$HERE/cellar-pull-deploy.timer" "$UNIT_DIR/"
  systemctl --user daemon-reload
  systemctl --user enable --now cellar-pull-deploy.timer
  say "systemd user timer enabled (systemctl --user list-timers cellar-pull-deploy.timer)"
}

if [ "${1:-install}" = uninstall ]; then
  cron_remove
  systemd_remove
  rm -f "$LIB/pull-deploy.sh"
  say "uninstalled; config ($CONF_DIR), state and logs kept"
  exit 0
fi
[ "${1:-install}" = install ] || { echo "usage: $0 [install|uninstall]" >&2; exit 2; }

# 1. the deployer
mkdir -p "$LIB"
cp "$ROOT/scripts/deploy/pull-deploy.sh" "$LIB/pull-deploy.sh.tmp"
chmod 755 "$LIB/pull-deploy.sh.tmp"
mv "$LIB/pull-deploy.sh.tmp" "$LIB/pull-deploy.sh"
say "installed $LIB/pull-deploy.sh"

# 2. the config
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"
if [ ! -f "$CONF_DIR/config" ]; then
  (umask 077 && cp "$HERE/pull-deploy.env.example" "$CONF_DIR/config")
  say "created $CONF_DIR/config — set NGINX_PROXY_VHOST_DIR and PULL_DEPLOY_BRANCH before the first tick"
else
  say "kept the existing $CONF_DIR/config"
fi

# 3. the schedule
sched="${PULL_DEPLOY_SCHEDULER:-auto}"
if [ "$sched" = auto ]; then
  linger="$(loginctl show-user "$(id -un)" -p Linger --value 2> /dev/null || true)"
  if [ "$linger" = yes ]; then sched=systemd; else sched=cron; fi
  say "linger=${linger:-unknown} -> $sched"
fi
case "$sched" in
  systemd) cron_remove; systemd_install ;;
  cron) systemd_remove; cron_install ;;
  *) echo "PULL_DEPLOY_SCHEDULER must be systemd, cron or auto" >&2; exit 2 ;;
esac

# The deployer exports each release's images and config hashes from
# state/release.env; a compose wrapper that omits it would roll the apps back to
# whatever .env.prod names on its next `up`.
home="$(
  # shellcheck disable=SC1091
  . "$CONF_DIR/config" > /dev/null 2>&1 || true
  echo "${PULL_DEPLOY_HOME:-$HOME/cellar-prod}"
)"
if [ -f "$home/dc" ] && ! grep -q 'release.env' "$home/dc"; then
  say "WARNING: $home/dc does not pass --env-file $home/state/release.env after .env.prod; add it (infra/loki/README.md)"
fi
# ~/cellar-prod/src as a real directory is the first, hand-made deploy's tree.
# The deployer leaves it alone, so it goes stale after the first pull deploy.
if [ -d "$home/src" ] && [ ! -L "$home/src" ]; then
  say "WARNING: $home/src is a directory, not a symlink; adopt it once as a release (infra/loki/README.md, \"First install\")"
fi
say "done. Status: $LIB/pull-deploy.sh status"
