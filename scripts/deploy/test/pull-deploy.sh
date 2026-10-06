#!/usr/bin/env bash
# Self-test for scripts/deploy/pull-deploy.sh and infra/loki/install-pull-deploy.sh,
# against fakes: a real git repository standing in for GitHub (ls-remote and
# fetch read it by path), a fake `docker` that records every call and fails on
# request, a fake `curl` serving check-runs fixtures, and a stub tree whose
# scripts/deploy/edge.sh and scripts/ci/image-smoke.sh only record themselves.
# Nothing touches a real Docker daemon, network or crontab. Each case ASSERTS:
#
#   noop       already at the branch head: no docker call at all
#   ci         no check-runs / pending -> wait (exit 0); a failed run -> refuse
#              (exit 3); in every case no docker call and DEPLOYED_SHA unchanged
#   rollback   health fails after `up` -> the previous release is re-applied
#              (its tree, its images) and verified; DEPLOYED_SHA unchanged;
#              the failed sha is then held, not retried, until --force
#   order      a new sha runs §4.1 in order: build, smoke, guard, edge install,
#              postgres, migrate --status, migrate, up, attach, verify, api
#              health, actor turn — and records release.env, state/current,
#              DEPLOYED_SHA and previous-sha; a re-run is a no-op
#   up-fails   a failed `up` rolls back to the previous release too
#   migrate    a failed migration -> no `up --remove-orphans`, previous
#              postgres image re-tagged and re-applied, DEPLOYED_SHA unchanged
#   lock       a second run while one is deploying exits 75 and does nothing
#   sha        --sha deploys an older commit on the branch; a commit not on
#              the branch is refused; --skip-ci without --sha is a usage error
#   prune      old release trees and their images go; the running one and the
#              one it replaced never do
#   nonff      a force-pushed branch that is not a fast-forward is refused
#   pause      paused -> a timer run does nothing
#   installer  cron when linger is off, systemd when on; idempotent; never
#              overwrites the config; uninstall removes the schedule only
#
#   scripts/deploy/test/pull-deploy.sh
#
# Needs bash, git, jq, sha256sum, and flock or perl. Runs on macOS and Linux.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PD="$ROOT/scripts/deploy/pull-deploy.sh"
INSTALLER="$ROOT/infra/loki/install-pull-deploy.sh"

# Physical path: the deployer records release trees with `pwd -P`, and macOS's
# TMPDIR sits behind the /var -> /private/var symlink.
H="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/pulldeploy-test.XXXXXX")" && pwd -P)"
trap 'rm -rf "$H"' EXIT

FAILED=0; PASSED=0
pass() { PASSED=$((PASSED + 1)); printf 'HARNESS PASS %s\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf 'HARNESS FAIL %s\n' "$*"; }
check() { local what="$1"; shift; if "$@"; then pass "$what"; else fail "$what"; fi; }
has() { grep -qF -- "$2" "$1"; }
lacks() { ! grep -qF -- "$2" "$1"; }
count() { grep -cF -- "$2" "$1" || true; }
eq() { [ "$1" = "$2" ] || { printf '    expected [%s] got [%s]\n' "$2" "$1"; return 1; }; }
# Each pattern must appear on a later line than the one before it.
in_order() {
  local file="$1" line=0 p n; shift
  for p in "$@"; do
    n="$(awk -v start="$line" -v pat="$p" 'NR > start && index($0, pat) { print NR; exit }' "$file")"
    [ -n "$n" ] || { printf '    not found after line %s: %s\n' "$line" "$p"; return 1; }
    line="$n"
  done
}

# ---------------------------------------------------------------- fakes
export FAKE_CALLS="$H/calls" FAKE_STATE="$H/fake"
mkdir -p "$H/bin" "$FAKE_STATE/checks"
echo "sha256:orig" > "$FAKE_STATE/pgid"

cat > "$H/bin/docker" <<'EOF'
#!/usr/bin/env bash
args="$*"
# The guard's dev render runs under `env -i`, so find the log without the env.
printf 'docker %s | API_IMAGE=%s\n' "$args" "${API_IMAGE:-}" >> "${FAKE_CALLS:-$(dirname "$0")/../calls}"
fail_if() { case ",${FAKE_FAIL:-}," in *",$1,"*) exit 1 ;; esac; }
bad() { [ -n "${FAKE_BAD:-}" ] && case "${API_IMAGE:-}" in *"$FAKE_BAD"*) return 0 ;; esac; return 1; }
case "$args" in
  *"config --format json"*) echo '{}' ;;
  "image inspect -f "*) cat "$FAKE_STATE/pgid" ;;
  *" build postgres"*)
    if [ -n "${FAKE_SLEEP_BUILD:-}" ]; then touch "$FAKE_STATE/building"; sleep "$FAKE_SLEEP_BUILD"; fi
    fail_if build
    echo "sha256:new$RANDOM" > "$FAKE_STATE/pgid" ;;
  "build "*) fail_if build ;;
  "run --rm -i --network none"*) cat > /dev/null; fail_if guard ;;
  *"cli.ts --status"*) exit 3 ;;
  *"cli.ts"*) fail_if migrate ;;
  *"up -d --remove-orphans"*) if bad; then fail_if up; fi ;;
  *"exec -T api"*) if bad; then fail_if health; fi ;;
esac
exit 0
EOF
cat > "$H/bin/curl" <<'EOF'
#!/usr/bin/env bash
url="${*: -1}"
sha="$(printf '%s' "$url" | sed -n 's#.*/commits/\([0-9a-f]*\)/check-runs.*#\1#p')"
echo "curl $sha" >> "${FAKE_CALLS:-/dev/null}"
cat "$FAKE_STATE/checks/$sha.json" 2> /dev/null || exit 22
EOF
chmod +x "$H/bin/docker" "$H/bin/curl"

green() { echo '{"total_count":2,"check_runs":[{"name":"lint","status":"completed","conclusion":"success"},{"name":"images (api)","status":"completed","conclusion":"skipped"}]}' > "$FAKE_STATE/checks/$1.json"; }
pending() { echo '{"total_count":2,"check_runs":[{"name":"lint","status":"completed","conclusion":"success"},{"name":"test (actors)","status":"in_progress","conclusion":null}]}' > "$FAKE_STATE/checks/$1.json"; }
red() { echo '{"total_count":2,"check_runs":[{"name":"lint","status":"completed","conclusion":"success"},{"name":"test (actors)","status":"completed","conclusion":"failure"}]}' > "$FAKE_STATE/checks/$1.json"; }
none() { echo '{"total_count":0,"check_runs":[]}' > "$FAKE_STATE/checks/$1.json"; }

# ---------------------------------------------------------------- "GitHub"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
O="$H/origin"
git init -q -b main "$O"
mkdir -p "$O/infra/grafana" "$O/infra/dapr" "$O/scripts/deploy" "$O/scripts/ci"
: > "$O/infra/docker-compose.yml"
: > "$O/infra/docker-compose.prod.yml"
echo "rule: 1" > "$O/infra/grafana/alerts.yaml"
echo "notes" > "$O/infra/grafana/README.md"
echo "component: 1" > "$O/infra/dapr/c.yaml"
echo "export default 1" > "$O/scripts/deploy/check-prod-config.mjs"
cat > "$O/scripts/deploy/edge.sh" <<'EOF'
#!/usr/bin/env bash
echo "edge $1 | API_IMAGE=${API_IMAGE:-} env=$COMPOSE_ENV_FILE project=$COMPOSE_PROJECT insecure=${EDGE_VERIFY_INSECURE:-} cwd=$PWD" >> "$FAKE_CALLS"
case ",${FAKE_FAIL:-}," in *",edge-$1,"*) exit 1 ;; esac
EOF
cat > "$O/scripts/ci/image-smoke.sh" <<'EOF'
#!/usr/bin/env bash
echo "smoke $1 $2" >> "$FAKE_CALLS"
EOF
chmod +x "$O/scripts/deploy/edge.sh" "$O/scripts/ci/image-smoke.sh"
commit() { echo "$1" > "$O/version"; git -C "$O" add -A; git -C "$O" commit -qm "$1"; git -C "$O" rev-parse HEAD; }
C1="$(commit c1)"
C2="$(commit c2)"
git -C "$O" checkout -q -b feature
CF="$(commit feature-only)"
git -C "$O" checkout -q main
git -C "$O" reset -q --hard "$C1"

# ---------------------------------------------------------------- the host
export HOME="$H/home"
D="$HOME/cellar-prod"
mkdir -p "$D/env" "$H/vhost"
echo "API_IMAGE=hand-made-api:old" > "$D/env/.env.prod"
echo "$C1" > "$D/DEPLOYED_SHA"
# The first, hand-made deploy's tree: a real directory, not ours to replace.
git -C "$O" archive "$C1" | (mkdir -p "$D/src" && tar -x -C "$D/src")

export PULL_DEPLOY_CONFIG="$H/no-config" PULL_DEPLOY_HOME="$D" PULL_DEPLOY_REPO_URL="$O" \
  PULL_DEPLOY_BRANCH=main NGINX_PROXY_VHOST_DIR="$H/vhost" PATH="$H/bin:$PATH"
unset FAKE_FAIL FAKE_BAD FAKE_SLEEP_BUILD

RC=0
run() { : > "$FAKE_CALLS"; RC=0; "$PD" "$@" > "$H/out" 2>&1 || RC=$?; }
st() { jq -r "$1" "$D/state/status.json"; }
no_docker() { lacks "$FAKE_CALLS" "docker "; }
deployed() { tr -d '[:space:]' < "$D/DEPLOYED_SHA"; }

# ---------------------------------------------------------------- noop
run
check "noop: exit 0" eq "$RC" 0
check "noop: no docker call" no_docker
check "noop: status says noop" eq "$(st .check.outcome)" noop

# ---------------------------------------------------------------- ci
git -C "$O" reset -q --hard "$C2"
none "$C2"; run
check "ci none: waits (exit 0)" eq "$RC" 0
check "ci none: outcome waiting" eq "$(st .check.outcome)" waiting
check "ci none: no docker call" no_docker
pending "$C2"; run
check "ci pending: waits (exit 0)" eq "$RC" 0
check "ci pending: names the pending check" has "$D/state/status.json" "test (actors)"
check "ci pending: no docker call" no_docker
red "$C2"; run
check "ci red: refused (exit 3)" eq "$RC" 3
check "ci red: outcome refused" eq "$(st .check.outcome)" refused
check "ci red: names the failed check" has "$D/state/status.json" "test (actors)=failure"
check "ci red: no docker call" no_docker
check "ci: DEPLOYED_SHA unchanged" eq "$(deployed)" "$C1"

# ---------------------------------------------------------------- rollback
green "$C2"
S2="${C2:0:8}"
FAKE_FAIL=health FAKE_BAD="$S2" run
check "rollback: exit 1" eq "$RC" 1
check "rollback: attempt rolled_back" eq "$(jq -r .result "$D/state/last-attempt.json")" rolled_back
check "rollback: failed step recorded as verify" eq "$(jq -r .step "$D/state/last-attempt.json")" verify
check "rollback: new images went up first, then the previous ones" in_order "$FAKE_CALLS" \
  "up -d --remove-orphans --wait --wait-timeout 300 | API_IMAGE=cellar-prod-api:$S2" \
  "exec -T api" \
  "edge install | API_IMAGE= env=$D/env/.env.prod project=cellar-prod insecure= cwd=$D/src" \
  "-f $D/src/infra/docker-compose.yml -f $D/src/infra/docker-compose.prod.yml --env-file $D/env/.env.prod up -d --remove-orphans --wait --wait-timeout 300 | API_IMAGE=" \
  "edge attach | API_IMAGE= " \
  "edge verify | API_IMAGE= "
check "rollback: postgres tag restored" has "$FAKE_CALLS" "docker tag sha256:orig cellar-prod-postgres:latest"
check "rollback: DEPLOYED_SHA unchanged" eq "$(deployed)" "$C1"
check "rollback: no release.env written" test ! -e "$D/state/release.env"
run
check "held: a failed sha is not retried (exit 0)" eq "$RC" 0
check "held: outcome held" eq "$(st .check.outcome)" held
check "held: no docker call" no_docker

# ---------------------------------------------------------------- order
echo "sha256:orig" > "$FAKE_STATE/pgid"
run --force
check "order: --force deploys (exit 0)" eq "$RC" 0
check "order: §4.1 sequence" in_order "$FAKE_CALLS" \
  "compose -p cellar-prod -f $D/releases/$C2/infra/docker-compose.yml -f $D/releases/$C2/infra/docker-compose.prod.yml --env-file $D/env/.env.prod build postgres | API_IMAGE=cellar-prod-api:$S2" \
  "docker tag cellar-prod-postgres:latest cellar-prod-postgres:$S2" \
  "build --progress=plain -t cellar-prod-actors:$S2 -f services/actors/Dockerfile ." \
  "build --progress=plain -t cellar-prod-api:$S2 -f services/api/Dockerfile ." \
  "smoke api cellar-prod-api:$S2" \
  "smoke actors cellar-prod-actors:$S2" \
  "edge install | API_IMAGE=cellar-prod-api:$S2 env=$D/env/.env.prod project=cellar-prod" \
  "up -d --wait --wait-timeout 180 postgres | API_IMAGE=cellar-prod-api:$S2" \
  "cli.ts --status | API_IMAGE=cellar-prod-api:$S2" \
  "cli.ts | API_IMAGE=cellar-prod-api:$S2" \
  "up -d --remove-orphans --wait --wait-timeout 300 | API_IMAGE=cellar-prod-api:$S2" \
  "edge attach | API_IMAGE=cellar-prod-api:$S2" \
  "edge verify | API_IMAGE=cellar-prod-api:$S2 env=$D/env/.env.prod project=cellar-prod insecure=1" \
  "exec -T api" \
  "exec -T actors"
# The guard is a pipeline, so its three processes start in any order — but all
# of them between the smoke test and the edge install.
check "order: guard renders dev between smoke and edge install" in_order "$FAKE_CALLS" \
  "smoke actors" "--env-file /dev/null config --format json" "edge install"
check "order: guard runs the checker in the new actors image" in_order "$FAKE_CALLS" \
  "smoke actors" "run --rm -i --network none --entrypoint node cellar-prod-actors:$S2" "edge install"
check "order: DEPLOYED_SHA advanced" eq "$(deployed)" "$C2"
check "order: previous-sha recorded" eq "$(tr -d '[:space:]' < "$D/state/previous-sha")" "$C1"
check "order: release.env names the images" has "$D/state/release.env" "ACTORS_IMAGE=cellar-prod-actors:$S2"
check "order: config hashes are 16 hex" eq "$(grep -cE '^(OTEL_LGTM|DAPR)_CONFIG_HASH=[0-9a-f]{16}$' "$D/state/release.env")" 2
check "order: hash matches the workflow's function" eq "$(grep '^DAPR_CONFIG_HASH=' "$D/state/release.env" | cut -d= -f2)" \
  "$(cd "$D/releases/$C2" && find infra/dapr -type f ! -name '*.md' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)"
check "order: state/current is the release" eq "$(cd "$D/state/current" && pwd -P)" "$(cd "$D/releases/$C2" && pwd -P)"
check "order: a hand-made src directory is left alone" test ! -L "$D/src"
check "order: status says deployed" eq "$(st .check.outcome)/$(st .last_attempt.result)/$(st .last_success.sha)" "deployed/ok/$C2"
check "order: log file written" has "$D/logs/pull-deploy.log" "deployed $C2"
run
check "idempotent: re-run is a noop" eq "$RC/$(st .check.outcome)" "0/noop"
check "idempotent: no docker call" no_docker

# ---------------------------------------------------------------- migrate
C3="$(commit c3)"; S3="${C3:0:8}"; green "$C3"
FAKE_FAIL=migrate run
check "migrate: exit 1" eq "$RC" 1
check "migrate: attempt failed at migrate" eq "$(jq -r '.result + "/" + .step' "$D/state/last-attempt.json")" failed/migrate
check "migrate: never ran up --remove-orphans" lacks "$FAKE_CALLS" "up -d --remove-orphans"
check "migrate: previous postgres re-applied with the previous release" in_order "$FAKE_CALLS" \
  "cli.ts | API_IMAGE=cellar-prod-api:$S3" \
  "docker tag sha256:" \
  "-f $D/releases/$C2/infra/docker-compose.yml -f $D/releases/$C2/infra/docker-compose.prod.yml --env-file $D/env/.env.prod up -d --wait --wait-timeout 180 postgres | API_IMAGE=cellar-prod-api:$S2" \
  "edge install | API_IMAGE=cellar-prod-api:$S2"
check "migrate: DEPLOYED_SHA unchanged" eq "$(deployed)" "$C2"
check "migrate: release.env still the running release" has "$D/state/release.env" "API_IMAGE=cellar-prod-api:$S2"

# A failed `up` (an unhealthy container under --wait) rolls back like a failed
# health check, here onto a release this tool deployed itself.
FAKE_FAIL=up FAKE_BAD="$S3" run --force
check "up-fails: rolled back" eq "$RC/$(jq -r '.result + "/" + .step' "$D/state/last-attempt.json")" "1/rolled_back/up"
check "up-fails: the previous release went back up" in_order "$FAKE_CALLS" \
  "up -d --remove-orphans --wait --wait-timeout 300 | API_IMAGE=cellar-prod-api:$S3" \
  "-f $D/releases/$C2/infra/docker-compose.yml -f $D/releases/$C2/infra/docker-compose.prod.yml --env-file $D/env/.env.prod up -d --remove-orphans --wait --wait-timeout 300 | API_IMAGE=cellar-prod-api:$S2" \
  "edge attach | API_IMAGE=cellar-prod-api:$S2" \
  "exec -T actors"
check "up-fails: DEPLOYED_SHA unchanged" eq "$(deployed)" "$C2"

# ---------------------------------------------------------------- lock
C4="$(commit c4)"; green "$C4"
: > "$FAKE_CALLS"
rm -f "$FAKE_STATE/building"
FAKE_SLEEP_BUILD=4 "$PD" > "$H/out-a" 2>&1 &
A=$!
for _ in $(seq 1 50); do [ -e "$FAKE_STATE/building" ] && break; sleep 0.1; done
check "lock: first run reached the build" test -e "$FAKE_STATE/building"
RC=0; "$PD" > "$H/out-b" 2>&1 || RC=$?
check "lock: second run exits 75" eq "$RC" 75
check "lock: second run logged the lock" has "$D/logs/pull-deploy.log" "another pull-deploy run holds"
RCA=0; wait "$A" || RCA=$?
check "lock: first run finished the deploy" eq "$RCA/$(deployed)" "0/$C4"
check "lock: exactly one build ran" eq "$(count "$FAKE_CALLS" " build postgres")" 1

# ---------------------------------------------------------------- sha
run --skip-ci
check "sha: --skip-ci without --sha is a usage error" eq "$RC" 2
run --sha "${CF:0:12}"
check "sha: a commit not on the branch is refused" eq "$RC/$(st .check.outcome)" "3/refused"
check "sha: refused without a docker call" no_docker
# With two kept, the oldest tree that is neither running nor being replaced goes.
touch -t 202001010000 "$D/releases/$C3"
PULL_DEPLOY_KEEP_RELEASES=2 run --sha "${C2:0:12}"
check "sha: an older commit on the branch deploys (rollback)" eq "$RC/$(deployed)" "0/$C2"
check "prune: the oldest spare tree and its images are removed" eq "$(test -e "$D/releases/$C3" && echo kept || echo pruned)" pruned
check "prune: its images too" has "$FAKE_CALLS" "docker image rm cellar-prod-api:$S3 cellar-prod-actors:$S3 cellar-prod-postgres:$S3"
check "prune: the running and replaced trees are kept" eq "$(test -d "$D/releases/$C2" && test -d "$D/releases/$C4" && echo yes)" yes
check "sha: it re-used the existing release tree" has "$FAKE_CALLS" "-f $D/releases/$C2/infra/docker-compose.yml"
run --sha "$C2"
check "sha: the deployed commit again is a noop without --force" eq "$RC/$(st .check.outcome)" "0/noop"
check "sha: noop made no docker call" no_docker

# ---------------------------------------------------------------- nonff
git -C "$O" checkout -q --orphan rewrite
C5="$(commit rewritten)"
git -C "$O" branch -q -f main "$C5"
git -C "$O" checkout -q main
green "$C5"
run
check "nonff: not a fast-forward is refused (exit 3)" eq "$RC/$(st .check.outcome)" "3/refused"
check "nonff: no docker call" no_docker
check "nonff: DEPLOYED_SHA unchanged" eq "$(deployed)" "$C2"

# ---------------------------------------------------------------- pause
run pause
check "pause: exit 0" eq "$RC/$(st .paused)" "0/true"
run
check "pause: a timer run does nothing" eq "$RC/$(st .check.outcome)" "0/paused"
check "pause: no docker call" no_docker
run resume
check "resume: unpaused" eq "$RC/$(st .paused)" "0/false"

# ---------------------------------------------------------------- installer
mkdir -p "$H/ibin"
cat > "$H/ibin/crontab" <<'EOF'
#!/usr/bin/env bash
f="$FAKE_STATE/crontab"
if [ "${1:-}" = "-l" ]; then [ -f "$f" ] && cat "$f" && exit 0; echo "no crontab for t" >&2; exit 1; fi
cat > "$f"
EOF
cat > "$H/ibin/loginctl" <<'EOF'
#!/usr/bin/env bash
echo "${FAKE_LINGER:-no}"
EOF
cat > "$H/ibin/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "systemctl $*" >> "$FAKE_STATE/systemctl"
EOF
chmod +x "$H/ibin/"*
IHOME="$H/ihome"
mkdir -p "$IHOME"
printf '0 3 * * * /usr/bin/true # someone else\n' > "$FAKE_STATE/crontab"
# XDG_CONFIG_HOME is unset, not inherited: the installer puts its units in
# ${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user, and GitHub's ubuntu runners
# export XDG_CONFIG_HOME=/home/runner/.config. Inherited, the units went to the
# runner's real config dir instead of $IHOME — "linger on -> units installed"
# failed there (stack-ci 37404204231) while passing on macOS, where it is
# unset, and "uninstall: units removed" passed without testing anything. On a
# Linux workstation it would have written into the developer's own user units.
inst() { RC=0; env -u XDG_CONFIG_HOME HOME="$IHOME" PATH="$H/ibin:$PATH" "$INSTALLER" "$@" > "$H/iout" 2>&1 || RC=$?; }
inst
check "installer: exit 0" eq "$RC" 0
check "installer: script installed and executable" test -x "$IHOME/.local/lib/cellar-pull-deploy/pull-deploy.sh"
check "installer: config created mode 600" eq "$(stat -c %a "$IHOME/.config/cellar-pull-deploy/config" 2> /dev/null || stat -f %Lp "$IHOME/.config/cellar-pull-deploy/config")" 600
check "installer: linger off -> one cron line" eq "$(count "$FAKE_STATE/crontab" "# cellar-pull-deploy")" 1
check "installer: other crontab lines kept" has "$FAKE_STATE/crontab" "# someone else"
echo "PULL_DEPLOY_BRANCH=production" >> "$IHOME/.config/cellar-pull-deploy/config"
inst
check "installer: idempotent (still one cron line)" eq "$(count "$FAKE_STATE/crontab" "# cellar-pull-deploy")" 1
check "installer: never overwrites the config" has "$IHOME/.config/cellar-pull-deploy/config" "PULL_DEPLOY_BRANCH=production"
FAKE_LINGER=yes inst
check "installer: linger on -> systemd timer enabled" has "$FAKE_STATE/systemctl" "systemctl --user enable --now cellar-pull-deploy.timer"
check "installer: linger on -> units installed" test -f "$IHOME/.config/systemd/user/cellar-pull-deploy.timer"
check "installer: linger on -> cron line removed" eq "$(count "$FAKE_STATE/crontab" "# cellar-pull-deploy")" 0
inst uninstall
check "uninstall: units removed" test ! -e "$IHOME/.config/systemd/user/cellar-pull-deploy.timer"
check "uninstall: script removed, config kept" eq "$(test -e "$IHOME/.local/lib/cellar-pull-deploy/pull-deploy.sh" && echo y || echo n)/$(test -f "$IHOME/.config/cellar-pull-deploy/config" && echo y || echo n)" "n/y"

printf '\nHARNESS %s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
