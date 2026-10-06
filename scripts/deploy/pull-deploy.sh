#!/usr/bin/env bash
# Pull-based production deploy, run ON LOKI by a timer as the unprivileged user
# that owns the stack. Nothing on GitHub can reach or command Loki: this script
# reads the public repository (git over HTTPS, and the unauthenticated GitHub
# REST API for check-runs) and decides for itself.
#
#   pull-deploy.sh                 one tick: deploy the branch head if it is new,
#                                  a fast-forward of what runs, and CI-green
#   pull-deploy.sh --force         the same, but also redeploy the sha already
#                                  running, or one whose last attempt failed
#   pull-deploy.sh --sha <sha>     deploy exactly that commit (must be reachable
#                                  from the branch; need not be a fast-forward,
#                                  so this is also the code-rollback command).
#                                  Runs while paused. Add --force to redeploy it.
#   pull-deploy.sh --sha <sha> --skip-ci   emergency only: skip the CI gate
#   pull-deploy.sh status          print the status JSON
#   pull-deploy.sh pause | resume  stop / restart timer-driven deploys
#
# docs/architecture/deploy-loki.md §2.6 has the design and why it is this
# shape; §4.1 is the sequence below; infra/loki/README.md is the how-to.
#
# THE SEQUENCE (deploy-loki.md §4.1), each step logged; the stack is never
# taken down:
#   fetch + verify   ls-remote the branch; fetch into a bare mirror; refuse
#                    anything not a fast-forward of the deployed sha (timer
#                    mode) or not reachable from the branch (--sha mode)
#   CI gate          every check-run on the commit completed, and each one
#                    success/neutral/skipped; pending or none yet = wait
#   export           `git archive <sha>` into releases/<sha>/ (immutable: the
#                    running containers bind-mount config from it)
#   build            postgres, actors, api, one at a time, niced, on the host's
#                    layer cache; tagged <prefix>-{api,actors}:<sha8>
#   smoke            scripts/ci/image-smoke.sh on both images
#   guard            scripts/deploy/check-prod-config.mjs in the new actors image
#   edge install     scripts/deploy/edge.sh install (vhost.d, before any recreate)
#   migrate          up --wait postgres; `db:migrate --status`, then apply, from
#                    the NEW actors image
#   up               up -d --remove-orphans --wait
#   edge attach/verify, services/api /healthz, one PingActor turn
#
# ON FAILURE. Before `migrate` nothing running has changed: the attempt is
# recorded as failed and the old stack keeps serving. A failed migrate leaves
# the old app containers serving (they were never touched); if the postgres
# image changed it is re-tagged back. From `up` on, the previous release is
# re-applied in full (its compose files, its images, its vhost files) and
# verified the same way. Migrations are forward-only: whatever part of the new
# release's migrations committed stays committed, and the previous actor host
# boots against it because boot-preflight allows migrations it does not know
# (deploy-loki.md §4.1, "A migration runs while the previous actor host is
# still serving"). A failed sha is not retried automatically — the next new
# sha, or --force, is what tries again.
#
# STATE, under PULL_DEPLOY_HOME (default ~/cellar-prod):
#   DEPLOYED_SHA            full sha of what runs (also read by humans)
#   state/status.json       last check + last attempt + last success
#   state/release.env       API_IMAGE, ACTORS_IMAGE and the two config hashes of
#                           what runs. Exported into every compose call, so a
#                           manual `docker compose` should add
#                           `--env-file state/release.env` after .env.prod, or
#                           it will roll the apps back to .env.prod's images.
#   state/current           symlink to the running release's tree
#   state/paused            present = timer ticks do nothing
#   logs/pull-deploy.log    one line per event; logs/deploy-<sha8>-<ts>.log
#                           holds each attempt's full command output
#
# Configuration: PULL_DEPLOY_CONFIG (default ~/.config/cellar-pull-deploy/config)
# is SOURCED if present, after the environment is read — so it wins.
# infra/loki/pull-deploy.env.example lists every knob.
#
# Exit: 0 deployed / nothing to do / waiting / paused; 1 deploy failed or an
# error; 2 usage or configuration; 3 refused (CI red, not a fast-forward);
# 75 another run holds the lock. Needs bash, git, docker (compose v2 >= 2.24),
# jq, curl, sha256sum, and flock (or perl).
# Step bodies are functions handed to `step` by name, which shellcheck cannot see.
# shellcheck disable=SC2329
set -euo pipefail
umask 077
# cron hands us PATH=/usr/bin:/bin; append (not prepend) so a caller's PATH wins.
PATH="${PATH:-/usr/bin:/bin}:/usr/local/bin:/usr/bin:/bin"

CONFIG="${PULL_DEPLOY_CONFIG:-$HOME/.config/cellar-pull-deploy/config}"
if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090  # operator-owned config, path chosen at runtime
  . "$CONFIG"
fi

DEPLOY_HOME="${PULL_DEPLOY_HOME:-$HOME/cellar-prod}"
REPO_URL="${PULL_DEPLOY_REPO_URL:-https://github.com/MrMint/cellar-assistant.git}"
GH_REPO="${PULL_DEPLOY_GITHUB_REPO:-MrMint/cellar-assistant}"
GH_API="${PULL_DEPLOY_GITHUB_API:-https://api.github.com}"
BRANCH="${PULL_DEPLOY_BRANCH:-main}"
PROJECT="${PULL_DEPLOY_COMPOSE_PROJECT:-cellar-prod}"
ENV_FILE="${PULL_DEPLOY_ENV_FILE:-$DEPLOY_HOME/env/.env.prod}"
IMAGE_PREFIX="${PULL_DEPLOY_IMAGE_PREFIX:-$PROJECT}"
REQUIRED_CHECKS="${PULL_DEPLOY_REQUIRED_CHECKS:-}"
IGNORE_CHECKS="${PULL_DEPLOY_IGNORE_CHECKS:-}"
KEEP_RELEASES="${PULL_DEPLOY_KEEP_RELEASES:-3}"
NICE="${PULL_DEPLOY_NICE:-10}"
EDGE_INSECURE="${PULL_DEPLOY_EDGE_VERIFY_INSECURE:-1}"

STATE="$DEPLOY_HOME/state"
LOGS="$DEPLOY_HOME/logs"
RELEASES="$DEPLOY_HOME/releases"
MIRROR="$DEPLOY_HOME/repo.git"
DEPLOYED_FILE="$DEPLOY_HOME/DEPLOYED_SHA"
PREVIOUS_FILE="$STATE/previous-sha"
RELEASE_ENV="$STATE/release.env"
CURRENT_LINK="$STATE/current"
STATUS="$STATE/status.json"
ATTEMPT="$STATE/last-attempt.json"
SUCCESS="$STATE/last-success.json"
PAUSE="$STATE/paused"
LOG="$LOGS/pull-deploy.log"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Always to the log file; to stderr too when someone (a terminal, or journald
# under the systemd unit) is reading it. Under cron stderr goes to a file of its
# own that should only ever hold what the script could not log itself.
log() {
  local line
  line="$(now) [pull-deploy] $*"
  printf '%s\n' "$line" >> "$LOG"
  if [ -t 2 ] || [ -n "${JOURNAL_STREAM:-}" ]; then printf '%s\n' "$line" >&2; fi
}
die_usage() { echo "pull-deploy: $*" >&2; exit 2; }
is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# ------------------------------------------------------------------ arguments
MODE=run
OPT_SHA=""
FORCE=0
SKIP_CI=0
while [ $# -gt 0 ]; do
  case "$1" in
    status | pause | resume) MODE="$1" ;;
    --sha) OPT_SHA="${2:-}"; [ -n "$OPT_SHA" ] || die_usage "--sha needs a commit"; shift ;;
    --force) FORCE=1 ;;
    --skip-ci) SKIP_CI=1 ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die_usage "unknown argument: $1" ;;
  esac
  shift
done
[ "$SKIP_CI" = 0 ] || [ -n "$OPT_SHA" ] || die_usage "--skip-ci is only allowed with an explicit --sha"
if [ -n "$OPT_SHA" ] && ! [[ "$OPT_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then die_usage "--sha must be 7-40 lowercase hex"; fi
[[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] && [ "$KEEP_RELEASES" -ge 2 ] || die_usage "PULL_DEPLOY_KEEP_RELEASES must be >= 2"
[[ "$IMAGE_PREFIX" =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || die_usage "PULL_DEPLOY_IMAGE_PREFIX is not an image name"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die_usage "PULL_DEPLOY_COMPOSE_PROJECT is not a compose project name"

mkdir -p "$STATE" "$LOGS" "$RELEASES"
chmod 700 "$STATE"

# ------------------------------------------------------------------ status
read_file() { [ -f "$1" ] && tr -d '[:space:]' < "$1" || true; }
json_or_null() { if [ -s "$1" ]; then cat "$1"; else echo null; fi; }

# The outcome of this tick: noop | waiting | refused | held | paused | deploying
# | deployed | failed | error. Logged only when it differs from the last one, so
# a five-minute timer does not write 288 identical lines a day.
check_outcome() {
  local outcome="$1" target="$2" message="$3" prev
  prev="$(jq -r '[.check.outcome, .check.target_sha, .check.message] | join("|")' "$STATUS" 2> /dev/null || true)"
  if [ "$prev" != "$outcome|$target|$message" ]; then log "$outcome${target:+ $target}: $message"; fi
  jq -n \
    --arg checked_at "$(now)" --arg branch "$BRANCH" --arg repo "$GH_REPO" \
    --arg deployed "$(read_file "$DEPLOYED_FILE")" --arg previous "$(read_file "$PREVIOUS_FILE")" \
    --arg outcome "$outcome" --arg target "$target" --arg message "$message" \
    --argjson paused "$([ -e "$PAUSE" ] && echo true || echo false)" \
    --argjson attempt "$(json_or_null "$ATTEMPT")" --argjson success "$(json_or_null "$SUCCESS")" \
    'def nn: if . == "" then null else . end;
     {schema: 1, checked_at: $checked_at, repo: $repo, branch: $branch,
      deployed_sha: ($deployed | nn), previous_sha: ($previous | nn),
      paused: $paused,
      check: {outcome: $outcome, target_sha: ($target | nn), message: $message},
      last_attempt: $attempt, last_success: $success}' > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
}

RUN_STARTED=""
RUNLOG=""
attempt_write() { # sha result step message finished
  jq -n --arg sha "$1" --arg result "$2" --arg step "$3" --arg message "$4" \
    --arg started "$RUN_STARTED" --arg finished "$5" --arg log "$RUNLOG" \
    'def nn: if . == "" then null else . end;
     {sha: $sha, result: $result, step: $step, message: $message, started_at: $started,
      finished_at: ($finished | nn), log: $log}' > "$ATTEMPT.tmp"
  mv "$ATTEMPT.tmp" "$ATTEMPT"
}

case "$MODE" in
  status)
    if [ -f "$STATUS" ]; then jq . "$STATUS"; else echo "no status yet ($STATUS)"; fi
    exit 0 ;;
esac

# ------------------------------------------------------------------ lock
# One run at a time, timer or human. flock(1) on Linux; perl's flock where the
# util-linux binary is missing (macOS, where the self-test runs). Both lock the
# open file description fd 9 refers to, which outlives the helper process.
exec 9>> "$STATE/lock"
take_lock() {
  if command -v flock > /dev/null 2>&1; then
    flock -n 9
  else
    perl -MFcntl=:flock -e 'open(my $fh, ">&=", 9) or exit 2; flock($fh, LOCK_EX | LOCK_NB) or exit 1; exit 0'
  fi
}
if ! take_lock; then
  log "another pull-deploy run holds $STATE/lock; exiting"
  exit 75
fi

case "$MODE" in
  pause)
    touch "$PAUSE"
    check_outcome paused "" "paused by $(id -un) — timer runs do nothing until 'pull-deploy.sh resume'"
    exit 0 ;;
  resume)
    rm -f "$PAUSE"
    check_outcome noop "" "resumed by $(id -un)"
    exit 0 ;;
esac

if [ -e "$PAUSE" ] && [ -z "$OPT_SHA" ]; then
  check_outcome paused "" "paused — 'pull-deploy.sh resume' to re-enable, or deploy explicitly with --sha"
  exit 0
fi

for tool in git docker jq curl sha256sum tar nice; do
  command -v "$tool" > /dev/null 2>&1 || { log "missing required tool: $tool"; exit 2; }
done
if [ -z "${NGINX_PROXY_VHOST_DIR:-}" ]; then
  check_outcome error "" "NGINX_PROXY_VHOST_DIR is not set (the host path nginx-proxy mounts at /etc/nginx/vhost.d; $CONFIG)"
  exit 2
fi
export NGINX_PROXY_VHOST_DIR
[ -z "${NGINX_PROXY_CONTAINER:-}" ] || export NGINX_PROXY_CONTAINER
[ -z "${NGINX_PROXY_NETWORK:-}" ] || export NGINX_PROXY_NETWORK
[ -f "$ENV_FILE" ] || { check_outcome error "" "env file $ENV_FILE not found (deploy-loki.md §2.4)"; exit 2; }

# ------------------------------------------------------------------ git
mirror_fetch() {
  [ -d "$MIRROR" ] || git init -q --bare "$MIRROR"
  git -C "$MIRROR" fetch -q --no-tags "$REPO_URL" "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
}

DEPLOYED="$(read_file "$DEPLOYED_FILE")"
TARGET=""
if [ -n "$OPT_SHA" ]; then
  mirror_fetch || { check_outcome error "" "git fetch of $BRANCH from $REPO_URL failed"; exit 1; }
  TARGET="$(git -C "$MIRROR" rev-parse -q --verify "$OPT_SHA^{commit}" 2> /dev/null || true)"
  if [ -z "$TARGET" ] || ! git -C "$MIRROR" merge-base --is-ancestor "$TARGET" "refs/remotes/origin/$BRANCH"; then
    check_outcome refused "$OPT_SHA" "not a commit reachable from $BRANCH; only commits on $BRANCH are deployed"
    exit 3
  fi
  if [ "$TARGET" = "$DEPLOYED" ] && [ "$FORCE" = 0 ]; then
    check_outcome noop "$TARGET" "already deployed (add --force to redeploy it)"
    exit 0
  fi
else
  REMOTE="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2> /dev/null | cut -f1 || true)"
  is_sha "$REMOTE" || { check_outcome error "" "git ls-remote found no $BRANCH at $REPO_URL"; exit 1; }
  if [ "$REMOTE" = "$DEPLOYED" ] && [ "$FORCE" = 0 ]; then
    check_outcome noop "$REMOTE" "already deployed"
    exit 0
  fi
  mirror_fetch || { check_outcome error "$REMOTE" "git fetch of $BRANCH from $REPO_URL failed"; exit 1; }
  # The branch may have moved since ls-remote; deploy what was fetched.
  TARGET="$(git -C "$MIRROR" rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")"
  if [ "$TARGET" = "$DEPLOYED" ] && [ "$FORCE" = 0 ]; then
    check_outcome noop "$TARGET" "already deployed"
    exit 0
  fi
  # Forward only. A force-push that rewinds or replaces the branch is not
  # followed automatically; a human deploys such a commit with --sha.
  if [ -n "$DEPLOYED" ] && [ "$TARGET" != "$DEPLOYED" ] \
    && ! git -C "$MIRROR" merge-base --is-ancestor "$DEPLOYED" "$TARGET" 2> /dev/null; then
    check_outcome refused "$TARGET" "not a fast-forward of the deployed ${DEPLOYED:0:12}; deploy it explicitly with --sha if intended"
    exit 3
  fi
fi

# A sha whose last attempt failed is held until a new sha or --force.
if [ "$FORCE" = 0 ] && [ -s "$ATTEMPT" ]; then
  last="$(jq -r '"\(.sha) \(.result) \(.step)"' "$ATTEMPT")"
  case "$last" in
    "$TARGET ok "*) ;;
    "$TARGET "*)
      check_outcome held "$TARGET" "last attempt ended '${last#* }'; push a new commit or run with --force"
      exit 0 ;;
  esac
fi

# ------------------------------------------------------------------ CI gate
# Unauthenticated read of the commit's check-runs (60 requests/hour/IP; only
# made when there is something new to deploy). The API's default filter is the
# latest run of each check, so a re-run that went green counts as green.
ci_gate() {
  local sha="$1" json verdict
  json="$(curl -fsS --max-time 30 -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "$GH_API/repos/$GH_REPO/commits/$sha/check-runs?per_page=100")" || { CI_MSG="GitHub API request failed"; return 2; }
  verdict="$(jq -r --arg ignore "$IGNORE_CHECKS" --arg required "$REQUIRED_CHECKS" '
    def list: split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0));
    ($ignore | list) as $ign | ($required | list) as $req
    | (.check_runs // []) as $all
    | ($all | map(select(.name as $n | $ign | index($n) | not))) as $runs
    | ($runs | map(select(.status != "completed")) | map(.name)) as $pending
    | ($runs | map(select(.status == "completed" and ((.conclusion // "") | IN("success", "neutral", "skipped") | not)))
        | map("\(.name)=\(.conclusion)")) as $bad
    | ($req | map(select(. as $r | $runs | map(.name) | index($r) | not))) as $missing
    | ($req | map(select(. as $r | $runs | map(select(.name == $r and .conclusion != "success")) | length > 0))) as $notok
    | if (.total_count // 0) > ($all | length) then "refused more than \($all | length) check runs; cannot see them all"
      elif ($bad | length) > 0 then "refused failed: \($bad | join(", "))"
      elif ($notok | length) > 0 then "refused required check not success: \($notok | join(", "))"
      elif ($runs | length) == 0 then "waiting no check runs on this commit yet"
      elif ($pending | length) > 0 then "waiting pending: \($pending | join(", "))"
      elif ($missing | length) > 0 then "waiting required check not reported yet: \($missing | join(", "))"
      else "ok \($runs | length) check runs green"
      end' <<< "$json")" || { CI_MSG="unreadable check-runs response"; return 2; }
  CI_MSG="${verdict#* }"
  case "$verdict" in
    ok\ *) return 0 ;;
    waiting\ *) return 10 ;;
    *) return 11 ;;
  esac
}

if [ "$SKIP_CI" = 1 ]; then
  log "CI gate SKIPPED for $TARGET by $(id -un) (--skip-ci)"
else
  CI_MSG=""
  rc=0; ci_gate "$TARGET" || rc=$?
  case "$rc" in
    0) ;;
    10) check_outcome waiting "$TARGET" "CI: $CI_MSG"; exit 0 ;;
    11) check_outcome refused "$TARGET" "CI: $CI_MSG"; exit 3 ;;
    *) check_outcome error "$TARGET" "CI: $CI_MSG"; exit 1 ;;
  esac
fi

# ------------------------------------------------------------------ deploy
SHORT="${TARGET:0:8}"
RUN_STARTED="$(now)"
RUNLOG="$LOGS/deploy-$SHORT-$(date -u +%Y%m%dT%H%M%SZ).log"
NEW_DIR="$RELEASES/$TARGET"
NEXT_ENV="$STATE/release.env.next"
OLD_ENV=""
if [ -f "$RELEASE_ENV" ]; then cp "$RELEASE_ENV" "$STATE/rollback.env"; OLD_ENV="$STATE/rollback.env"; fi
# The tree the running containers were created from: ours, or — before this
# tool's first deploy — the hand-made ~/cellar-prod/src the first deploy used.
OLD_DIR=""
if [ -L "$CURRENT_LINK" ] && [ -d "$CURRENT_LINK/infra" ]; then
  OLD_DIR="$(cd "$CURRENT_LINK" && pwd -P)"
elif [ -d "$DEPLOY_HOME/src/infra" ]; then
  OLD_DIR="$(cd "$DEPLOY_HOME/src" && pwd -P)"
fi

check_outcome deploying "$TARGET" "deploying ${TARGET:0:12} over ${DEPLOYED:-nothing} (log: $RUNLOG)"

STEP=""
# Every step's output goes to the attempt's own log. Step bodies chain with
# `|| return` because `set -e` does not apply inside a function called from a
# condition.
step() {
  STEP="$1"; shift
  attempt_write "$TARGET" running "$STEP" "" ""
  log "step $STEP"
  printf '\n===== %s %s\n' "$(now)" "$STEP" >> "$RUNLOG"
  local rc=0
  "$@" >> "$RUNLOG" 2>&1 || rc=$?
  [ "$rc" = 0 ] || log "step $STEP failed (exit $rc); see $RUNLOG"
  return "$rc"
}

# `docker compose` for one release: its compose files, the operator's env file,
# and (exported, so it beats the env file) that release's images and hashes.
compose_in() {
  local dir="$1" relenv="$2"; shift 2
  (
    # shellcheck disable=SC1090  # state/release.env*, written by this script
    if [ -n "$relenv" ]; then set -a; . "$relenv"; set +a; fi
    exec nice -n "${COMPOSE_NICE:-0}" docker compose -p "$PROJECT" -f "$dir/infra/docker-compose.yml" \
      -f "$dir/infra/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"
  )
}
edge_in() {
  local dir="$1" relenv="$2"; shift 2
  (
    cd "$dir" || exit 1
    # shellcheck disable=SC1090  # state/release.env*, written by this script
    if [ -n "$relenv" ]; then set -a; . "$relenv"; set +a; fi
    COMPOSE_ENV_FILE="$ENV_FILE" COMPOSE_PROJECT="$PROJECT" exec scripts/deploy/edge.sh "$@"
  )
}

# The bind-mounted config fingerprint, byte-for-byte the function the GitHub
# workflow used, so the labels on running containers stay comparable.
fp() { (cd "$1" && find "$2" -type f ! -name '*.md' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16); }

do_export() {
  if [ ! -d "$NEW_DIR" ]; then
    local tmp="$NEW_DIR.tmp.$$"
    rm -rf "$tmp" && mkdir -p "$tmp" || return 1
    git -C "$MIRROR" archive --format=tar "$TARGET" | tar -x -C "$tmp" || { rm -rf "$tmp"; return 1; }
    mv "$tmp" "$NEW_DIR" || return 1
  fi
  local otel dapr
  otel="$(fp "$NEW_DIR" infra/grafana)" && dapr="$(fp "$NEW_DIR" infra/dapr)" || return 1
  {
    echo "API_IMAGE=$IMAGE_PREFIX-api:$SHORT"
    echo "ACTORS_IMAGE=$IMAGE_PREFIX-actors:$SHORT"
    echo "OTEL_LGTM_CONFIG_HASH=$otel"
    echo "DAPR_CONFIG_HASH=$dapr"
    echo "CELLAR_DEPLOY_SHA=$TARGET"
  } > "$NEXT_ENV"
  cat "$NEXT_ENV"
}

PG_IMAGE="$PROJECT-postgres"
PG_PREV_ID=""
do_build() {
  PG_PREV_ID="$(docker image inspect -f '{{.Id}}' "$PG_IMAGE:latest" 2> /dev/null || true)"
  echo "postgres image before build: ${PG_PREV_ID:-none}"
  # Without --pull, as before: an unchanged infra/postgres rebuilds to the same
  # image ID from the layer cache and recreates nothing.
  COMPOSE_NICE="$NICE" compose_in "$NEW_DIR" "$NEXT_ENV" build postgres || return 1
  docker tag "$PG_IMAGE:latest" "$PG_IMAGE:$SHORT" || return 1
  (cd "$NEW_DIR" && nice -n "$NICE" docker build --progress=plain -t "$IMAGE_PREFIX-actors:$SHORT" -f services/actors/Dockerfile .) || return 1
  (cd "$NEW_DIR" && nice -n "$NICE" docker build --progress=plain -t "$IMAGE_PREFIX-api:$SHORT" -f services/api/Dockerfile .) || return 1
}

do_smoke() {
  "$NEW_DIR/scripts/ci/image-smoke.sh" api "$IMAGE_PREFIX-api:$SHORT" || return 1
  "$NEW_DIR/scripts/ci/image-smoke.sh" actors "$IMAGE_PREFIX-actors:$SHORT" || return 1
}

# Refuse published development secrets and a widened edge (deploy-loki.md §3).
# Both renders go straight down a pipe; the checker prints variable names only.
do_guard() {
  (
    set -o pipefail
    {
      printf '{"dev":'
      env -i PATH="$PATH" HOME="$HOME" ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} \
        docker compose -f "$NEW_DIR/infra/docker-compose.yml" --env-file /dev/null config --format json
      printf ',"prod":'
      compose_in "$NEW_DIR" "$NEXT_ENV" config --format json
      printf '}'
    } | docker run --rm -i --network none --entrypoint node "$IMAGE_PREFIX-actors:$SHORT" \
      --input-type=module -e "$(cat "$NEW_DIR/scripts/deploy/check-prod-config.mjs")"
  )
}

# Expanded inside the container, where DATABASE_URL lives — never here.
# shellcheck disable=SC2016
MIGRATE_CMD='MIGRATE_DATABASE_URL="$DATABASE_URL" exec node /workspace/packages/db/src/migrate/cli.ts'
do_migrate() {
  compose_in "$NEW_DIR" "$NEXT_ENV" up -d --wait --wait-timeout 180 postgres || return 1
  local rc=0
  compose_in "$NEW_DIR" "$NEXT_ENV" run --rm --no-deps -T actors sh -c "$MIGRATE_CMD --status" || rc=$?
  case "$rc" in
    0) echo "migrations: up to date" ;;
    3) echo "migrations: pending — applying" ;;
    *) echo "migrations: --status failed (exit $rc)"; return 1 ;;
  esac
  compose_in "$NEW_DIR" "$NEXT_ENV" run --rm --no-deps -T actors sh -c "$MIGRATE_CMD" || return 1
}

do_up() { compose_in "$1" "$2" up -d --remove-orphans --wait --wait-timeout 300; }

# services/api's /healthz is static, so it proves the container is up; asked
# inside it because Loki's 127.0.0.1:3001 belongs to another service.
do_api_health() {
  compose_in "$1" "$2" exec -T api node --input-type=module -e '
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch("http://127.0.0.1:3001/healthz");
        if (r.ok && (await r.text()) === "ok") { console.log("services/api is healthy"); process.exit(0); }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.error("services/api did not answer /healthz within 60s");
    process.exit(1);
  '
}

# One PingActor turn through actors-dapr — sidecar, placement, app channel, the
# actor host's allow-list, an activation. The sidecar's metadata endpoint was
# measured stale (hostReady=true with the host stopped); a turn cannot be.
do_actor_turn() {
  # shellcheck disable=SC2016  # JavaScript template literals, not shell
  compose_in "$1" "$2" exec -T actors node --input-type=module -e '
    const url = `http://${process.env.DAPR_HOST}:${process.env.DAPR_HTTP_PORT}/v1.0/actors/PingActor/deploy-check/method/ping`;
    const init = {
      method: "POST",
      headers: { "dapr-api-token": process.env.DAPR_API_TOKEN ?? "", "content-type": "application/json" },
      body: JSON.stringify([{ viewerId: null, kind: "system", requestId: "deploy-check" }, "deploy-check"]),
    };
    let last = "no answer";
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(url, init);
        const body = await r.text();
        if (r.ok && JSON.parse(body).pong === true) { console.log(`PingActor answered a turn: ${body}`); process.exit(0); }
        last = `HTTP ${r.status}`;
      } catch (e) { last = String(e?.message ?? e); }
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.error(`no actor turn through actors-dapr within 60s: ${last}`);
    process.exit(1);
  '
}

verify_release() { # dir relenv
  edge_in "$1" "$2" attach || return 1
  EDGE_VERIFY_INSECURE="$EDGE_INSECURE" edge_in "$1" "$2" verify || return 1
  do_api_health "$1" "$2" || return 1
  do_actor_turn "$1" "$2" || return 1
}

# Sets PG_RETAGGED=1 when it had to move the tag (the step runs in this shell).
PG_RETAGGED=0
restore_postgres_tag() {
  local cur
  cur="$(docker image inspect -f '{{.Id}}' "$PG_IMAGE:latest" 2> /dev/null || true)"
  if [ -n "$PG_PREV_ID" ] && [ "$cur" != "$PG_PREV_ID" ]; then
    echo "re-tagging $PG_IMAGE:latest back to $PG_PREV_ID"
    docker tag "$PG_PREV_ID" "$PG_IMAGE:latest" || return 1
    PG_RETAGGED=1
  else
    echo "postgres image unchanged"
  fi
}

finish_failed() { # result message exit
  attempt_write "$TARGET" "$1" "$STEP" "$2" "$(now)"
  check_outcome failed "$TARGET" "$1 at step $STEP: $2"
  exit "${3:-1}"
}

# Re-apply the release that was running before this attempt.
rollback_full() {
  if [ -z "$OLD_DIR" ]; then
    finish_failed failed "no previous release to roll back to; the new images were left running (never taken down)"
  fi
  local failed_step="$STEP" rc=0
  log "rolling back to ${DEPLOYED:-the previous release} ($OLD_DIR)"
  step rollback-postgres-tag restore_postgres_tag \
    && step rollback-edge-install edge_in "$OLD_DIR" "$OLD_ENV" install \
    && step rollback-up do_up "$OLD_DIR" "$OLD_ENV" \
    && step rollback-verify verify_release "$OLD_DIR" "$OLD_ENV" || rc=1
  if [ "$rc" = 0 ]; then
    STEP="$failed_step"
    finish_failed rolled_back "previous release ${DEPLOYED:0:12} re-applied and verified"
  fi
  finish_failed rollback_failed "rollback did not verify — the stack needs a human (failed step $failed_step)"
}

step export do_export || finish_failed failed "nothing running was changed"
step build do_build || finish_failed failed "nothing running was changed"
step smoke do_smoke || finish_failed failed "nothing running was changed"
step guard do_guard || finish_failed failed "nothing running was changed"
step edge-install edge_in "$NEW_DIR" "$NEXT_ENV" install || finish_failed failed "edge.sh restores its own files; nothing else was changed"
if ! step migrate do_migrate; then
  failed_step="$STEP"
  msg="migration failed; the previous app containers were never stopped"
  if ! step migrate-restore-postgres restore_postgres_tag; then
    msg="$msg; restoring the previous postgres image FAILED"
  elif [ "$PG_RETAGGED" = 1 ]; then
    step migrate-restore-postgres compose_in "${OLD_DIR:-$NEW_DIR}" "$OLD_ENV" up -d --wait --wait-timeout 180 postgres \
      || msg="$msg; restoring the previous postgres image FAILED"
  fi
  if [ -n "$OLD_DIR" ] && [ "$OLD_DIR" != "$NEW_DIR" ]; then
    step migrate-restore-edge edge_in "$OLD_DIR" "$OLD_ENV" install || msg="$msg; restoring the previous vhost files FAILED"
  fi
  STEP="$failed_step"
  finish_failed failed "$msg"
fi
step up do_up "$NEW_DIR" "$NEXT_ENV" || rollback_full
step verify verify_release "$NEW_DIR" "$NEXT_ENV" || rollback_full

# ------------------------------------------------------------------ success
mv "$NEXT_ENV" "$RELEASE_ENV"
ln -sfn "$NEW_DIR" "$CURRENT_LINK"
if [ -n "$DEPLOYED" ] && [ "$DEPLOYED" != "$TARGET" ]; then echo "$DEPLOYED" > "$PREVIOUS_FILE"; fi
echo "$TARGET" > "$DEPLOYED_FILE"
chmod 644 "$DEPLOYED_FILE"
# ~/cellar-prod/src is the humans' path into the running tree. Keep it pointing
# at the release when it is ours to manage (a symlink, or absent); a real
# directory there is the first deploy's hand-made tree and is left alone.
if [ -L "$DEPLOY_HOME/src" ] || [ ! -e "$DEPLOY_HOME/src" ]; then ln -sfn "$NEW_DIR" "$DEPLOY_HOME/src"; fi

# Keep the newest KEEP_RELEASES trees and their images; never the running one
# or the one just replaced (a rollback target).
prune() {
  local keep=0 dir sha
  # shellcheck disable=SC2012  # names are 40-hex shas; ls -t is the mtime sort
  ls -1t "$RELEASES" | while IFS= read -r sha; do
    dir="$RELEASES/$sha"
    is_sha "$sha" || continue
    keep=$((keep + 1))
    [ "$keep" -gt "$KEEP_RELEASES" ] || continue
    if [ "$dir" = "$NEW_DIR" ] || [ "$dir" = "$OLD_DIR" ]; then continue; fi
    echo "pruning release $sha"
    rm -rf "$dir"
    docker image rm "$IMAGE_PREFIX-api:${sha:0:8}" "$IMAGE_PREFIX-actors:${sha:0:8}" "$PG_IMAGE:${sha:0:8}" > /dev/null 2>&1 || true
  done
  docker image prune -f > /dev/null 2>&1 || true
}
printf '\n===== %s prune\n' "$(now)" >> "$RUNLOG"
prune >> "$RUNLOG" 2>&1 || log "prune failed (ignored)"
STEP="done"
attempt_write "$TARGET" ok "done" "deployed" "$(now)"
jq -n --arg sha "$TARGET" --arg at "$(now)" '{sha: $sha, at: $at}' > "$SUCCESS"
check_outcome deployed "$TARGET" "deployed and verified"
exit 0
