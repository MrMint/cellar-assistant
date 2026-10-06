#!/usr/bin/env bash
# Per-worktree local development stack: infra in Docker Compose, the two apps
# and their Dapr sidecars as host processes under `dapr run -f`.
#
#   bun run dev:bootstrap         fresh worktree -> seeded stack you can sign into
#   bun run dev:doctor            preflight only: name every silent failure mode
#   bun run dev:up                bring this worktree's stack up
#   bun run dev:down              take it down
#   bun run dev:ports             what are my ports?
#
# Full documentation: docs/architecture/local-dev-stacks.md
#
# ## The hazard this exists to prevent
#
# Actor calls in this repo go to the *calling app's own sidecar*
# (`services/actors/src/lib/sidecar.ts`, `services/api/src/dapr.ts`), and Dapr placement
# routes them **by actor type**. Two actor hosts that register `ItemActor`
# against the same placement service are one virtual-actor cluster: worktree A's
# API can have its call served by worktree B's process, against B's database.
# Unique app-ids do not help — the actor type names are what collide.
#
# So each stack gets its own placement *and* scheduler, in its own compose
# project, on its own ports. `scripts/stack/isolation-proof.sh` demonstrates it.
#
# ## bash 3.2
#
# macOS ships bash 3.2. No associative arrays, no `${var,,}`, no `mapfile`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# `CELLAR_ENV_FILE` overrides it. Only two callers want that: a test that has to
# exercise the "no infra/.env" path without moving the live one out from under a
# running stack, and anyone keeping two sets of local secrets.
ENV_FILE="${CELLAR_ENV_FILE:-$REPO_ROOT/infra/.env}"
TEMPLATE="$REPO_ROOT/dapr.template.yaml"
COMPOSE_BASE="$REPO_ROOT/infra/docker-compose.yml"
COMPOSE_HOSTRUN="$REPO_ROOT/infra/docker-compose.hostrun.yml"
DAPRD_BIN="${DAPRD_BIN:-$HOME/.dapr/bin/daprd}"

# The infra services this lane starts. `api`, `actors`, `api-dapr` and
# `actors-dapr` are deliberately absent: in this lane they are host processes.
# Compose cannot *remove* a service in an overlay, so the list is explicit.
INFRA_SERVICES="postgres minio minio-init placement scheduler otel-lgtm"

# ---------------------------------------------------------------------------
# The port plan.
#
# Every stack is `base + slot * SLOT_STRIDE`. Slot 0 is the shared default
# stack — the `cellar-stack` project, the ports everyone already has in muscle
# memory — and is never handed to a worktree. Slots 1..MAX_SLOT are derived
# from the worktree directory name.
#
# The stride and the maximum slot are not arbitrary: with these bases, no two
# ports from two different slots can land on the same number. `stack.sh
# selftest` proves that by exhaustive check rather than by assertion in a
# comment, and will fail if a base is ever added that breaks it.
# ---------------------------------------------------------------------------
SLOT_STRIDE=20
MAX_SLOT=24

PORT_SPEC='WEB_PORT:3000
API_PORT:3001
ACTORS_PORT:3002
GRAFANA_PORT:3010
API_DAPR_HTTP_PORT:3501
ACTORS_DAPR_HTTP_PORT:3502
OTLP_GRPC_PORT:4317
OTLP_HTTP_PORT:4318
POSTGRES_PORT:5433
API_DAPR_METRICS_PORT:9095
ACTORS_DAPR_METRICS_PORT:9096
MINIO_PORT:9100
MINIO_CONSOLE_PORT:9101
API_DAPR_GRPC_PORT:50001
ACTORS_DAPR_GRPC_PORT:50002
API_DAPR_INTERNAL_GRPC_PORT:50003
ACTORS_DAPR_INTERNAL_GRPC_PORT:50004
PLACEMENT_PORT:50005
SCHEDULER_PORT:50006'

# Read from infra/.env and exported into the `dapr run` environment, which both
# apps and both sidecars inherit. Everything here must be safe for `services/api` to
# see — `selftest` cross-checks this list against the forbidden list that
# `assertNoDatabaseCredentials` actually enforces, read out of the source file.
# Every AI variable the actor host reads must be on it (the model overrides and
# VERTEX_AI_EMBEDDING_LOCATION were not, so setting one in infra/.env did
# nothing in this lane); services/actors/src/lib/ai/env-passthrough.test.ts
# derives those names from the config reader and fails on a missing one.
PASSTHROUGH_ENV='MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
MINIO_BUCKET
BETTER_AUTH_SECRET
AUTH_REHASH_ON_SIGNIN
AUTH_PASSWORD_MODE
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
FACEBOOK_OAUTH_CLIENT_ID
FACEBOOK_OAUTH_CLIENT_SECRET
DISCORD_OAUTH_CLIENT_ID
DISCORD_OAUTH_CLIENT_SECRET
GOOGLE_AI_API_KEY
GOOGLE_GCP_PROJECT_ID
GOOGLE_GCP_LOCATION
GOOGLE_APPLICATION_CREDENTIALS
GOOGLE_APPLICATION_CREDENTIALS_JSON
AI_PROVIDER
AI_EMBEDDING_DIMENSIONS
AI_REQUEST_TIMEOUT_MS
OLLAMA_EMBEDDING_MODEL
OLLAMA_MODEL_LOW
OLLAMA_MODEL_MEDIUM
OLLAMA_MODEL_HIGH
OPENAI_COMPAT_ENDPOINT
OPENAI_COMPAT_EMBEDDING_ENDPOINT
OPENAI_COMPAT_API_KEY
OPENAI_COMPAT_MODEL_LOW
OPENAI_COMPAT_MODEL_MEDIUM
OPENAI_COMPAT_MODEL_HIGH
OPENAI_COMPAT_EMBEDDING_MODEL
OPENAI_COMPAT_MAX_TOKENS
OPENAI_COMPAT_EMBEDDING_TRUNCATE
VERTEX_AI_EMBEDDING_LOCATION
GOOGLE_AI_MODEL_LOW
GOOGLE_AI_MODEL_MEDIUM
GOOGLE_AI_MODEL_HIGH
GOOGLE_AI_EMBEDDING_MODEL
VERTEX_AI_MODEL_LOW
VERTEX_AI_MODEL_MEDIUM
VERTEX_AI_MODEL_HIGH
VERTEX_AI_EMBEDDING_MODEL
AI_MODEL_PRICES
AI_BUDGET_MAX_REQUESTS
BUDGET_USER_CAPS
DAPR_API_TOKEN
APP_API_TOKEN'

# The names in the environment as this script INHERITED it, captured before
# anything here computes a variable of its own. `doctor` needs to ask what the
# *caller* exported — `resolve` sets DATABASE_URL in this shell, so asking the
# live environment later always answers "yes, DATABASE_URL is set". Names only:
# the values are credentials and are never read, printed or logged.
INHERITED_ENV="$(env 2>/dev/null | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | sort -u || true)"

# The JavaScript this script itself runs — the compose-project JSON reshape, the
# port-collision proof, the run-file renderer. **bun first, node as the
# fallback.** bun is the pinned toolchain (`packageManager`), and a wrong Node is
# routine here while a missing bun is not; with `node` alone, a bun-only machine
# made `selftest` report the port plan as broken and `prune` see no projects at
# all. All three inputs are plain ESM/CommonJS with `node:` imports, which both
# runtimes read identically.
js() {
  if command -v bun >/dev/null 2>&1; then bun "$@"; else node "$@"; fi
}

say()  { printf '==> %s\n' "$*" >&2; }
warn() { printf 'WARN %s\n' "$*" >&2; }
die()  { printf 'ERROR %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# infra/.env is read key by key rather than sourced. Sourcing it would export
# POSTGRES_PASSWORD into every child, and `services/api` refuses to start when it
# can see one (`assertNoDatabaseCredentials`). This reads values without
# executing the file and without exporting anything by accident.
# ---------------------------------------------------------------------------
env_value() { # env_value KEY DEFAULT
  local line value
  line=''
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null | tail -1 || true)"
  fi
  if [ -z "$line" ]; then printf '%s' "$2"; return 0; fi
  value="${line#*=}"
  # strip one layer of surrounding quotes, and trailing whitespace
  value="$(printf '%s' "$value" | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
  if [ -z "$value" ]; then printf '%s' "$2"; else printf '%s' "$value"; fi
}

# --- Dapr API tokens ----------------------------------------------------------
# Both sidecars run with DAPR_API_TOKEN (every caller of the sidecar API must
# present it as `dapr-api-token`) and APP_API_TOKEN (what a sidecar presents
# to its app; the actors app refuses /actors/* without it). `dapr run` hands
# its environment to both apps and both sidecars, so exporting the pair from
# `export_passthrough` configures all four at once. The defaults are the same
# PUBLISHED development values infra/docker-compose.yml uses — this lane then
# enforces tokens exactly as production does. docs/architecture/target-stack.md,
# "Dapr API tokens".
DEV_DAPR_API_TOKEN='cellar-dev-dapr-api-token'
DEV_APP_API_TOKEN='cellar-dev-app-api-token'

# The sidecar API token this script's own curl calls present.
dapr_api_token() {
  if [ -n "${DAPR_API_TOKEN:-}" ]; then printf '%s' "$DAPR_API_TOKEN"; return 0; fi
  env_value DAPR_API_TOKEN "$DEV_DAPR_API_TOKEN"
}

# The same resolution — environment, then infra/.env (CELLAR_ENV_FILE), then
# the published default — for the harnesses that call a sidecar themselves
# (isolation-proof.sh, namespace-experiment.sh, services/actors/scripts/soak).
# Each used to hard-code env → default, skipping infra/.env, so a developer who
# set DAPR_API_TOKEN there got 401s from all three while `dev:up` was fine.
# One implementation, captured, never logged: it refuses to write to a terminal.
cmd_dapr_token() {
  if [ -t 1 ]; then
    die "dapr-token prints a credential for a harness to capture: TOKEN=\"\$(scripts/stack/stack.sh dapr-token)\""
  fi
  dapr_api_token
}

# --- E5b · the one BETTER_AUTH_SECRET that must never be accepted -----------
# `infra/.env.example` shipped this value for the whole life of the migration,
# and the file is tracked — so it is public, and `dev:doctor`'s old test ("is
# it non-empty?") reported green on it. better-auth encrypts the JWKS *private*
# key at rest with this secret, so holding it is enough to forge an admin token
# against any instance still running it.
#
# Matched by digest, not by the literal, so that removing the value from the
# repository does not put it straight back in this script.
PUBLISHED_AUTH_SECRET_SHA256=0c67b0ad05ba5b8eb543d429551db72b011d011f432ae74c96deada65ae8c11d

sha256_of() { # sha256_of STRING -> hex, or empty when no hasher is installed
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | cut -d' ' -f1
  fi
}

is_published_secret() { # is_published_secret VALUE
  [ -n "$1" ] || return 1
  [ "$(sha256_of "$1")" = "$PUBLISHED_AUTH_SECRET_SHA256" ]
}

# Rewrite BETTER_AUTH_SECRET in $ENV_FILE with a fresh `openssl rand -base64 32`,
# in place and keeping the surrounding comments. Replaces the *first* occurrence
# and drops any later ones — `env_value` reads the last line, so leaving a
# duplicate behind would let the old value keep winning. Never echoes the value.
replace_auth_secret() {
  local secret tmp
  secret="$(openssl rand -base64 32 2>/dev/null || true)"
  [ -n "$secret" ] || return 1
  tmp="$ENV_FILE.tmp.$$"
  if grep -qE '^[[:space:]]*BETTER_AUTH_SECRET[[:space:]]*=' "$ENV_FILE" 2>/dev/null; then
    AUTH_SECRET_NEW="$secret" awk '
      /^[[:space:]]*BETTER_AUTH_SECRET[[:space:]]*=/ {
        if (!done) { print "BETTER_AUTH_SECRET=" ENVIRON["AUTH_SECRET_NEW"]; done = 1 }
        next
      }
      { print }
    ' "$ENV_FILE" > "$tmp" || { rm -f "$tmp"; return 1; }
  else
    cp "$ENV_FILE" "$tmp" || return 1
    printf 'BETTER_AUTH_SECRET=%s\n' "$secret" >> "$tmp" || { rm -f "$tmp"; return 1; }
  fi
  mv "$tmp" "$ENV_FILE"
}

slugify() { # slugify STRING
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//'
}

slot_for_slug() { # slot_for_slug SLUG -> 1..MAX_SLOT
  local hex dec
  hex="$(printf '%s' "$1" | shasum -a 256 | cut -c1-6)"
  dec=$((16#$hex))
  printf '%s' $(( dec % MAX_SLOT + 1 ))
}

port_for() { # port_for NAME SLOT
  local base
  base="$(printf '%s\n' "$PORT_SPEC" | sed -n "s/^$1://p")"
  [ -n "$base" ] || die "unknown port name: $1"
  printf '%s' $(( base + $2 * SLOT_STRIDE ))
}

listening_ports() {
  lsof -nP -iTCP -sTCP:LISTEN -F n 2>/dev/null \
    | sed -n 's/^n.*:\([0-9][0-9]*\)$/\1/p' | sort -u
}

slot_is_free() { # slot_is_free SLOT LISTENING
  local name base port
  for name in $(printf '%s\n' "$PORT_SPEC" | cut -d: -f1); do
    base="$(printf '%s\n' "$PORT_SPEC" | sed -n "s/^$name://p")"
    port=$(( base + $1 * SLOT_STRIDE ))
    case "
$2
" in *"
$port
"*) return 1 ;; esac
  done
  return 0
}

# ---------------------------------------------------------------------------
# Resolve this worktree's identity, ports and paths, and export them.
#
# Deterministic first: the slot comes from a hash of the worktree directory
# name, so it is the same on every restart and predictable in a log. Collisions
# between two worktrees that hash to the same slot are handled explicitly — the
# first free slot after the derived one is taken and *pinned* to a file, so it
# too is stable from then on.
# ---------------------------------------------------------------------------
resolve() { # resolve [--reset]
  local reset=0
  [ "${1:-}" = "--reset" ] && reset=1

  WORKTREE_DIR="$REPO_ROOT"
  STACK_SLUG="${CELLAR_STACK_SLUG:-$(slugify "$(basename "$WORKTREE_DIR")")}"
  [ -n "$STACK_SLUG" ] || die "could not derive a slug from $WORKTREE_DIR"
  STACK_DIR="$REPO_ROOT/.stack/$STACK_SLUG"
  PIN_FILE="$STACK_DIR/slot"

  if [ -n "${CELLAR_STACK_SLOT:-}" ]; then
    STACK_SLOT="$CELLAR_STACK_SLOT"
    STACK_SLOT_SOURCE="CELLAR_STACK_SLOT"
  elif [ "$reset" -eq 0 ] && [ -f "$PIN_FILE" ]; then
    STACK_SLOT="$(cat "$PIN_FILE")"
    STACK_SLOT_SOURCE="pinned ($PIN_FILE)"
  else
    local derived candidate listening i
    derived="$(slot_for_slug "$STACK_SLUG")"
    listening="$(listening_ports)"
    STACK_SLOT=""
    i=0
    while [ "$i" -lt "$MAX_SLOT" ]; do
      candidate=$(( (derived - 1 + i) % MAX_SLOT + 1 ))
      if slot_is_free "$candidate" "$listening"; then
        STACK_SLOT="$candidate"
        break
      fi
      i=$(( i + 1 ))
    done
    [ -n "$STACK_SLOT" ] && [ "$STACK_SLOT" = "$derived" ] \
      && STACK_SLOT_SOURCE="derived from \"$STACK_SLUG\"" \
      || STACK_SLOT_SOURCE="derived $derived, moved to $STACK_SLOT (ports in use)"
    [ -n "$STACK_SLOT" ] || die \
      "all $MAX_SLOT slots have ports in use. Free one (scripts/stack/stack.sh prune), or pin with CELLAR_STACK_SLOT."
    mkdir -p "$STACK_DIR"
    printf '%s\n' "$STACK_SLOT" > "$PIN_FILE"
  fi

  STACK_OFFSET=$(( STACK_SLOT * SLOT_STRIDE ))
  COMPOSE_PROJECT_NAME="cellar-$STACK_SLUG"

  local name
  for name in $(printf '%s\n' "$PORT_SPEC" | cut -d: -f1); do
    eval "$name=\$(port_for $name $STACK_SLOT)"
    eval "export $name"
  done

  # Values that live in infra/.env but must NOT be exported (see env_value).
  PG_USER="$(env_value POSTGRES_USER cellar)"
  PG_PASSWORD="$(env_value POSTGRES_PASSWORD cellar)"
  PG_DB="$(env_value POSTGRES_DB cellar)"

  DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@127.0.0.1:$POSTGRES_PORT/$PG_DB"
  BETTER_AUTH_URL="http://localhost:$ACTORS_PORT"
  AUTH_TRUSTED_ORIGINS="http://localhost:$WEB_PORT"
  # The browser origin the object store answers CORS for, read by `minio` and
  # `minio-init` in infra/docker-compose.yml. This lane's Next dev server is the
  # one origin that uploads to this lane's MinIO, so it is the same single
  # origin as AUTH_TRUSTED_ORIGINS, not the base file's 3000/3003 default.
  FILES_CORS_ALLOWED_ORIGINS="http://localhost:$WEB_PORT"
  OLLAMA_ENDPOINT="${OLLAMA_ENDPOINT:-http://localhost:11434}"
  ACTORS_APP_ID="actors-$STACK_SLUG"
  API_APP_ID="api-$STACK_SLUG"
  MINIO_BUCKET="$(env_value MINIO_BUCKET cellar-files)"

  # What the scheduler container must tell host sidecars to dial, rather than
  # its own container IP. Read by infra/docker-compose.hostrun.yml.
  SCHEDULER_BROADCAST="127.0.0.1:$SCHEDULER_PORT"

  # DATABASE_URL is deliberately ABSENT from this export list, and must stay
  # absent. `dapr run` hands its own environment to both apps, and `services/api`
  # exits on boot if it can see a database credential
  # (`assertNoDatabaseCredentials`). It reaches the renderer as a one-shot
  # assignment in `generate_dapr_resources` instead, so it lands only in the
  # actors app's `env:` block. Not a guess: exporting it here is what the first
  # version of this script did, and services/api refused to start with
  # "must not hold database credentials, but found: DATABASE_URL".
  # The Prometheus config otel-lgtm mounts in this lane, generated by
  # `generate_prometheus_config`. Read by infra/docker-compose.hostrun.yml.
  HOSTRUN_PROMETHEUS_CONFIG="$STACK_DIR/prometheus.yaml"

  export SCHEDULER_BROADCAST COMPOSE_PROJECT_NAME STACK_SLUG STACK_SLOT \
    STACK_OFFSET STACK_DIR REPO_ROOT BETTER_AUTH_URL AUTH_TRUSTED_ORIGINS \
    FILES_CORS_ALLOWED_ORIGINS \
    OLLAMA_ENDPOINT ACTORS_APP_ID API_APP_ID MINIO_BUCKET \
    HOSTRUN_PROMETHEUS_CONFIG
}

# Export the passthrough set into the environment `dapr run` hands to both apps
# and both sidecars. Only names on PASSTHROUGH_ENV, only when infra/.env or the
# caller's environment actually has a value.
export_passthrough() {
  local name value
  for name in $PASSTHROUGH_ENV; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || value="$(env_value "$name" "")"
    if [ -n "$value" ]; then
      eval "$name=\$value"
      eval "export $name"
    fi
  done
  # Defaults for the local-AI lane, so a fresh worktree with no infra/.env still
  # gets the same provider the compose lane defaults to.
  export AI_PROVIDER="${AI_PROVIDER:-ollama}"
  export OLLAMA_EMBEDDING_MODEL="${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}"
  export OLLAMA_MODEL_LOW="${OLLAMA_MODEL_LOW:-gemma3:4b}"
  export OLLAMA_MODEL_MEDIUM="${OLLAMA_MODEL_MEDIUM:-gemma3:4b}"
  export OLLAMA_MODEL_HIGH="${OLLAMA_MODEL_HIGH:-gemma3:4b}"
  export AI_EMBEDDING_DIMENSIONS="${AI_EMBEDDING_DIMENSIONS:-768}"
  export MINIO_ROOT_USER="${MINIO_ROOT_USER:-cellar}"
  export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-cellar-dev-secret}"
  # See "Dapr API tokens" above: all four processes read these two names.
  export DAPR_API_TOKEN="${DAPR_API_TOKEN:-$DEV_DAPR_API_TOKEN}"
  export APP_API_TOKEN="${APP_API_TOKEN:-$DEV_APP_API_TOKEN}"
}

compose() { docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_HOSTRUN" "$@"; }

# ---------------------------------------------------------------------------
# otel-lgtm's Prometheus config, for THIS stack.
#
# `infra/grafana/otel-lgtm/prometheus.yaml` scrapes the two sidecars as
# `actors-dapr:9090` / `api-dapr:9090` — compose service names, correct in the
# all-compose lanes and meaningless here, where the sidecars are host processes
# serving metrics on this stack's derived ACTORS_/API_DAPR_METRICS_PORT. Left
# alone, both targets report `up == 0` and every sidecar panel is empty.
#
# Same move as `generate_dapr_resources`: regenerate from the one committed
# file, rewriting only the two quoted targets to `host.docker.internal:<port>`
# (daprd's metrics server listens on 0.0.0.0 by default; the hostrun overlay
# adds the `host-gateway` mapping Linux needs). The overlay mounts the result
# over the base file's mount — compose merges `volumes` by container path.
#
# Written in place (`>` truncates the same inode, where `mv` would swap it) and
# before `compose up`: a single-file bind mount pins the inode, and a mount
# source that does not exist yet is created by Docker as an empty DIRECTORY,
# which Prometheus then fails to read. Asserted, like the Dapr rewrite, rather
# than trusted.
# ---------------------------------------------------------------------------
generate_prometheus_config() {
  local src="$REPO_ROOT/infra/grafana/otel-lgtm/prometheus.yaml"
  local actors_t="host.docker.internal:$ACTORS_DAPR_METRICS_PORT"
  local api_t="host.docker.internal:$API_DAPR_METRICS_PORT"
  mkdir -p "$STACK_DIR"
  # The empty directory an earlier, config-less `up` may have left behind.
  if [ -d "$HOSTRUN_PROMETHEUS_CONFIG" ]; then rmdir "$HOSTRUN_PROMETHEUS_CONFIG"; fi
  {
    printf '# GENERATED by scripts/stack/stack.sh from infra/grafana/otel-lgtm/prometheus.yaml\n'
    printf '# Stack "%s" (slot %s). Edit the source file, not this one.\n' "$STACK_SLUG" "$STACK_SLOT"
    sed -e "s|\"actors-dapr:9090\"|\"$actors_t\"|g" -e "s|\"api-dapr:9090\"|\"$api_t\"|g" "$src"
  } > "$HOSTRUN_PROMETHEUS_CONFIG"

  grep -q "\"$actors_t\"" "$HOSTRUN_PROMETHEUS_CONFIG" \
    && grep -q "\"$api_t\"" "$HOSTRUN_PROMETHEUS_CONFIG" \
    && ! grep -q '"actors-dapr:9090"\|"api-dapr:9090"' "$HOSTRUN_PROMETHEUS_CONFIG" \
    || die "generated $HOSTRUN_PROMETHEUS_CONFIG does not scrape $actors_t and $api_t — the sidecar target rewrite did not match. Check the dapr-sidecar job in infra/grafana/otel-lgtm/prometheus.yaml."
}

# Every `up` of this lane's infra goes through here, so the generated
# Prometheus config always exists before otel-lgtm's mount needs it.
compose_up_infra() {
  generate_prometheus_config
  # shellcheck disable=SC2086
  compose up -d $INFRA_SERVICES
}

# Stop this stack's host processes (apps + sidecars), if any are running.
stop_run_for_stack() {
  local f
  for f in "$STACK_DIR"/dapr*.yaml; do
    [ -f "$f" ] || continue
    dapr stop -f "$f" >/dev/null 2>&1 || true
  done
  for f in "$STACK_DIR"/*.pid; do
    [ -f "$f" ] || continue
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  done
}

# ---------------------------------------------------------------------------
# Generated Dapr resources.
#
# `infra/dapr/components/` and `infra/dapr/config.yaml` are written for the
# all-compose lane, where the MinIO authority (`minio:9000`, or
# `files.localhost:9100` once E3 lands) and `otel-lgtm:4318` are the right names.
# The 1.18 component-schema reference lists four templated metadata values —
# {uuid}, {podName}, {namespace}, {appID} — and no environment interpolation, so
# a component file cannot carry a per-worktree port. The host lane's copies are
# generated here from those same files on every `up`: one source of truth,
# regenerated rather than duplicated. The grep below asserts the rewrite landed,
# so this does not rest on that reference staying accurate.
#
# The rewrite is asserted, not assumed: if the expected endpoint is not present
# in the output, this fails instead of starting a stack whose presigned URLs
# point at a hostname the browser cannot resolve.
# ---------------------------------------------------------------------------
generate_dapr_resources() {
  local src_components="$REPO_ROOT/infra/dapr/components"
  local out_components="$STACK_DIR/dapr/components"
  local minio_endpoint="http://localhost:$MINIO_PORT"

  rm -rf "$STACK_DIR/dapr"
  mkdir -p "$out_components"

  local f base
  for f in "$src_components"/*.yaml; do
    base="$(basename "$f")"
    {
      printf '# GENERATED by scripts/stack/stack.sh from infra/dapr/components/%s\n' "$base"
      printf '# Stack "%s" (slot %s). Edit the source file, not this one.\n' "$STACK_SLUG" "$STACK_SLOT"
      # `minio:9000` is the binding's authority PERMANENTLY, as of E3
      # (`10fde2b2`), so this one pattern is the whole rewrite. E3 looked for a
      # single name reachable from both a host browser and a container and
      # established there isn't one on Docker Desktop for macOS: `.localhost`
      # works in a browser precisely because Bun and Chromium hard-map
      # `*.localhost` to loopback without reading /etc/hosts, which is what
      # makes it unusable from inside a container. So the compose lane signs two
      # authorities in-process instead (`FILES_S3_*` browser-facing,
      # `FILES_S3_INTERNAL_*` in-network) and leaves every call the SIDECAR
      # makes through this binding server-side.
      #
      # The host-run lane needs neither, and not by luck: app and sidecar are
      # both host processes, so `localhost:<MINIO_PORT>` is correct from both
      # positions — which is exactly the "one name is correct from both sides"
      # case `filesS3InternalConfig` returns unchanged when
      # FILES_S3_INTERNAL_ENDPOINT is unset. `dapr.template.yaml` therefore sets
      # only the public pair, and must keep doing so.
      sed -e "s|http://minio:9000|$minio_endpoint|g" "$f"
    } > "$out_components/$base"
  done

  grep -q "endpoint: \"$minio_endpoint\"\|value: \"$minio_endpoint\"" \
    "$out_components/files-binding.yaml" \
    || die "generated files-binding.yaml does not point at $minio_endpoint — the S3 endpoint rewrite did not match. Check infra/dapr/components/files-binding.yaml."

  {
    printf '# GENERATED by scripts/stack/stack.sh from infra/dapr/config.yaml\n'
    sed -e "s|otel-lgtm:4318|127.0.0.1:$OTLP_HTTP_PORT|g" "$REPO_ROOT/infra/dapr/config.yaml"
  } > "$STACK_DIR/dapr/config.yaml"

  grep -q "127.0.0.1:$OTLP_HTTP_PORT" "$STACK_DIR/dapr/config.yaml" \
    || die "generated dapr config.yaml does not point at the collector on 127.0.0.1:$OTLP_HTTP_PORT."

  DATABASE_URL="$DATABASE_URL" js "$HERE/render.mjs" "$TEMPLATE" "$STACK_DIR/dapr.yaml"
}

wait_for_postgres() {
  local i=0
  while [ "$i" -lt 60 ]; do
    if compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -q '^postgres healthy$'; then
      return 0
    fi
    sleep 1
    i=$(( i + 1 ))
  done
  die "postgres in project $COMPOSE_PROJECT_NAME did not become healthy within 60s"
}

require_daprd() {
  [ -x "$DAPRD_BIN" ] && return 0
  die "no daprd binary at $DAPRD_BIN.
  This lane runs the sidecars as host processes, so it needs the runtime binary
  (it does NOT need \`dapr init\`'s shared control plane — placement and
  scheduler are per-stack containers). Install the binaries only:

      dapr init --slim --runtime-version 1.18.3

  That writes daprd/placement/scheduler to ~/.dapr/bin and starts nothing."
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_env() {
  resolve "$@"
  local name
  echo "export CELLAR_STACK_SLUG=$STACK_SLUG"
  echo "export CELLAR_STACK_SLOT=$STACK_SLOT"
  echo "export COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME"
  for name in $(printf '%s\n' "$PORT_SPEC" | cut -d: -f1); do
    eval "echo \"export $name=\$$name\""
  done
  echo "export BETTER_AUTH_URL=$BETTER_AUTH_URL"
  echo "export AUTH_TRUSTED_ORIGINS=$AUTH_TRUSTED_ORIGINS"
  echo "export FILES_CORS_ALLOWED_ORIGINS=$FILES_CORS_ALLOWED_ORIGINS"
  echo "export ACTORS_APP_ID=$ACTORS_APP_ID"
  echo "export API_APP_ID=$API_APP_ID"
  echo "# DATABASE_URL is deliberately NOT printed as an export: services/api"
  echo "# refuses to start if it can see one. It reaches services/actors alone,"
  echo "# through the generated .stack/$STACK_SLUG/dapr.yaml."
}

cmd_ports() {
  resolve "$@"
  printf '\n  stack     %s  (slot %s, offset +%s — %s)\n' \
    "$STACK_SLUG" "$STACK_SLOT" "$STACK_OFFSET" "$STACK_SLOT_SOURCE"
  printf '  project   %s\n' "$COMPOSE_PROJECT_NAME"
  printf '  state     %s\n\n' "$STACK_DIR"
  printf '  %-24s %-7s %s\n' "WHAT" "PORT" "URL / NOTE"
  printf '  %-24s %-7s %s\n' "------------------------" "-------" "------------------------------------"
  printf '  %-24s %-7s %s\n' "GraphQL API"        "$API_PORT"    "http://localhost:$API_PORT/graphql"
  printf '  %-24s %-7s %s\n' "actor host / auth"  "$ACTORS_PORT" "http://localhost:$ACTORS_PORT/api/auth"
  printf '  %-24s %-7s %s\n' "Next dev server"    "$WEB_PORT"    "PORT=$WEB_PORT GRAPHQL_API_URL=http://localhost:$API_PORT/graphql BETTER_AUTH_ORIGIN=http://localhost:$ACTORS_PORT MINIO_PORT=$MINIO_PORT bun run dev  (not started by dev:up)"
  printf '  %-24s %-7s %s\n' "Postgres"           "$POSTGRES_PORT" "psql postgres://$PG_USER@127.0.0.1:$POSTGRES_PORT/$PG_DB"
  printf '  %-24s %-7s %s\n' "MinIO S3"           "$MINIO_PORT"  "http://localhost:$MINIO_PORT  (signed host)"
  printf '  %-24s %-7s %s\n' "MinIO console"      "$MINIO_CONSOLE_PORT" "http://localhost:$MINIO_CONSOLE_PORT"
  printf '  %-24s %-7s %s\n' "Grafana"            "$GRAFANA_PORT" "http://localhost:$GRAFANA_PORT"
  printf '  %-24s %-7s %s\n' "OTLP http"          "$OTLP_HTTP_PORT" "collector ingest"
  printf '  %-24s %-7s %s\n' "dapr placement"     "$PLACEMENT_PORT" "per-stack — THIS is the isolation boundary"
  printf '  %-24s %-7s %s\n' "dapr scheduler"     "$SCHEDULER_PORT" "per-stack (reminders)"
  printf '  %-24s %-7s %s\n' "api sidecar http"   "$API_DAPR_HTTP_PORT" "$API_APP_ID"
  printf '  %-24s %-7s %s\n' "actors sidecar http" "$ACTORS_DAPR_HTTP_PORT" "$ACTORS_APP_ID"
  printf '\n'
}

cmd_infra() {
  resolve "$@"
  say "compose project $COMPOSE_PROJECT_NAME: up $INFRA_SERVICES"
  compose_up_infra
  wait_for_postgres
  say "infra ready (postgres $POSTGRES_PORT, minio $MINIO_PORT, placement $PLACEMENT_PORT, scheduler $SCHEDULER_PORT)"
}

cmd_up() {
  local detach=0 args=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --detach|-d) detach=1 ;;
      *) args="$args $1" ;;
    esac
    shift
  done
  # shellcheck disable=SC2086
  resolve $args
  require_daprd
  export_passthrough
  say "stack $STACK_SLUG — slot $STACK_SLOT, offset +$STACK_OFFSET ($STACK_SLOT_SOURCE)"
  # Idempotent on purpose. A second `dapr run -f` for the same stack while the
  # first is alive gives you two daprd sets fighting over the same ports, a
  # placement table that churns through versions as hosts come and go, and
  # `did not find address for actor '<Type>/<id>'` from the survivor. Stop
  # whatever is already running for this stack first.
  stop_run_for_stack
  compose_up_infra
  wait_for_postgres
  generate_dapr_resources
  say "run file: $STACK_DIR/dapr.yaml"
  mkdir -p "$STACK_DIR/logs"
  if [ "$detach" -eq 1 ]; then
    local log="$STACK_DIR/logs/dapr-run.log"
    : > "$log"
    # DAPR_HOST_IP pins what each sidecar registers with placement. Left to
    # daprd it picks a routable interface address; on loopback the two sidecars
    # of one stack find each other unambiguously and nothing is advertised off
    # this machine.
    DAPR_HOST_IP=127.0.0.1 nohup dapr run -f "$STACK_DIR/dapr.yaml" \
      > "$log" 2>&1 &
    echo $! > "$STACK_DIR/dapr-run.pid"
    say "dapr run detached (pid $(cat "$STACK_DIR/dapr-run.pid")); logs: $log"
    say "wait for readiness:  $0 wait"
  else
    say "starting dapr run -f (Ctrl-C stops both apps and both sidecars)"
    DAPR_HOST_IP=127.0.0.1 exec dapr run -f "$STACK_DIR/dapr.yaml"
  fi
}

# ---------------------------------------------------------------------------
# `run-file` — start an arbitrary Multi-App Run file with THIS stack's full
# environment (the passthrough secrets included).
#
# Exists because the isolation proof and the namespace experiment both need to
# start a *variant* run file — one with a different placement address, or a
# NAMESPACE — and a bare `dapr run -f` inherits none of what `up` sets up. The
# first version of the proof did exactly that and stack B's actor host died on
# boot with `[auth] BETTER_AUTH_SECRET is required`, which made the crossed
# phase look like isolation. Any caller that starts a run file goes through
# here.
#
# Anything already exported by the caller (e.g. NAMESPACE) is inherited too.
# ---------------------------------------------------------------------------
cmd_run_file() {
  local file="" log="" pid="" detach=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --detach|-d) detach=1 ;;
      --log) shift; log="$1" ;;
      --pid) shift; pid="$1" ;;
      -*) die "run-file: unknown option $1" ;;
      *) file="$1" ;;
    esac
    shift
  done
  [ -n "$file" ] || die "run-file: no run file given"
  [ -f "$file" ] || die "run-file: no such file: $file"
  resolve
  require_daprd
  export_passthrough
  if [ "$detach" -eq 1 ]; then
    [ -n "$log" ] || log="$STACK_DIR/logs/dapr-run.log"
    [ -n "$pid" ] || pid="$STACK_DIR/dapr-run.pid"
    mkdir -p "$(dirname "$log")"
    : > "$log"
    DAPR_HOST_IP=127.0.0.1 nohup dapr run -f "$file" > "$log" 2>&1 &
    echo $! > "$pid"
    say "dapr run -f $file detached (pid $(cat "$pid")); logs: $log"
  else
    DAPR_HOST_IP=127.0.0.1 exec dapr run -f "$file"
  fi
}

# Readiness is not "the ports answer". The thing every request depends on is an
# actor lookup succeeding through the API's own sidecar — which needs the actor
# host registered AND placement's table disseminated to that sidecar. Those lag
# behind `/healthz` by a second or two on a cold start, and by longer while a
# previous host is still draining. So the last gate is a real `PingActor` call on
# the real path.
actor_path_ok() {
  curl -fsS -m 5 -o /dev/null -X POST \
    "http://127.0.0.1:$API_DAPR_HTTP_PORT/v1.0/actors/PingActor/stack-readycheck/method/ping" \
    -H 'content-type: application/json' \
    -H "dapr-api-token: $(dapr_api_token)" \
    --data-binary '[{"viewerId":null,"kind":"system","requestId":"stack-readycheck"},"ready?"]' \
    >/dev/null 2>&1
}

cmd_wait() {
  resolve "$@"
  local i=0 api_ok=0 actors_ok=0 actor_ok=0
  while [ "$i" -lt 180 ]; do
    curl -fsS -m 2 "http://127.0.0.1:$API_PORT/healthz" >/dev/null 2>&1 && api_ok=1 || api_ok=0
    curl -fsS -m 2 "http://127.0.0.1:$ACTORS_DAPR_HTTP_PORT/v1.0/healthz" >/dev/null 2>&1 \
      && actors_ok=1 || actors_ok=0
    actor_ok=0
    if [ "$api_ok" -eq 1 ] && [ "$actors_ok" -eq 1 ] && actor_path_ok; then actor_ok=1; fi
    if [ "$actor_ok" -eq 1 ]; then
      say "ready: api :$API_PORT, actors sidecar :$ACTORS_DAPR_HTTP_PORT, PingActor reachable via :$API_DAPR_HTTP_PORT"
      return 0
    fi
    sleep 1
    i=$(( i + 1 ))
  done
  die "stack $STACK_SLUG not ready after 180s (api=$api_ok actors-sidecar=$actors_ok actor-lookup=$actor_ok). See $STACK_DIR/logs/dapr-run.log"
}

cmd_down() {
  local volumes=0 force=0 args=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --volumes|-v) volumes=1 ;;
      --force) force=1 ;;
      *) args="$args $1" ;;
    esac
    shift
  done
  # shellcheck disable=SC2086
  resolve $args
  if [ "$COMPOSE_PROJECT_NAME" = "cellar-stack" ] && [ "$force" -eq 0 ]; then
    die "refusing to take down the shared \`cellar-stack\` project. Use \`bun run stack:down\`, or pass --force if you really mean it."
  fi
  say "stopping this stack's host processes"
  stop_run_for_stack
  say "compose down ($COMPOSE_PROJECT_NAME)"
  if [ "$volumes" -eq 1 ]; then compose down --volumes; else compose down; fi
}

cmd_logs() {
  resolve
  local log="$STACK_DIR/logs/dapr-run.log"
  [ -f "$log" ] || die "no log at $log (was the stack started with --detach?)"
  tail -f "$log"
}

cmd_status() {
  resolve
  printf '\nstack %s (slot %s) — project %s\n\n' "$STACK_SLUG" "$STACK_SLOT" "$COMPOSE_PROJECT_NAME"
  compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  printf '\nhost processes:\n'
  pgrep -fl "daprd .*--app-id $ACTORS_APP_ID|daprd .*--app-id $API_APP_ID" 2>/dev/null \
    | sed 's/^/  /' || printf '  (no daprd for this stack)\n'
  printf '\nendpoints:\n'
  local url
  for url in "http://127.0.0.1:$API_PORT/healthz" \
             "http://127.0.0.1:$ACTORS_DAPR_HTTP_PORT/v1.0/healthz" \
             "http://127.0.0.1:$ACTORS_PORT/api/auth/jwks"; do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then printf '  OK   %s\n' "$url"
    else printf '  DOWN %s\n' "$url"; fi
  done
  printf '\n'
}

# ---------------------------------------------------------------------------
# `check:images` — the whole presigned-URL path, from the host, end to end.
#
# This is the one thing the host-run lane fixes that the all-compose lane cannot:
# SigV4 covers the `Host` header, so the URL's authority and the signed authority
# are the same string by construction. On compose both URLs are signed for
# `minio:9000`, which a host browser cannot resolve and cannot alias around. Here
# the app and the sidecar are both on the host, so `localhost:<MINIO_PORT>` is
# correct from both sides.
#
# Four steps, each asserted rather than eyeballed:
#   1. FileActor.createUploadTarget  -> a PUT URL, signed by the app
#      (src/lib/s3-presign.ts, FILES_S3_ENDPOINT/FILES_S3_PORT)
#   2. PUT the bytes to it
#   3. FileActor.verify              -> the binding confirms the object landed
#   4. FileActor.presignRead         -> a GET URL, signed by the Dapr binding
#      (the generated files-binding.yaml `endpoint`) -> fetch it, compare bytes
#
# Step 1 and step 4 are signed by *different* code with *different*
# configuration; both must agree with what a browser can dial, which is why both
# are checked.
# ---------------------------------------------------------------------------
cmd_check_images() {
  resolve
  local ctx='{"viewerId":null,"kind":"system","requestId":"check-images"}'
  local sidecar="http://127.0.0.1:$ACTORS_DAPR_HTTP_PORT/v1.0/actors/FileActor"
  local token_header="dapr-api-token: $(dapr_api_token)"
  local expect="localhost:$MINIO_PORT"
  local fid tmp png failures=0
  fid="$(uuidgen | tr 'A-Z' 'a-z')"
  tmp="$(mktemp -d)"
  png="$tmp/pixel.png"
  printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==' \
    | base64 -d > "$png"

  printf '\nstack %s — MinIO on %s, file %s\n\n' "$STACK_SLUG" "$expect" "$fid"

  local up url
  up="$(curl -sS -m 30 -X POST "$sidecar/$fid/method/createUploadTarget" \
    -H "$token_header" \
    -H 'content-type: application/json' \
    --data-binary "[$ctx,{\"kind\":\"dev-check\",\"contentType\":\"image/png\"}]")"
  url="$(printf '%s' "$up" | sed -n 's/.*"uploadUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$url" ]; then
    printf '  FAIL 1. createUploadTarget: %s\n' "$(printf '%s' "$up" | head -c 300)"
    rm -rf "$tmp"; die "cannot continue"
  fi
  case "$url" in
    "http://$expect/"*) printf '  OK   1. upload URL signed for %s (app-side signer)\n' "$expect" ;;
    *) printf '  FAIL 1. upload URL authority is %s, expected %s\n' "${url%%/cellar*}" "http://$expect"; failures=$(( failures + 1 )) ;;
  esac

  local code
  code="$(curl -sS -m 60 -o /dev/null -w '%{http_code}' -X PUT \
    -H 'content-type: image/png' --data-binary "@$png" "$url")"
  [ "$code" = "200" ] \
    && printf '  OK   2. PUT the bytes straight to MinIO from the host (HTTP %s)\n' "$code" \
    || { printf '  FAIL 2. PUT returned HTTP %s — a signature or hostname mismatch\n' "$code"; failures=$(( failures + 1 )); }

  local verified
  verified="$(curl -sS -m 30 -X POST "$sidecar/$fid/method/verify" \
    -H "$token_header" \
    -H 'content-type: application/json' --data-binary "[$ctx]")"
  case "$verified" in
    *'"verifiedAt":"'*) printf '  OK   3. FileActor.verify confirmed the object through the files binding\n' ;;
    *) printf '  FAIL 3. verify: %s\n' "$(printf '%s' "$verified" | head -c 300)"; failures=$(( failures + 1 )) ;;
  esac

  local read_json read_url
  read_json="$(curl -sS -m 30 -X POST "$sidecar/$fid/method/presignRead" \
    -H "$token_header" \
    -H 'content-type: application/json' --data-binary "[$ctx]")"
  read_url="$(printf '%s' "$read_json" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
  if [ -z "$read_url" ]; then
    printf '  FAIL 4. presignRead: %s\n' "$(printf '%s' "$read_json" | head -c 300)"
    failures=$(( failures + 1 ))
  else
    case "$read_url" in
      "http://$expect/"*) printf '  OK   4. read URL signed for %s (Dapr binding signer)\n' "$expect" ;;
      *) printf '  FAIL 4. read URL authority is %s, expected %s\n' "${read_url%%/cellar*}" "http://$expect"; failures=$(( failures + 1 )) ;;
    esac
    curl -sS -m 60 -o "$tmp/fetched.png" -w '%{http_code} %{content_type}\n' "$read_url" > "$tmp/get.txt" 2>&1 || true
    code="$(cut -d' ' -f1 < "$tmp/get.txt")"
    if [ "$code" = "200" ] && cmp -s "$png" "$tmp/fetched.png"; then
      printf '  OK   5. GET the presigned read URL: HTTP 200, %s bytes, byte-identical to what was PUT\n' \
        "$(wc -c < "$tmp/fetched.png" | tr -d ' ')"
    else
      printf '  FAIL 5. GET returned "%s" and the bytes %s\n' \
        "$(tr -d '\n' < "$tmp/get.txt")" \
        "$(cmp -s "$png" "$tmp/fetched.png" && echo matched || echo differed)"
      failures=$(( failures + 1 ))
    fi
    printf '\n  A browser can use this URL as-is:\n    %s\n' "$read_url"
  fi

  curl -sS -m 30 -o /dev/null -X POST "$sidecar/$fid/method/delete" \
    -H "$token_header" \
    -H 'content-type: application/json' --data-binary "[$ctx]" || true
  rm -rf "$tmp"
  printf '\n'
  [ "$failures" -eq 0 ] || die "$failures image-path check(s) failed"
  printf 'image path OK end to end.\n'
}

# ---------------------------------------------------------------------------
# `db:clone` — a fresh per-worktree Postgres is empty, and this repository's
# schema comes from the cutover transform of an Nhost dump
# (`packages/db/transform/run.sh`), not from a replayable migration chain. The
# quickest working database for a new worktree is therefore a copy of one that
# already works.
# ---------------------------------------------------------------------------
cmd_db_clone() {
  local from="cellar-stack" schema_only=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) shift; from="$1" ;;
      --schema-only) schema_only=1 ;;
      *) die "db:clone: unexpected argument $1" ;;
    esac
    shift
  done
  resolve
  local src_container dst_container
  src_container="$(docker ps --filter "label=com.docker.compose.project=$from" \
    --filter "label=com.docker.compose.service=postgres" --format '{{.Names}}' | head -1)"
  dst_container="$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
    --filter "label=com.docker.compose.service=postgres" --format '{{.Names}}' | head -1)"
  [ -n "$src_container" ] || die "no running postgres in compose project \"$from\""
  [ -n "$dst_container" ] || die "no running postgres in this stack ($COMPOSE_PROJECT_NAME). Run \`$0 infra\` first."
  [ "$src_container" != "$dst_container" ] || die "source and destination are the same container"

  local dump_flags="--no-owner --no-privileges"
  [ "$schema_only" -eq 1 ] && dump_flags="$dump_flags --schema-only"
  local log="$STACK_DIR/logs/db-clone.log"
  mkdir -p "$STACK_DIR/logs"

  # `${schema_only:+…}` was wrong here: the variable holds 0 or 1, and 0 is
  # non-empty, so every clone announced itself as "schema only" while copying
  # the data. The flags were right; only the line was lying.
  say "cloning $src_container -> $dst_container (database $PG_DB$([ "$schema_only" -eq 1 ] && printf ', schema only'))"
  # shellcheck disable=SC2086
  docker exec -e PGPASSWORD="$PG_PASSWORD" "$src_container" \
    pg_dump -U "$PG_USER" -d "$PG_DB" $dump_flags \
  | docker exec -i -e PGPASSWORD="$PG_PASSWORD" "$dst_container" \
    psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=0 -q > "$log" 2>&1 || true

  local errors tables sentinels
  errors="$(grep -c '^ERROR' "$log" 2>/dev/null || true)"
  # Counted the way `app_table_count` counts: postgis alone would satisfy a
  # bare information_schema count, so a clone that transferred nothing used to
  # pass this assertion. See app_table_count's comment.
  tables="$(app_table_count "$dst_container" "$PG_DB")"
  sentinels="$(sentinel_count "$dst_container" "$PG_DB")"
  say "clone finished: $tables application tables, ${sentinels:-0}/$(sentinel_total) sentinels, ${errors:-0} psql ERROR line(s) (see $log)"
  [ "${tables:-0}" -gt 0 ] || die "clone produced no application tables — see $log"
  [ "${sentinels:-0}" = "$(sentinel_total)" ] \
    || die "clone produced $tables tables but only ${sentinels:-0}/$(sentinel_total) of $SCHEMA_SENTINELS — see $log"
}

# ---------------------------------------------------------------------------
# `migrate` — `db:migrate` (packages/db/src/migrate/) against THIS stack's
# database: apply every migration its ledger does not have, adopting it onto
# the ledger first if it was built or cloned before the ledger existed. Extra
# arguments go to the CLI (`-- --status` reports without changing anything).
#
# A database cloned from another stack carries that stack's ledger, and one
# left alone by `bootstrap` keeps whatever it had — which is exactly how a
# long-lived database used to miss a migration nobody applied by hand. So
# `bootstrap` ends its schema step here, whichever way the schema arrived.
# ---------------------------------------------------------------------------
run_migrate() { # run_migrate [cli args…] — needs `resolve` first
  probe_node || true
  [ -n "$GOOD_NODE" ] || die "db:migrate runs \`node packages/db/src/migrate/cli.ts\`, and no Node satisfying
  .nvmrc ($NVMRC_VERSION) was found on PATH or in fnm/nvm/volta/asdf (fnm install $NVMRC_VERSION)."
  PATH="$(node_path_prefix)" node "$REPO_ROOT/packages/db/src/migrate/cli.ts" --url "$DATABASE_URL" "$@"
}

cmd_migrate() {
  [ "${1:-}" = "--" ] && shift
  resolve
  [ -n "$(project_container "$COMPOSE_PROJECT_NAME" postgres)" ] \
    || die "this stack's Postgres is not running — \`bun run dev:bootstrap\` first"
  run_migrate "$@"
}

# ---------------------------------------------------------------------------
# `prune` — a worktree gets deleted; its compose project does not. Containers
# and named volumes survive with nothing left that knows about them. Compose
# records the file it was created from, so an orphan is a project whose config
# file no longer exists on disk.
# ---------------------------------------------------------------------------
cmd_prune() {
  local apply=0
  [ "${1:-}" = "--apply" ] && apply=1
  local line name files orphans
  orphans=""
  while IFS= read -r line; do
    name="$(printf '%s' "$line" | cut -f1)"
    files="$(printf '%s' "$line" | cut -f2)"
    case "$name" in cellar-*) ;; *) continue ;; esac
    [ "$name" = "cellar-stack" ] && continue
    local first missing
    first="$(printf '%s' "$files" | cut -d, -f1)"
    missing=0
    [ -f "$first" ] || missing=1
    if [ "$missing" -eq 1 ]; then
      orphans="$orphans $name"
      printf 'ORPHAN  %-32s config file gone: %s\n' "$name" "$first"
    else
      printf 'live    %-32s %s\n' "$name" "$first"
    fi
  done <<EOF
$(docker compose ls --all --format json 2>/dev/null \
  | js -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))console.log(p.Name+"\t"+(p.ConfigFiles||""))})')
EOF

  if [ -z "$orphans" ]; then
    printf '\nNo orphaned cellar-* compose projects.\n'
    return 0
  fi
  if [ "$apply" -eq 0 ]; then
    printf '\nRe-run with --apply to remove:%s\n' "$orphans"
    printf 'That runs `docker compose -p <name> down --volumes --remove-orphans` for each.\n'
    return 0
  fi
  local p
  for p in $orphans; do
    say "removing $p"
    docker compose -p "$p" down --volumes --remove-orphans || warn "could not fully remove $p"
  done
}

# ---------------------------------------------------------------------------
# `selftest` — the two properties this design rests on, computed rather than
# asserted in prose.
#
#   1. No two slots can produce the same port number. Exhaustive over every
#      (slot, base) x (slot, base) pair, so adding a base that breaks the
#      stride fails here instead of at 2am in someone else's stack.
#   2. Nothing this script exports into the shared `dapr run` environment is on
#      the list `services/api`'s `assertNoDatabaseCredentials` refuses to start
#      with. The list is READ OUT OF THAT SOURCE FILE, so if a name is added
#      there this test starts failing rather than quietly going stale.
# ---------------------------------------------------------------------------
cmd_selftest() {
  local failures=0

  printf 'port plan: %s bases, stride %s, slots 0..%s\n' \
    "$(printf '%s\n' "$PORT_SPEC" | wc -l | tr -d ' ')" "$SLOT_STRIDE" "$MAX_SLOT"
  local collisions
  collisions="$(
    printf '%s\n' "$PORT_SPEC" | js -e '
      let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
        const stride=Number(process.argv[1]), maxSlot=Number(process.argv[2]);
        const bases=s.trim().split("\n").map(l=>{const [n,b]=l.split(":");return {n,b:Number(b)};});
        const seen=new Map(); let bad=0;
        for (let slot=0; slot<=maxSlot; slot++)
          for (const {n,b} of bases) {
            const port=b+slot*stride, key=String(port);
            if (seen.has(key)) { console.log(`${port}: slot ${slot} ${n}  vs  ${seen.get(key)}`); bad++; }
            else seen.set(key, `slot ${slot} ${n}`);
          }
        process.exit(bad>0?1:0);
      });' "$SLOT_STRIDE" "$MAX_SLOT"
  )" && printf '  OK   no port collisions across any two slots\n' || {
    printf '  FAIL port collisions:\n%s\n' "$collisions"; failures=$(( failures + 1 ));
  }

  local forbidden name
  forbidden="$(sed -n '/const leaked = \[/,/\]\.filter/p' "$REPO_ROOT/services/api/src/config.ts" \
    | sed -n 's/.*"\([A-Z_][A-Z0-9_]*\)".*/\1/p')"
  [ -n "$forbidden" ] || { printf '  FAIL could not read the forbidden list from services/api/src/config.ts\n'; failures=$(( failures + 1 )); }
  local leaked=""
  for name in $PASSTHROUGH_ENV; do
    case "
$forbidden
" in *"
$name
"*) leaked="$leaked $name" ;; esac
  done
  if [ -n "$leaked" ]; then
    printf '  FAIL PASSTHROUGH_ENV exports a credential services/api refuses:%s\n' "$leaked"
    failures=$(( failures + 1 ))
  else
    printf '  OK   PASSTHROUGH_ENV (%s names) disjoint from services/api'"'"'s forbidden list (%s names)\n' \
      "$(printf '%s\n' "$PASSTHROUGH_ENV" | wc -l | tr -d ' ')" \
      "$(printf '%s\n' "$forbidden" | wc -l | tr -d ' ')"
  fi

  # The default lane must stay exactly where it was: no environment set means
  # project `cellar-stack` and the base ports.
  local default_name
  default_name="$(env -u COMPOSE_PROJECT_NAME docker compose -f "$COMPOSE_BASE" config 2>/dev/null | sed -n 's/^name: //p')"
  if [ "$default_name" = "cellar-stack" ]; then
    printf '  OK   infra/docker-compose.yml with no environment is still project "cellar-stack"\n'
  else
    printf '  FAIL default compose project is "%s", expected "cellar-stack"\n' "$default_name"
    failures=$(( failures + 1 ))
  fi

  local overlay_default
  overlay_default="$(env -u PLACEMENT_PORT -u SCHEDULER_PORT -u OTLP_HTTP_PORT -u OTLP_GRPC_PORT \
    docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_HOSTRUN" config 2>/dev/null \
    | grep -c 'published: "50005"' || true)"
  if [ "$overlay_default" = "1" ]; then
    printf '  OK   the host-run overlay with no environment still publishes placement on 50005\n'
  else
    printf '  FAIL overlay default placement port is not 50005 (matched %s)\n' "$overlay_default"
    failures=$(( failures + 1 ))
  fi

  [ "$failures" -eq 0 ] || die "$failures selftest failure(s)"
  printf '\nselftest passed.\n'
}

# ---------------------------------------------------------------------------
# `doctor` and `bootstrap` — the one-command path for a brand-new worktree.
#
# Everything below exists because of a *measured* silent failure, not a
# hypothetical one. The design rule is: a wrong environment must produce a line
# that names the cause, in the place where the cost is paid, rather than seven
# assertion failures with no shared cause a suite later.
#
#   bun run dev:doctor          report; exit 1 if anything blocks
#   bun run dev:doctor -- --fix report, and safely remediate what can be
#   bun run dev:bootstrap       doctor -> stack -> schema -> seed -> signed in
#
# `doctor` reuses `selftest` (the port plan and the credential boundary) and
# `bootstrap` reuses `check:images` (the whole presigned path) rather than
# re-implementing either.
#
# Severity is calibrated on purpose, because a doctor that cries wolf is a
# doctor nobody reads:
#
#   FAIL  bootstrap cannot proceed, or a green run would be a lie
#   WARN  real, but either bootstrap fixes it or it only bites a named command
#   INFO  a supported state that has been mistaken for a fault before
# ---------------------------------------------------------------------------
D_FAIL=0
D_WARN=0
d_section() { printf '\n%s\n' "$1"; }
d_ok()   { printf '  OK    %s\n' "$*"; }
d_info() { printf '  INFO  %s\n' "$*"; }
d_warn() { printf '  WARN  %s\n' "$*"; D_WARN=$(( D_WARN + 1 )); }
d_fail() { printf '  FAIL  %s\n' "$*"; D_FAIL=$(( D_FAIL + 1 )); }
d_hint() { printf '        -> %s\n' "$*"; }
d_cont() { printf '        %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Node: the capability, not the version string.
#
# `.nvmrc` pins 24.14.0 and `package.json` has `engines`, but nothing enforces
# either in a shell that already has node_modules — and fnm's `--use-on-cd` does
# not fire in a non-interactive shell, which is every shell an agent or a hook
# gets. On this machine that means Node 20 by default while 24.14.0 sits
# installed in fnm's store.
#
# What the repo actually depends on is Node's built-in TypeScript type
# stripping: `node scripts/seed.ts` (`bun run db:seed`) and the `node "$SEED"`
# call inside `packages/db/transform/test-db.sh` both hand a `.ts` file to
# whatever `node` is on PATH. So this probes the capability by running a tiny
# `.ts` file, and only uses the version numbers to explain the result.
#
# The version alone is not the answer either way: `process.versions.node` is
# synthetic under Bun (26.3.0), and the test suites all run under
# `bun run --bun vitest run`, where `process.execPath` is bun and types are
# stripped natively. So a wrong Node does NOT break the suites any more — it
# breaks the Node-only steps, and the report says which is which.
# ---------------------------------------------------------------------------
NVMRC_VERSION=""
NVMRC_MAJOR=""
NVMRC_MINOR=""
read_nvmrc() {
  NVMRC_VERSION="$(tr -d ' \t\n' < "$REPO_ROOT/.nvmrc")"
  NVMRC_MAJOR="${NVMRC_VERSION%%.*}"
  NVMRC_MINOR="$(printf '%s' "$NVMRC_VERSION" | cut -d. -f2)"
}

# Same rule as scripts/check-node-version.mjs: identical major, minor at least
# the pinned one.
node_version_ok() { # node_version_ok VERSION
  local major minor
  [ -n "${1:-}" ] || return 1
  major="${1%%.*}"
  minor="$(printf '%s' "$1" | cut -d. -f2)"
  case "$major$minor" in ''|*[!0-9]*) return 1 ;; esac
  [ "$major" = "$NVMRC_MAJOR" ] || return 1
  [ "$minor" -ge "$NVMRC_MINOR" ] || return 1
  return 0
}

node_version_of() { # node_version_of BIN
  "$1" -e 'process.stdout.write(process.versions.node)' 2>/dev/null || true
}

node_strips_types() { # node_strips_types BIN
  local dir rc
  dir="$(mktemp -d)"
  printf 'const answer: number = 42;\nif (answer !== 42) process.exit(3);\n' \
    > "$dir/probe.ts"
  if "$1" "$dir/probe.ts" >/dev/null 2>&1; then rc=0; else rc=1; fi
  rm -rf "$dir"
  return "$rc"
}

# A Node that satisfies .nvmrc AND really strips types. PATH first; then the
# version managers' own stores, read directly. Deliberately NOT by changing the
# machine-wide default (`fnm default …` / `nvm alias default …`): that is the
# user's setting for every other project on this machine, and a bootstrap that
# needs a working Node for two steps has no business moving it.
GOOD_NODE=""
GOOD_NODE_VERSION=""
GOOD_NODE_SOURCE=""
PATH_NODE=""
PATH_NODE_VERSION=""
PATH_NODE_STRIPS=0
NODE_PROBED=0

probe_node() {
  [ "$NODE_PROBED" -eq 0 ] || return 0
  NODE_PROBED=1
  read_nvmrc
  PATH_NODE="$(command -v node 2>/dev/null || true)"
  if [ -n "$PATH_NODE" ]; then
    PATH_NODE_VERSION="$(node_version_of "$PATH_NODE")"
    if node_strips_types "$PATH_NODE"; then PATH_NODE_STRIPS=1; fi
    if [ "$PATH_NODE_STRIPS" -eq 1 ] && node_version_ok "$PATH_NODE_VERSION"; then
      GOOD_NODE="$PATH_NODE"
      GOOD_NODE_VERSION="$PATH_NODE_VERSION"
      GOOD_NODE_SOURCE="PATH"
      return 0
    fi
  fi
  local cand ver
  for cand in \
    "${FNM_DIR:-$HOME/.local/share/fnm}"/node-versions/v"$NVMRC_MAJOR".*/installation/bin/node \
    "$HOME/Library/Application Support/fnm"/node-versions/v"$NVMRC_MAJOR".*/installation/bin/node \
    "$HOME/.nvm/versions/node"/v"$NVMRC_MAJOR".*/bin/node \
    "$HOME/.volta/tools/image/node"/"$NVMRC_MAJOR".*/bin/node \
    "$HOME/.asdf/installs/nodejs"/"$NVMRC_MAJOR".*/bin/node
  do
    [ -x "$cand" ] || continue
    ver="$(node_version_of "$cand")"
    node_version_ok "$ver" || continue
    node_strips_types "$cand" || continue
    GOOD_NODE="$cand"
    GOOD_NODE_VERSION="$ver"
    case "$cand" in
      *fnm*)   GOOD_NODE_SOURCE="fnm store" ;;
      *nvm*)   GOOD_NODE_SOURCE="nvm store" ;;
      *volta*) GOOD_NODE_SOURCE="volta store" ;;
      *asdf*)  GOOD_NODE_SOURCE="asdf store" ;;
      *)       GOOD_NODE_SOURCE="$(dirname "$cand")" ;;
    esac
    return 0
  done
  return 1
}

# PATH for the steps that genuinely need real Node, with the resolved binary's
# directory in front. Used by `seed`; a no-op when PATH's node is already right.
node_path_prefix() {
  probe_node || true
  if [ -n "$GOOD_NODE" ] && [ "$GOOD_NODE_SOURCE" != "PATH" ]; then
    printf '%s:%s' "$(dirname "$GOOD_NODE")" "$PATH"
  else
    printf '%s' "$PATH"
  fi
}

# ---------------------------------------------------------------------------
# Docker inventory helpers. Everything here is read-only.
# ---------------------------------------------------------------------------
docker_up() { docker info >/dev/null 2>&1; }

project_container() { # project_container PROJECT SERVICE
  docker ps --filter "label=com.docker.compose.project=$1" \
    --filter "label=com.docker.compose.service=$2" --format '{{.Names}}' 2>/dev/null | head -1
}

project_container_any() { # including stopped ones
  docker ps -a --filter "label=com.docker.compose.project=$1" \
    --filter "label=com.docker.compose.service=$2" --format '{{.Names}}' 2>/dev/null | head -1
}

# "<host port> <project>" for every published port of every running cellar-*
# container on this machine. This is what turns "port 5673 is in use" into
# "port 5673 belongs to cellar-bun5b".
cellar_port_owners() {
  docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Ports}}' 2>/dev/null \
    | grep '^cellar-' \
    | while IFS='|' read -r project ports; do
        printf '%s\n' "$ports" | tr ',' '\n' \
          | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p' \
          | while read -r p; do printf '%s %s\n' "$p" "$project"; done
      done \
    | sort -u || true
}

cellar_projects() {
  docker compose ls --all --format json 2>/dev/null \
    | js -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))console.log(p.Name+"\t"+(p.ConfigFiles||""))})' \
    2>/dev/null | grep '^cellar-' || true
}

# ---------------------------------------------------------------------------
# This stack's own host processes.
#
# `cellar_port_owners` can only see ports PUBLISHED BY COMPOSE. In this lane the
# two apps and the two sidecars are host processes, so their nine ports have no
# compose owner at all — and the first version of `doctor` reported every one of
# them as "held by a non-compose process: bun/daprd" on a stack it had itself
# just started. They are not a collision: `up` stops them before it starts new
# ones (`stop_run_for_stack`).
#
# So: the detached `dapr run` pid and every descendant of it, plus the two
# sidecars matched by THIS stack's app-ids.
# ---------------------------------------------------------------------------
pid_descendants() { # pid_descendants PID
  local kids k
  kids="$(pgrep -P "$1" 2>/dev/null || true)"
  for k in $kids; do
    printf '%s\n' "$k"
    pid_descendants "$k"
  done
}

stack_host_pids() {
  local pidfile root
  {
    for pidfile in "$STACK_DIR"/*.pid; do
      [ -f "$pidfile" ] || continue
      root="$(cat "$pidfile" 2>/dev/null || true)"
      [ -n "$root" ] || continue
      printf '%s\n' "$root"
      pid_descendants "$root"
    done
    pgrep -f "daprd .*--app-id $ACTORS_APP_ID" 2>/dev/null || true
    pgrep -f "daprd .*--app-id $API_APP_ID" 2>/dev/null || true
  } | sort -u
}

port_listener_pid() { # port_listener_pid PORT
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

# Is this worktree-shaped slug a checkout that still exists? A sibling
# worktree's stack is somebody else's live environment; a slug with no directory
# is leftovers. `prune` cannot tell them apart because both compose files exist.
slug_has_checkout() { # slug_has_checkout SLUG
  local parent
  parent="$(dirname "$REPO_ROOT")"
  [ -d "$parent/$1" ] || [ "$1" = "$(slugify "$(basename "$REPO_ROOT")")" ]
}

psql_in() { # psql_in CONTAINER DB SQL
  docker exec -e PGPASSWORD="$PG_PASSWORD" "$1" \
    psql -U "$PG_USER" -d "$2" -tAc "$3" 2>/dev/null | tr -d '\r \t' || true
}

# ---------------------------------------------------------------------------
# "Does this database have a schema?" — and why it is not a table count.
#
# `select count(*) from information_schema.tables where table_schema='public'`
# returns **3** on a brand-new Postgres here, not 0: infra/postgres/init's
# 01-extensions.sql installs postgis, which brings `spatial_ref_sys` plus the
# `geometry_columns` / `geography_columns` VIEWS, and information_schema.tables
# counts views. Measured on a genuinely fresh stack — and it is exactly how the
# first version of `bootstrap` decided an empty database "already has 3 tables,
# leaving it alone" and then failed several steps later with
# `relation "beer_style" does not exist`.
#
# So: base tables only (relkind='r'), postgis's own excluded — and a sentinel
# check on top, because a clone that copied half the schema is worse than one
# that copied none.
# ---------------------------------------------------------------------------
SCHEMA_SENTINELS="beer_style country cellars user account"

app_table_count() { # app_table_count CONTAINER DB
  psql_in "$1" "$2" "select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> 'spatial_ref_sys'"
}

sentinel_count() { # sentinel_count CONTAINER DB  -> how many of SCHEMA_SENTINELS exist
  psql_in "$1" "$2" "select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('beer_style','country','cellars','user','account')"
}

sentinel_total() { printf '%s' "$(printf '%s\n' $SCHEMA_SENTINELS | wc -w | tr -d ' ')"; }

# ---------------------------------------------------------------------------
# The checks. `doctor_run FIX` fills D_FAIL / D_WARN and prints as it goes.
# ---------------------------------------------------------------------------
doctor_toolchain() { # doctor_toolchain FIX
  local fix="$1"
  d_section "toolchain"

  # --- Node ---------------------------------------------------------------
  probe_node || true
  if [ -z "$PATH_NODE" ]; then
    d_fail "no \`node\` on PATH; .nvmrc pins $NVMRC_VERSION"
    d_hint "install Node $NVMRC_VERSION (fnm install $NVMRC_VERSION)"
  elif [ "$GOOD_NODE_SOURCE" = "PATH" ]; then
    d_ok "node $PATH_NODE_VERSION on PATH satisfies .nvmrc ($NVMRC_VERSION) and strips TypeScript types"
  elif [ -n "$GOOD_NODE" ]; then
    d_warn "node on PATH is v$PATH_NODE_VERSION; .nvmrc pins $NVMRC_VERSION$([ "$PATH_NODE_STRIPS" -eq 0 ] && printf ' and this one cannot strip TypeScript types' || true)"
    d_cont "bites: \`bun run db:seed\` (node scripts/seed.ts) and the \`node \$SEED\` step inside"
    d_cont "       packages/db/transform/test-db.sh — both fail with an ESM loader error that"
    d_cont "       names neither Node nor the version."
    d_cont "does NOT bite: the test suites. They run under \`bun run --bun vitest run\`, where"
    d_cont "       process.execPath is bun and types are stripped natively."
    d_hint "found Node $GOOD_NODE_VERSION in the $GOOD_NODE_SOURCE: $GOOD_NODE"
    d_hint "\`dev:bootstrap\` / \`dev:seed\` use it explicitly, so no shell change is needed"
    d_hint "this shell only:  export PATH=\"$(dirname "$GOOD_NODE"):\$PATH\""
    if command -v fnm >/dev/null 2>&1; then
      d_hint "or per command:    fnm exec --using=$NVMRC_VERSION -- <cmd>   (machine-wide, if you"
      d_cont "                   want it: fnm default $NVMRC_VERSION — changes your other projects too)"
    fi
  else
    d_fail "no Node satisfying .nvmrc ($NVMRC_VERSION) anywhere: PATH has v${PATH_NODE_VERSION:-?}, and none is installed in fnm/nvm/volta/asdf"
    d_hint "fnm install $NVMRC_VERSION   (then \`dev:doctor\` again)"
    d_cont "without it \`bun run db:seed\` and the test-database template build cannot run at all"
  fi

  # --- Bun ----------------------------------------------------------------
  local bun_want bun_have bun_bin
  bun_want="$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"bun@\([^"]*\)".*/\1/p' \
    "$REPO_ROOT/package.json" | head -1)"
  bun_bin="$(command -v bun 2>/dev/null || true)"
  if [ -z "$bun_bin" ]; then
    d_fail "no \`bun\` on PATH; package.json pins bun@$bun_want"
    d_hint "curl -fsSL https://bun.sh/install | bash   (then \`bun upgrade\` to stay current)"
  else
    bun_have="$(bun --version 2>/dev/null || true)"
    if [ "$bun_have" = "$bun_want" ]; then
      d_ok "bun $bun_have matches the packageManager pin"
    else
      d_fail "bun $bun_have does not match the packageManager pin bun@$bun_want"
      d_hint "bun upgrade      # tracks real releases"
    fi
    case "$bun_bin" in
      /opt/homebrew/*|/usr/local/bin/*|/home/linuxbrew/*)
        d_info "bun came from Homebrew ($bun_bin). Its formula LAGS — it sat at 1.4.0 while"
        d_cont "1.4.2 was current. Use \`bun upgrade\`, not \`brew upgrade bun\`."
        ;;
    esac
  fi

  # --- The installed tree, and blocked build scripts ----------------------
  if [ ! -d "$REPO_ROOT/node_modules" ]; then
    if [ "$fix" -eq 1 ] && [ -n "$bun_bin" ]; then
      say "no node_modules — running \`bun install\`"
      ( cd "$REPO_ROOT" && bun install ) || d_fail "bun install failed"
    else
      d_fail "no node_modules at the repo root"
      d_hint "bun install"
      return 0
    fi
  fi
  local blocked rc runner
  runner="${bun_bin:-${GOOD_NODE:-$PATH_NODE}}"
  if [ -z "$runner" ]; then
    d_fail "neither bun nor node is available to run scripts/check-blocked-builds.mjs"
    return 0
  fi
  blocked=""
  rc=0
  blocked="$("$runner" "$REPO_ROOT/scripts/check-blocked-builds.mjs" 2>&1)" || rc=$?
  if [ "$rc" -eq 0 ]; then
    d_ok "dependency build scripts: all reviewed (scripts/check-blocked-builds.mjs)"
  else
    d_fail "unreviewed dependency build scripts — bun's isolated linker SKIPPED them silently"
    printf '%s\n' "$blocked" | sed 's/^/        /'
    d_hint "\`bun pm untrusted\` reports \"Found 0\" here and is NOT the check to trust"
  fi
}

doctor_dapr() {
  d_section "dapr"
  local want
  want="$(sed -n 's|.*image:[[:space:]]*daprio/daprd:\([0-9.]*\).*|\1|p' "$COMPOSE_BASE" | head -1)"
  if [ -x "$DAPRD_BIN" ]; then
    local have
    have="$("$DAPRD_BIN" --version 2>/dev/null | head -1 | tr -d ' \r')"
    if [ -n "$want" ] && [ "$have" != "$want" ]; then
      d_warn "daprd $have at $DAPRD_BIN, but infra/docker-compose.yml runs daprio/daprd:$want"
      d_hint "dapr init --slim --runtime-version $want"
    else
      d_ok "daprd $have at $DAPRD_BIN (matches the compose image)"
    fi
  else
    d_fail "no daprd binary at $DAPRD_BIN — this lane runs the sidecars as host processes"
    d_hint "dapr init --slim --runtime-version ${want:-1.18.3}   (installs binaries, starts nothing)"
  fi
  if command -v dapr >/dev/null 2>&1; then
    d_ok "dapr CLI $(dapr --version 2>/dev/null | sed -n 's/CLI version: *//p' | tr -d ' \r') (runs the Multi-App Run file)"
  else
    d_fail "no \`dapr\` CLI on PATH — \`dev:up\` shells out to \`dapr run -f\`"
    d_hint "brew install dapr/tap/dapr-cli"
  fi
  # placement/scheduler are per-stack CONTAINERS in this lane; the slim binaries
  # are installed alongside daprd and are not used here. Say so, because their
  # presence in ~/.dapr/bin invites the opposite conclusion.
  d_info "placement and scheduler run as containers in this project, not from ~/.dapr/bin — that"
  d_cont "is the isolation boundary (docs/architecture/local-dev-stacks.md)"
}

doctor_config() { # doctor_config FIX
  local fix="$1"
  d_section "configuration"

  # --- infra/.env ---------------------------------------------------------
  # Values are never printed here. Key names and "set"/"missing" only:
  # infra/.env, infra/.env.prod and .secrets hold live session material.
  if [ ! -f "$ENV_FILE" ]; then
    if [ "$fix" -eq 1 ]; then
      cp "$REPO_ROOT/infra/.env.example" "$ENV_FILE"
      # The example's BETTER_AUTH_SECRET is blank since E5b, so this is the
      # only thing that makes the copy bootable — and the same helper the
      # published-value branch below uses, rather than a second `sed` that has
      # to agree with it.
      replace_auth_secret \
        || d_fail "infra/.env created, but BETTER_AUTH_SECRET could not be generated (is openssl installed?)"
      say "created infra/.env from infra/.env.example with a generated BETTER_AUTH_SECRET"
      d_ok "infra/.env created (gitignored; value not printed)"
    else
      d_fail "no infra/.env — the actor host exits on boot with \`[auth] BETTER_AUTH_SECRET is required\`"
      d_hint "dev:doctor -- --fix   (copies infra/.env.example and generates a secret)"
    fi
  else
    local secret_set
    secret_set="$(env_value BETTER_AUTH_SECRET "")"
    if [ -n "$secret_set" ] && is_published_secret "$secret_set"; then
      # E5b. "Non-empty" was the whole test until now, so this line reported
      # green on the value `infra/.env.example` used to ship — and --fix only
      # generated a secret when infra/.env was absent *entirely*, so a developer
      # who copied the example by hand kept it forever. It is public: anyone
      # with the repository can decrypt the JWKS private key it encrypts and
      # forge an admin token. Named specifically, and fixable in place.
      if [ "$fix" -eq 1 ]; then
        replace_auth_secret && \
          d_ok "infra/.env: replaced the published BETTER_AUTH_SECRET with a generated one (value not printed)" || \
          d_fail "infra/.env: could not rewrite BETTER_AUTH_SECRET — edit it by hand"
        d_cont "the \`jwks\` row derived from the old secret is still in Postgres, and a new secret"
        d_cont "cannot decrypt it. Delete it so a fresh keypair is minted — this signs everyone out:"
        d_cont "  shared lane:  docker exec cellar-stack-postgres-1 psql -U cellar -d cellar -c 'delete from jwks'"
        d_cont "  this worktree: psql -h 127.0.0.1 -p \$(bun run --silent dev:env | sed -n 's/^export POSTGRES_PORT=//p') \\"
        d_cont "                      -U cellar -d cellar -c 'delete from jwks'"
      else
        d_fail "infra/.env's BETTER_AUTH_SECRET is the value that was committed to infra/.env.example — it is public"
        d_cont "better-auth encrypts the JWKS *private* key with it, so anyone holding this repo can"
        d_cont "decrypt that key and forge a role:\"admin\" token for any user against this instance."
        d_cont "The actor host now refuses to boot on it (services/actors/src/auth/config.ts)."
        d_hint "dev:doctor -- --fix   (generates a new one; then delete the jwks rows to re-mint the keypair)"
      fi
    elif [ -n "$secret_set" ]; then
      d_ok "infra/.env present, BETTER_AUTH_SECRET set and not the published value (value not printed)"
    elif [ "$fix" -eq 1 ]; then
      replace_auth_secret \
        && d_ok "infra/.env: set a generated BETTER_AUTH_SECRET (value not printed)" \
        || d_fail "infra/.env: could not set BETTER_AUTH_SECRET — edit it by hand"
    else
      d_fail "infra/.env has no BETTER_AUTH_SECRET — the actor host exits on boot"
      d_hint "dev:doctor -- --fix"
    fi
  fi

  # --- Stray .env files ---------------------------------------------------
  # Bun auto-loads `.env` from the process cwd where Node did not, so a
  # leftover file is live configuration that silently overrides intent. Paths
  # only; never contents.
  local strays f
  strays=""
  for f in "$REPO_ROOT/.env" "$REPO_ROOT/.env.local" \
           "$REPO_ROOT"/services/*/.env "$REPO_ROOT"/services/*/.env.local \
           "$REPO_ROOT"/packages/*/.env "$REPO_ROOT"/packages/*/.env.local; do
    [ -f "$f" ] || continue
    strays="$strays
  ${f#"$REPO_ROOT"/}"
  done
  if [ -n "$strays" ]; then
    d_warn "\`.env\` file(s) inside the workspace. **Bun auto-loads .env from the process cwd**"
    d_cont "where Node did not, so each of these is live configuration for anything started in"
    d_cont "that directory — and overrides what dev:up exports:"
    printf '%s\n' "$strays" | sed -n 's/^  /        /p'
    d_hint "delete them, or move the values into infra/.env (the one file this lane reads)"
  else
    d_ok "no stray .env inside the workspace (bun would auto-load one from the process cwd)"
  fi
  [ -f "$REPO_ROOT/.secrets" ] \
    && d_info ".secrets present — legacy Nhost session material, never read or printed by this lane"

  # --- Compose-lane addresses leaking into the host lane ------------------
  # `dapr run` hands the caller's environment to both apps, and the host lane
  # derives every `FILES_S3_*` value itself. A compose-lane value inherited from
  # a shell (or a stray `.env`) therefore overrides a correct address with one
  # no host process can resolve — and the failure lands inside an AI seam or an
  # image fetch as a connection error, not as a configuration error.
  local files_name files_value
  # FILES_S3_PUBLIC_URL is deliberately NOT in this list: the host-run lane never
  # reads it, and setting it changes what `docker compose config` resolves for
  # the CLIENT IMAGE's build arg — which the CSP check below reports precisely,
  # naming the real consequence. Two lines about one variable saying different
  # things is worse than one accurate line.
  for files_name in FILES_S3_ENDPOINT FILES_S3_PORT FILES_S3_INTERNAL_ENDPOINT \
                    FILES_S3_INTERNAL_PORT; do
    case "
$INHERITED_ENV
" in *"
$files_name
"*) ;; *) continue ;; esac
    eval "files_value=\${$files_name:-}"
    d_warn "$files_name is set in your environment ($files_value). This lane derives the"
    d_cont "files addresses from its own ports; a compose-lane value (\`minio\`, \`:9000\`) does not"
    d_cont "resolve from a host process, and the error surfaces as a failed image fetch."
    d_hint "unset $files_name — \`dev:check:images\` proves the derived pair end to end"
  done

  # --- Credentials already in the caller's shell --------------------------
  # `dapr run` hands its own environment to BOTH apps, and services/api exits on
  # boot if it can see a database credential. The forbidden list is read out of
  # the source that enforces it, same as `selftest`.
  local forbidden name leaked
  forbidden="$(sed -n '/const leaked = \[/,/\]\.filter/p' "$REPO_ROOT/services/api/src/config.ts" \
    | sed -n 's/.*"\([A-Z_][A-Z0-9_]*\)".*/\1/p')"
  leaked=""
  # INHERITED_ENV, not `${DATABASE_URL:-}`: `resolve` computes DATABASE_URL into
  # this script's own shell, so asking the live environment always says yes.
  # Names only — the values are credentials.
  for name in $forbidden; do
    case "
$INHERITED_ENV
" in *"
$name
"*) leaked="$leaked $name" ;; esac
  done
  if [ -n "$leaked" ]; then
    d_fail "your shell exports credential(s) services/api refuses to boot with:$leaked"
    d_hint "unset them ( unset$leaked ) — \`dapr run\` passes its environment to BOTH apps"
  else
    d_ok "no forbidden database credential in this shell ($(printf '%s\n' "$forbidden" | wc -l | tr -d ' ') names checked, read from services/api/src/config.ts)"
  fi
}

doctor_port_plan() {
  d_section "port plan (slot $STACK_SLOT, offset +$STACK_OFFSET — $STACK_SLOT_SOURCE)"
  local out
  if out="$(cmd_selftest 2>&1)"; then
    printf '%s\n' "$out" | sed -n 's/^  OK   /  OK    /p'
  else
    printf '%s\n' "$out" | sed 's/^/        /'
    d_fail "selftest failed — the port plan or the credential boundary is broken"
  fi

  # Does the per-worktree derivation still hold? `resolve` walks to the next
  # free slot when the derived one is busy AND pins the result, so a pinned slot
  # that no longer matches the hash is the interesting case: the pin is what is
  # in force, and the collision check below is what makes it safe.
  local derived
  derived="$(slot_for_slug "$STACK_SLUG")"
  if [ "$derived" = "$STACK_SLOT" ]; then
    d_ok "slot $STACK_SLOT is sha256(\"$STACK_SLUG\") mod $MAX_SLOT + 1 — stable across restarts"
  else
    d_info "slot $STACK_SLOT is pinned in .stack/$STACK_SLUG/slot; the hash of \"$STACK_SLUG\" derives $derived"
    d_cont "(\`dev:up -- --reset\` re-derives. The pin is deliberate: it keeps ports stable.)"
  fi

  if ! docker_up; then
    d_fail "the Docker daemon is not reachable — nothing below can be checked"
    d_hint "start Docker Desktop, then re-run"
    return 0
  fi

  # --- Are my 19 ports actually free (or mine)? ---------------------------
  local owners listening name port owner free=0 mine=0 conflict=0 hostpids lpid
  owners="$(cellar_port_owners)"
  listening="$(listening_ports)"
  hostpids="$(stack_host_pids)"
  for name in $(printf '%s\n' "$PORT_SPEC" | cut -d: -f1); do
    port="$(port_for "$name" "$STACK_SLOT")"
    owner="$(printf '%s\n' "$owners" | sed -n "s/^$port //p" | head -1)"
    if [ "$owner" = "$COMPOSE_PROJECT_NAME" ]; then
      mine=$(( mine + 1 ))
      continue
    fi
    case "
$listening
" in
      *"
$port
"*)
        if [ "$name" = "WEB_PORT" ]; then
          d_info "$name $port is in use — that is where YOUR \`bun run dev\` goes; this lane never starts it"
        elif [ -n "$owner" ]; then
          d_fail "$name $port is published by compose project \"$owner\", not this stack"
          conflict=$(( conflict + 1 ))
        else
          lpid="$(port_listener_pid "$port")"
          case "
$hostpids
" in
            *"
$lpid
"*) mine=$(( mine + 1 )) ;;
            *)
              d_fail "$name $port is held by pid ${lpid:-?} ($(ps -o comm= -p "${lpid:-1}" 2>/dev/null | sed 's|.*/||' | tr -d '\n')), which is not this stack"
              conflict=$(( conflict + 1 ))
              ;;
          esac
        fi
        ;;
      *) free=$(( free + 1 )) ;;
    esac
  done
  if [ "$conflict" -eq 0 ]; then
    d_ok "this slot's 19 ports: $free free, $mine already served by this stack (containers + host processes)"
  else
    d_hint "\`dev:up -- --reset\` re-derives a free slot; CELLAR_STACK_SLOT=<n> forces one"
  fi

  # --- Other cellar-* projects on this machine ----------------------------
  # Two distinct hazards, and `prune` only sees the first:
  #   * config file gone   -> a deleted worktree's leftovers. `prune` finds it.
  #   * config file THERE, project not mine and not the shared lane -> a stack
  #     started from THIS checkout under another slug (a soak, an experiment).
  #     `prune` calls it "live" forever, and it keeps 19 ports and a Postgres
  #     volume. Measured: `cellar-bun5b` on this host, 24h old, slot 11.
  local line pname pfiles others
  others=""
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    pname="$(printf '%s' "$line" | cut -f1)"
    pfiles="$(printf '%s' "$line" | cut -f2 | cut -d, -f1)"
    [ "$pname" = "$COMPOSE_PROJECT_NAME" ] && continue
    if [ "$pname" = "cellar-stack" ]; then
      if [ -n "$(project_container cellar-stack postgres)" ]; then
        d_info "shared lane \`cellar-stack\` is up — the default DST_CONTAINER for the test"
        d_cont "database, and what the client's document tests validate against (:3001/:3002)"
      else
        d_info "shared lane \`cellar-stack\` is down (that is fine for this lane; see \"test suite\")"
      fi
      continue
    fi
    if [ ! -f "$pfiles" ]; then
      d_warn "orphaned compose project \"$pname\" — its compose file is gone ($pfiles)"
      d_hint "bun run dev:prune -- --apply"
    else
      others="$others $pname"
    fi
  done <<EOF
$(cellar_projects)
EOF
  local p ports_held age pslug
  for p in $others; do
    ports_held="$(printf '%s\n' "$owners" | grep -c " $p\$" || true)"
    age="$(docker ps --filter "label=com.docker.compose.project=$p" --format '{{.RunningFor}}' 2>/dev/null | head -1)"
    pslug="${p#cellar-}"
    if slug_has_checkout "$pslug"; then
      d_info "sibling stack \"$p\" is running ($ports_held published ports, up $age) — its worktree"
      d_cont "exists, so this is somebody else's live environment. Leave it alone; your ports differ."
    else
      d_warn "stale stack \"$p\" is running ($ports_held published ports, up $age) and there is no"
      d_cont "worktree named \"$pslug\" any more. \`dev:prune\` will NOT offer it: prune's test is"
      d_cont "\"compose file gone\", and this one was started from THIS checkout under another slug."
      d_hint "if nothing needs it:  docker compose -p $p down --volumes --remove-orphans"
    fi
  done
  if [ -z "$others" ]; then d_ok "no foreign cellar-* stack is running"; fi
}

# ---------------------------------------------------------------------------
# Ghost containers.
#
# A container keeps the config hash, the bind mounts and the working_dir it was
# CREATED with. Restructure the repo, or edit the compose file, and the running
# container is still serving the old shape — answering health checks, looking
# alive, and invalidating whatever you concluded from it. (That is not
# hypothetical: a stale container running a pre-restructure `working_dir`
# already invalidated one agent's "the API is live" evidence in this repo.)
#
# `docker compose config --hash='*'` prints what each service's hash WOULD be
# now; the container carries what it was. A difference is a ghost.
# ---------------------------------------------------------------------------
doctor_ghosts() {
  d_section "this stack's containers"
  docker_up || return 0
  local hashes cname svc chash want ghosts=0 seen=0
  hashes="$(compose config --hash='*' 2>/dev/null || true)"
  while read -r cname svc chash; do
    [ -n "${cname:-}" ] || continue
    seen=$(( seen + 1 ))
    want="$(printf '%s\n' "$hashes" | sed -n "s/^$svc //p" | head -1)"
    if [ -n "$want" ] && [ -n "${chash:-}" ] && [ "$want" != "$chash" ]; then
      d_fail "$cname was created from a DIFFERENT compose config (hash $(printf '%s' "$chash" | cut -c1-12) vs $(printf '%s' "$want" | cut -c1-12) now)"
      d_hint "bun run dev:down && bun run dev:bootstrap   — it answers probes while serving the old shape"
      ghosts=$(( ghosts + 1 ))
    fi
    local src
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      # Docker Desktop reports a bind source as the VM's view of it
      # (/host_mnt/Users/...). Compare host paths, not VM paths.
      src="${src#/host_mnt}"
      if [ ! -e "$src" ]; then
        d_fail "$cname binds $src, which does not exist — a ghost from a deleted checkout"
        ghosts=$(( ghosts + 1 ))
      else
        case "$src" in
          "$REPO_ROOT"|"$REPO_ROOT"/*) ;;
          *cellar-assistant*)
            d_fail "$cname binds $src — another checkout's path, not this worktree"
            ghosts=$(( ghosts + 1 ))
            ;;
        esac
      fi
    done <<EOF
$(docker inspect "$cname" --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{"\n"}}{{end}}{{end}}' 2>/dev/null || true)
EOF
  done <<EOF
$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
   --format '{{.Names}} {{.Label "com.docker.compose.service"}} {{.Label "com.docker.compose.config-hash"}}' 2>/dev/null || true)
EOF
  if [ "$seen" -eq 0 ]; then
    d_info "no containers for $COMPOSE_PROJECT_NAME yet — \`dev:bootstrap\` starts them"
  elif [ "$ghosts" -eq 0 ]; then
    d_ok "$seen container(s), all created from the current compose files and this worktree's path"
  fi
}

# Does this stack's database have every migration in this tree? Read-only
# (`db:migrate --status`). "Pending" is a WARN because `bootstrap` and
# `dev:migrate` apply it; a refusal — a migration file changed after this
# database applied it, one out of order, a half-applied one, a database that is
# not transform-built — is a FAIL, because `bootstrap` would stop on it too.
doctor_migrations() {
  local out rc=0 line
  # One d_cont per line, trimmed: the CLI's lines are long and indented.
  d_lines() { while IFS= read -r line; do [ -n "$line" ] && d_cont "$(printf '%s' "$line" | sed 's/^ *//' | cut -c1-140)"; done; return 0; }
  probe_node || true
  if [ -z "$GOOD_NODE" ]; then
    d_info "migration ledger not checked: no Node satisfying .nvmrc (see the toolchain section)"
    return 0
  fi
  out="$(PATH="$(node_path_prefix)" node "$REPO_ROOT/packages/db/src/migrate/cli.ts" \
           --url "$DATABASE_URL" --status 2>&1)" || rc=$?
  case "$rc" in
    0) d_ok "migration ledger: $(printf '%s\n' "$out" | sed -n 's/^==> db:migrate: //p' | tail -1)"
       # `if`, not `&&`: under `set -e` a false test as the last command
       # would make this function — and the doctor — exit 1 on a clean ledger.
       if printf '%s\n' "$out" | grep -q 'WARNING'; then
         printf '%s\n' "$out" | grep WARNING | head -3 | d_lines
       fi ;;
    3) d_warn "migration ledger: $(printf '%s\n' "$out" | sed -n 's/^==> db:migrate: //p' | tail -1)"
       printf '%s\n' "$out" | grep -E '^    (adopt|apply) ' | head -5 | d_lines
       d_hint "bun run dev:migrate    (bootstrap runs it too)" ;;
    *) d_fail "migration ledger: db:migrate --status refused this database"
       printf '%s\n' "$out" | grep -E 'REFUSED|FAILED' | head -3 | d_lines
       d_hint "bun run dev:migrate -- --status   (the full reason)" ;;
  esac
}

doctor_stack_state() {
  d_section "this stack's state"
  docker_up || return 0
  local pg minio init_state buckets
  pg="$(project_container "$COMPOSE_PROJECT_NAME" postgres)"

  # --- Postgres: up, and does it hold anything? ---------------------------
  if [ -z "$pg" ]; then
    d_info "Postgres for this stack is not running — \`bun run dev:bootstrap\` brings it up, gives it"
    d_cont "a schema and seeds it"
  else
    local tables refs accounts sentinels
    tables="$(app_table_count "$pg" "$PG_DB")"
    sentinels="$(sentinel_count "$pg" "$PG_DB")"
    case "${tables:-0}" in
      ''|0)
        d_warn "database \"$PG_DB\" has NO application tables — a fresh worktree's Postgres never does"
        d_cont "(information_schema.tables says 3 even here: postgis's spatial_ref_sys and two views)"
        d_hint "bun run dev:bootstrap        (clone a schema, then seed)"
        d_hint "bun run dev:db:clone         (schema+data from cellar-stack, by itself)"
        ;;
      *)
        if [ "${sentinels:-0}" != "$(sentinel_total)" ]; then
          d_fail "database \"$PG_DB\" is PARTIAL: $tables application tables but only ${sentinels:-0}/$(sentinel_total) of $SCHEMA_SENTINELS"
          d_hint "bun run dev:down -- --volumes && bun run dev:bootstrap   (start from an empty volume)"
          return 0
        fi
        refs="$(psql_in "$pg" "$PG_DB" "select count(*) from country")"
        accounts="$(psql_in "$pg" "$PG_DB" "select count(*) from \"user\" where email in ('test@test.com','test2@test.com')")"
        d_ok "database \"$PG_DB\": $tables application tables, ${refs:-0} country rows"
        doctor_migrations
        if [ "${accounts:-0}" = "2" ]; then
          d_ok "both seeded accounts present (test@test.com / test2@test.com, password 123456789)"
        else
          d_warn "seeded accounts: ${accounts:-0}/2 present — \`/sign-in\` will not work"
          d_hint "bun run dev:seed     (db:seed pointed at THIS stack's ports, not the shared 5433/3002)"
        fi
        ;;
    esac
  fi

  # --- MinIO: the bucket, and whether minio-init finished ------------------
  minio="$(project_container "$COMPOSE_PROJECT_NAME" minio)"
  if [ -z "$minio" ]; then
    d_info "MinIO for this stack is not running"
  else
    local init
    init="$(project_container_any "$COMPOSE_PROJECT_NAME" minio-init)"
    init_state="$(docker inspect "$init" --format '{{.State.Status}}/{{.State.ExitCode}}' 2>/dev/null || true)"
    buckets="$(docker exec "$minio" ls -1 /data 2>/dev/null || true)"
    case "
$buckets
" in
      *"
$MINIO_BUCKET
"*) d_ok "MinIO bucket \"$MINIO_BUCKET\" exists (minio-init $init_state)" ;;
      *)
        case "$init_state" in
          running*) d_warn "minio-init is still running — the bucket is not there YET; bootstrap waits for it" ;;
          exited/0) d_fail "minio-init exited 0 but bucket \"$MINIO_BUCKET\" is absent from the volume" ;;
          *)        d_fail "MinIO bucket \"$MINIO_BUCKET\" missing (minio-init ${init_state:-absent})" ;;
        esac
        d_hint "docker compose -p $COMPOSE_PROJECT_NAME up -d --force-recreate minio-init"
        ;;
    esac
  fi

  # --- Can a browser actually reach the files origin? ---------------------
  # Half of E3, and the half a signature check cannot see: the authority the
  # app signs has to answer from where the browser is. In this lane that is
  # `localhost:<MINIO_PORT>` from the host. (`check:images` proves the whole
  # path including both signers; this is the cheap always-on version.)
  if [ -n "$minio" ]; then
    if curl -fsS -m 3 -o /dev/null "http://localhost:$MINIO_PORT/minio/health/live" 2>/dev/null; then
      d_ok "files origin localhost:$MINIO_PORT answers from the host — what presignRead signs is reachable"
    else
      d_fail "files origin localhost:$MINIO_PORT does not answer from the host: presigned image URLs"
      d_cont "will be signed for an authority a browser cannot dial"
      d_hint "bun run dev:check:images    for the whole path, step by step"
    fi
    # Deliberately a pointer, not a reimplementation: `a8-acceptance.sh
    # endpoint` measures all four candidate authorities from both positions and
    # prints a table. It costs ~4s and only earns its keep when someone is
    # already confused about an authority — and two tools measuring one thing is
    # how they drift apart and then disagree in front of whoever is debugging.
    d_info "confused about which authority is reachable from where?"
    d_cont "services/actors/scripts/a8-acceptance.sh endpoint measures all four, both positions"
  fi

  # --- The client image's baked-in CSP vs what the file origin now is ------
  # The last silent failure in E3, and it fails with NO NETWORK REQUEST AT ALL.
  # `FILES_S3_PUBLIC_URL` is a BUILD ARG for the client image
  # (infra/docker-compose.yml), so a stale value does not fail at boot the way a
  # wrong runtime variable would — it bakes a wrong `connect-src` into the
  # image, and the browser then refuses every upload before dialling anything.
  # Nothing appears in any log on either side.
  #
  # So compare what the running image SERVES against what compose resolves the
  # arg to now. Both halves are cheap: one header, one `compose config`.
  local client_c client_port intended served
  client_c="$(project_container cellar-stack client)"
  if [ -n "$client_c" ]; then
    intended="$(docker compose -f "$COMPOSE_BASE" config 2>/dev/null \
      | sed -n '/^  client:/,/^  [a-z][a-z-]*:$/p' \
      | sed -n 's/^ *FILES_S3_PUBLIC_URL: *//p' | head -1)"
    client_port="$(docker port "$client_c" 3000/tcp 2>/dev/null | head -1)"
    client_port="${client_port##*:}"
    if [ -n "$intended" ] && [ -n "$client_port" ]; then
      served="$(curl -sD - -o /dev/null -m 8 "http://localhost:$client_port/sign-in" 2>/dev/null \
        | grep -io 'connect-src[^;]*' | head -1 || true)"
      if [ -z "$served" ]; then
        d_info "the shared client on :$client_port served no connect-src header to compare (not running a page?)"
      else
        case "$served" in
          *"$intended"*)
            d_ok "the client image's baked-in CSP allows $intended — matches what compose resolves now"
            ;;
          *)
            d_fail "the client image's CSP does NOT allow $intended, which is what compose resolves"
            d_cont "FILES_S3_PUBLIC_URL to now. It is a BUILD ARG, so this does not fail at boot: the"
            d_cont "browser refuses every upload with no network request at all, and nothing is logged"
            d_cont "on either side. Served: $served"
            d_hint "bun run stack:client:build && docker compose -f infra/docker-compose.yml up -d client"
            ;;
        esac
      fi
    fi
  fi

  # --- The apps. `status` already probes this well; do not rebuild it. -----
  local api_ok=0 actors_ok=0 daprd_n
  curl -fsS -m 2 "http://127.0.0.1:$API_PORT/healthz" >/dev/null 2>&1 && api_ok=1
  curl -fsS -m 2 "http://127.0.0.1:$ACTORS_DAPR_HTTP_PORT/v1.0/healthz" >/dev/null 2>&1 && actors_ok=1
  daprd_n="$(pgrep -f "daprd .*--app-id $ACTORS_APP_ID|daprd .*--app-id $API_APP_ID" 2>/dev/null | wc -l | tr -d ' ' || true)"
  if [ "$api_ok" -eq 1 ] && [ "$actors_ok" -eq 1 ]; then
    d_ok "apps answering: api :$API_PORT, actors sidecar :$ACTORS_DAPR_HTTP_PORT ($daprd_n daprd processes)"
  elif [ -n "$pg" ]; then
    d_warn "infra is up but the apps are DOWN (api :$API_PORT $([ "$api_ok" -eq 1 ] && echo ok || echo refused), actors sidecar :$ACTORS_DAPR_HTTP_PORT $([ "$actors_ok" -eq 1 ] && echo ok || echo refused), $daprd_n daprd)"
    d_cont "this is the state a container-only restart leaves behind, and it looks like a broken stack"
    d_hint "bun run dev:bootstrap   (or \`bun run dev:up --detach && bun run dev:wait\`)"
    d_hint "bun run dev:status      for the same probes, per endpoint"
  else
    d_info "stack not started"
  fi
}

# ---------------------------------------------------------------------------
# AI provider. The point of this check is to keep an agent from *chasing* it.
#
# Unset is a supported, deliberate state: `installAI()` installs nothing and
# every AI seam throws a named error on first use rather than silently
# degrading. Set-but-incomplete is the opposite — the actor host refuses to
# boot. And there is a third state peculiar to this lane: `export_passthrough`
# DEFAULTS this lane to `ollama`, so "I never set AI_PROVIDER" does not mean
# "unset" here.
# ---------------------------------------------------------------------------
doctor_ai() {
  d_section "AI provider"
  local declared effective tags models m dims

  # Three states, and the whole point of printing them this way is that only
  # ONE of them is a misconfiguration:
  #
  #   not configured           intentional and fine — every AI seam throws a
  #                            named error on first use instead of degrading
  #   configured + reachable   working
  #   configured + nothing     the actual fault, and the only one to chase
  #     listening
  #
  # A fourth state is peculiar to this lane and has been mistaken for the first:
  # `export_passthrough` defaults AI_PROVIDER to `ollama`, so "I never set it"
  # does not mean "unset" here. That default is deliberate (a local model that
  # needs no credentials) and is left alone.
  declared="${AI_PROVIDER:-$(env_value AI_PROVIDER "")}"
  if [ -n "$declared" ]; then
    effective="$declared"
  else
    effective="ollama"
    d_info "not configured: AI_PROVIDER is unset in your shell and in infra/.env. That is a"
    d_cont "KNOWN-GOOD state — semantic search, tier-list insights, item-onboarding defaults,"
    d_cont "menu extraction and recipe-photo vision each throw a named error on first use"
    d_cont "rather than silently degrading. Nothing to chase."
    d_cont "In THIS lane, though, export_passthrough defaults it to \"ollama\" (below), so that"
    d_cont "is what the apps will see. Export AI_PROVIDER= to get the erroring state."
  fi

  # The four halfvec columns are 768 wide. A provider whose embeddings are a
  # different width inserts fine and means nothing, which is why the provider
  # throws now — but the configured width is checkable here, before anything is
  # written. (Measured: Vertex text-embedding-005 is 768 natively;
  # Qwen3-VL-Embedding-2B is 2048.)
  dims="${AI_EMBEDDING_DIMENSIONS:-$(env_value AI_EMBEDDING_DIMENSIONS 768)}"
  if [ "$dims" != "768" ]; then
    d_fail "AI_EMBEDDING_DIMENSIONS=$dims, but every halfvec column in this schema is 768 wide"
    d_hint "a width mismatch inserts without error and means nothing — pick a 768-wide embedding"
    d_cont "model, or migrate all four vector columns first"
  fi

  case "$effective" in
    ollama)
      if tags="$(curl -fsS -m 3 "${OLLAMA_ENDPOINT:-http://localhost:11434}/api/tags" 2>/dev/null)"; then
        models=""
        for m in "${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}" "${OLLAMA_MODEL_LOW:-gemma3:4b}"; do
          case "$tags" in *"$m"*) ;; *) models="$models $m" ;; esac
        done
        if [ -z "$models" ]; then
          d_ok "configured and reachable: ollama at ${OLLAMA_ENDPOINT:-http://localhost:11434}, both models pulled"
        else
          d_warn "configured and reachable, but model(s) not pulled:$models"
          d_hint "ollama pull$models"
        fi
      else
        d_warn "configured but nothing listening: AI_PROVIDER=ollama and ${OLLAMA_ENDPOINT:-http://localhost:11434} does not answer"
        d_cont "the host still boots; the AI seams fail at CALL time with a connection error"
        d_hint "ollama serve && ollama pull nomic-embed-text gemma3:4b — or export AI_PROVIDER= for"
        d_cont "the deliberate erroring state, which is quieter to read"
      fi
      ;;
    openai-compatible|openai|vllm)
      # Advisory only, and deliberately not reimplemented here:
      # scripts/ai/local-model.sh already probes /v1/models for whatever server
      # is configured (vLLM, LM Studio, llama-server, an MLX shim, Ollama's own
      # /v1) and exits non-zero when a base is down.
      local probe rc=0
      if [ -x "$REPO_ROOT/scripts/ai/local-model.sh" ]; then
        probe="$("$REPO_ROOT/scripts/ai/local-model.sh" status 2>&1)" || rc=$?
        if [ "$rc" -eq 0 ]; then
          d_ok "configured and reachable: AI_PROVIDER=$effective"
          printf '%s\n' "$probe" | sed -n 's/^/        /p'
          d_hint "width, degeneracy and abstention:  scripts/ai/local-model.sh verify"
          # On vLLM, prefix caching is ON by default and silently corrupted 3 of
          # 6 embeddings — unit-norm, no NaN, no error. The flag is mandatory.
          if pgrep -f 'vllm' >/dev/null 2>&1 && ! pgrep -f 'vllm.*--no-enable-prefix-caching' >/dev/null 2>&1; then
            d_warn "a vllm process is running WITHOUT --no-enable-prefix-caching. That flag is not a"
            d_cont "performance tweak: with caching on, 3 of 6 embeddings came back silently"
            d_cont "corrupted — unit-norm, no NaN, no error. Restart it with the flag."
          fi
        else
          d_warn "configured but nothing listening: AI_PROVIDER=$effective and no server answered"
          printf '%s\n' "$probe" | sed -n 's/^/        /p'
          d_hint "scripts/ai/local-model.sh up     (or export AI_PROVIDER= for the erroring state)"
        fi
      else
        d_warn "AI_PROVIDER=$effective but scripts/ai/local-model.sh is missing — cannot probe"
      fi
      ;;
    google-ai)
      if [ -n "${GOOGLE_AI_API_KEY:-$(env_value GOOGLE_AI_API_KEY "")}" ]; then
        d_ok "configured: google-ai with GOOGLE_AI_API_KEY set (value not printed)"
      else
        d_fail "AI_PROVIDER=google-ai but GOOGLE_AI_API_KEY is absent — the actor host REFUSES TO BOOT"
        d_hint "set it in infra/.env, or unset AI_PROVIDER for the erroring-but-booting state"
      fi
      ;;
    vertex-ai|vertex)
      if [ -n "${GOOGLE_GCP_PROJECT_ID:-$(env_value GOOGLE_GCP_PROJECT_ID "")}" ]; then
        d_ok "configured: $effective with GOOGLE_GCP_PROJECT_ID set (value not printed)"
      else
        d_fail "AI_PROVIDER=$effective but GOOGLE_GCP_PROJECT_ID is absent — the actor host REFUSES TO BOOT"
        d_hint "set it in infra/.env, or unset AI_PROVIDER"
      fi
      ;;
    *)
      d_warn "AI_PROVIDER=\"$effective\" is not one this repo knows (ollama, openai-compatible,"
      d_cont "google-ai, vertex-ai). A set-but-unrecognised provider is a boot failure, not a"
      d_cont "degraded mode."
      ;;
  esac
}

# ---------------------------------------------------------------------------
# What `bun run test` needs that is not in this worktree.
#
# The actors suite's vitest `globalSetup` builds `cellar_test` through
# `packages/db/transform/test-db.sh`, whose DST_CONTAINER default is
# `cellar-stack-postgres-1` — the SHARED lane, not this worktree's Postgres —
# and whose template build re-dumps the legacy Nhost database. So "run the
# tests" has two prerequisites that live outside this stack entirely, and both
# fail in ways that name neither.
# ---------------------------------------------------------------------------
doctor_test_suite() {
  d_section "test suite prerequisites"
  docker_up || return 0
  local dst tmpl src_nhost
  dst="${DST_CONTAINER-cellar-stack-postgres-1}"
  if [ -z "$dst" ]; then
    d_info "DST_CONTAINER is explicitly empty — test-db.sh will reach Postgres over TCP"
  elif docker ps --format '{{.Names}}' | grep -qx "$dst"; then
    d_ok "test-database host \"$dst\" is running (test-db.sh's DST_CONTAINER)"
    tmpl="$(docker exec -e PGPASSWORD="$PG_PASSWORD" "$dst" psql -U "$PG_USER" -d postgres -tAc \
      "select 1 from pg_database where datname='cellar_test_template'" 2>/dev/null | tr -d '\r \t' || true)"
    if [ "$tmpl" = "1" ]; then
      d_ok "cellar_test_template exists — \`bun run test\` clones it (seconds) instead of rebuilding"
      d_info "that template is SHARED between worktrees, but concurrent runs no longer fight over"
      d_cont "it: each run clones its own cellar_test_..._run_<pid>_<epoch> database and the"
      d_cont "build is serialised on a Postgres advisory lock (packages/db/transform/test-db.sh)."
      d_cont "What is still shared is the template's FINGERPRINT — two worktrees whose transform"
      d_cont "files differ each rebuild it (3s) when they alternate. \`dev:bootstrap --tests\`"
      d_cont "builds in this worktree's own Postgres when it can, which avoids even that."
    else
      d_warn "no cellar_test_template in $dst — the first \`bun run test\` BUILDS it, which re-dumps the"
      d_cont "legacy Nhost database (packages/db/transform/run.sh) and needs that stack up"
    fi
  else
    d_warn "test-database host \"$dst\" is NOT running — the actors suite's globalSetup fails before"
    d_cont "the first test, with a psql error that does not mention which container it wanted"
    d_hint "bun run stack:up      (the shared lane), or"
    local mine_pg
    mine_pg="$(project_container "$COMPOSE_PROJECT_NAME" postgres)"
    [ -n "$mine_pg" ] || mine_pg="<this stack-s postgres>"
    d_hint "DST_CONTAINER=$mine_pg bun run test    (build it in THIS worktree instead)"
  fi
  src_nhost="$(sed -n 's/^SRC_CONTAINER="\${SRC_CONTAINER:-\([^}]*\)}"/\1/p' \
    "$REPO_ROOT/packages/db/transform/run.sh" | head -1)"
  if [ -n "$src_nhost" ]; then
    if docker ps --format '{{.Names}}' | grep -qx "$src_nhost"; then
      d_ok "legacy Nhost source \"$src_nhost\" is running (only needed for a template REBUILD)"
    else
      d_info "legacy Nhost source \"$src_nhost\" is not running. Only a template rebuild needs it"
      d_cont "(\`nhost up --apply-seeds\`), and its name is hardcoded to one worktree — see AGENTS.md"
    fi
  fi
  # The client's document tests validate every GraphQL document against a live
  # API and *skip themselves* when it is down. A green suite that skipped them
  # is not evidence, so say which way it will go.
  # Not "does :3002 answer" — the gate those tests actually apply is a
  # SUCCESSFUL SIGN-IN as test@test.com, with the Origin a browser would send.
  # An endpoint that answers /healthz while the database behind it holds no
  # seeded account skips the suite exactly the same way. (Measured: an actors
  # container one second into a restart answered /healthz and /api/auth/jwks and
  # refused the sign-in, and all 17 document tests skipped.)
  local doc_code
  doc_code="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST \
    "http://127.0.0.1:3002/api/auth/sign-in/email" \
    -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
    --data-binary '{"email":"test@test.com","password":"123456789"}' 2>/dev/null || true)"
  if [ "$doc_code" = "200" ] \
    && curl -fsS -m 3 -o /dev/null -X POST "http://127.0.0.1:3001/graphql" \
       -H 'content-type: application/json' --data-binary '{"query":"{__typename}"}' 2>/dev/null; then
    d_ok "the client's document tests will RUN (sign-in on :3002 returns 200, :3001 answers)"
  else
    d_warn "the client's document tests will SKIP THEMSELVES: sign-in as test@test.com on :3002"
    d_cont "(the shared lane's actor host) returned ${doc_code:-no response}, not 200. They are the"
    d_cont "only check that catches an invalid"
    d_cont "GraphQL field — tsc and gql.tada do not — so a green suite here proves less than it looks"
    d_hint "bun run stack:up, or run them against this stack:"
    d_hint "GRAPHQL_API_URL=http://localhost:$API_PORT/graphql BETTER_AUTH_ORIGIN=http://localhost:$ACTORS_PORT bun run test:unit"
  fi
}

# ---------------------------------------------------------------------------
# Source newer than the process serving it.
#
# The inverse of the ghost check above, and worse. `api` and `actors` bind-mount
# the whole worktree at /workspace and run `bun src/index.ts` — **no watcher, no
# --hot**. So a container serves whatever the tree contained at `docker start`
# and never reloads, and nothing in `docker ps`, `dev:status` or the logs
# distinguishes "healthy" from "healthy and serving a nine-minute-old mix of two
# refactor states". It is not stale *committed* code either; it is an arbitrary
# uncommitted snapshot, with no marker anywhere saying so.
#
# Measured: `cellar-stack-actors-1` started mid-refactor and kept answering with
# `TypeError: scope is not a function` for nine minutes after the working tree
# was already correct — 500s on /discoveries and "Unexpected error" on three
# more routes, which cost the e2e suite 6 failures, 4 skips and 11 not-run
# tests before anyone suspected the container.
#
# The host-run lane has the identical property: `dapr.template.yaml` runs
# `bun src/index.ts` too. There the reference point is the pid file, written the
# moment `dapr run` was launched.
#
# So: compare what is serving against the mtimes of the source it serves, and
# say how stale it is. WARN, not FAIL — an unrelated file changing is normal —
# but the wording has to make it impossible to attribute the symptom elsewhere.
# ---------------------------------------------------------------------------
SOURCE_EXTENSIONS='-name *.ts -o -name *.tsx -o -name *.mts -o -name *.js -o -name *.mjs -o -name *.json -o -name *.yaml -o -name *.yml -o -name *.graphql -o -name *.sql'

# Source files under DIR modified after REFERENCE_FILE's mtime.
newer_sources() { # newer_sources DIR REFERENCE_FILE
  [ -d "$1" ] || return 0
  find "$1" \
    \( -name node_modules -o -name .next -o -name .git -o -name .stack \
       -o -name .turbo -o -name dist -o -name .nhost -o -name artifacts \) -prune \
    -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.js' \
       -o -name '*.mjs' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \
       -o -name '*.graphql' -o -name '*.sql' \) \
       ! -name '*.test.*' ! -name '*.spec.*' -newer "$2" -print 2>/dev/null || true
}

# A file whose mtime is exactly this container's StartedAt. Written rather than
# passed to `find -newermt`, because StartedAt is UTC with nanoseconds and
# -newermt reads a bare timestamp as LOCAL time — an 8-hour error in the
# direction that hides the problem.
timestamp_marker() { # timestamp_marker ISO8601 OUTFILE
  local runner
  [ -n "${1:-}" ] || return 1
  runner="$(command -v bun 2>/dev/null || true)"
  [ -n "$runner" ] || runner="${GOOD_NODE:-$(command -v node 2>/dev/null || true)}"
  [ -n "$runner" ] || return 1
  "$runner" -e '
    const fs = require("node:fs");
    const [iso, out] = process.argv.slice(process.argv.length - 2);
    const t = Date.parse(iso) / 1000;
    if (!Number.isFinite(t)) process.exit(1);
    fs.writeFileSync(out, "");
    fs.utimesSync(out, t, t);
  ' "$1" "$2" >/dev/null 2>&1 || return 1
  [ -f "$2" ]
}

started_at_marker() { # started_at_marker CONTAINER OUTFILE
  timestamp_marker \
    "$(docker inspect "$1" --format '{{.State.StartedAt}}' 2>/dev/null || true)" "$2"
}

# The other half of the same hazard: a service with NO bind mount runs a built
# image, so its source is frozen at BUILD time rather than at start time. Compose
# names a built image `<project>-<service>`, which is how this tells "built from
# this repo" from "pulled from a registry" without parsing the compose file.
image_built_marker() { # image_built_marker CONTAINER PROJECT OUTFILE
  local image
  image="$(docker inspect "$1" --format '{{.Config.Image}}' 2>/dev/null || true)"
  case "$image" in "$2"-*) ;; *) return 1 ;; esac
  timestamp_marker \
    "$(docker image inspect "$image" --format '{{.Created}}' 2>/dev/null || true)" "$3"
}

report_staleness() { # report_staleness LABEL REF WHEN MECHANISM REMEDY DIR...
  local label="$1" ref="$2" when="$3" mechanism="$4" remedy="$5"
  shift 5
  local hits n d
  hits="$(for d in "$@"; do newer_sources "$d" "$ref"; done | head -200)"
  n="$(printf '%s' "$hits" | grep -c . || true)"
  if [ "${n:-0}" -eq 0 ]; then
    d_ok "$label: serving the current source ($when; nothing it reads has changed since)"
    return 0
  fi
  d_warn "$label ($when) — ${n} file(s) it reads have changed SINCE."
  # `fold -s` so a one-sentence explanation does not become a 200-column line.
  printf '%s\n' "$mechanism" | fold -s -w 88 | sed 's/^/        /'

  printf '%s\n' "$hits" | head -3 | sed "s|^$REPO_ROOT/|        |"
  if [ "${n:-0}" -gt 3 ]; then d_cont "... and $(( n - 3 )) more"; fi
  d_hint "$remedy"
}

doctor_source_freshness() {
  d_section "is anything serving stale source?"
  docker_up || return 0
  local tmp marker c svc cmd binds started project
  tmp="$(mktemp -d)"
  marker="$tmp/started"

  # Every running cellar-* container that bind-mounts THIS worktree. The shared
  # lane matters as much as this one: it is usually where an agent's "the API is
  # live" evidence comes from.
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    svc="$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null || true)"
    project="$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
    binds="$(docker inspect "$c" --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}} {{end}}{{end}}' 2>/dev/null || true)"
    case "$binds" in
      *"$REPO_ROOT"*) ;;
      *)
        # No mount of this worktree: the source is baked into the image. Same
        # staleness, different clock and a different remedy — and this is the
        # case for `client`, which builds rather than mounts.
        if [ -d "$REPO_ROOT/services/$svc" ] && image_built_marker "$c" "$project" "$marker"; then
          report_staleness "$c ($svc, built image)" "$marker" \
            "image built $(date -r "$marker" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo unknown) local" \
            "This service has no bind mount: its source is baked into the image, so an edit needs a rebuild, not a restart." \
            "bun run stack:client:build && docker compose -p $project up -d $svc" \
            "$REPO_ROOT/services/$svc" "$REPO_ROOT/packages"
        fi
        continue
        ;;
    esac
    cmd="$(docker inspect "$c" --format '{{json .Config.Cmd}}' 2>/dev/null || true)"
    case "$cmd" in *--watch*|*--hot*|*nodemon*) continue ;; esac
    started="started $(docker inspect "$c" --format '{{.State.StartedAt}}' 2>/dev/null | cut -c1-19 | tr 'T' ' ' || true) UTC"
    started_at_marker "$c" "$marker" || continue
    case "$cmd" in
      *src/index.ts*)
        # An app running mounted TypeScript directly. Scope the scan to what it
        # actually imports, so an actors edit does not indict the api container.
        report_staleness "$c ($svc)" "$marker" "$started" \
          "It runs \`bun src/index.ts\` off the bind mount with no watcher and no --hot, so it is still serving the tree as of that moment — possibly an uncommitted mix of two edit states, with nothing in docker ps, dev:status or the logs saying so." \
          "docker compose -p $project restart $svc" \
          "$REPO_ROOT/services/$svc" "$REPO_ROOT/packages"
        ;;
      */daprd*)
        # A sidecar reads --resources-path and --config ONCE, at boot.
        report_staleness "$c ($svc)" "$marker" "$started" \
          "daprd reads its components and config once, at boot. An edited component file is not picked up, and a missing one does not error — the building block simply is not there." \
          "docker compose -p $project restart $svc" \
          "$REPO_ROOT/infra/dapr"
        ;;
    esac
  done <<EOF
$(docker ps --format '{{.Names}}' --filter 'label=com.docker.compose.project' 2>/dev/null | grep '^cellar-' || true)
EOF

  # This lane's host processes. The pid file's mtime IS the launch moment.
  local pidfile pid
  pidfile="$STACK_DIR/dapr-run.pid"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      report_staleness "this stack's host apps (dapr run pid $pid)" "$pidfile" \
        "started $(date -r "$pidfile" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo unknown) local" \
        "dapr.template.yaml runs \`bun src/index.ts\` for both apps — same as the containers, no watcher. The sidecars also read .stack/$STACK_SLUG/dapr/ once, at boot." \
        "bun run dev:up --detach && bun run dev:wait   (restarts both apps and both sidecars)" \
        "$REPO_ROOT/services" "$REPO_ROOT/packages" "$REPO_ROOT/infra/dapr"
    fi
  fi
  rm -rf "$tmp"
}

doctor_run() { # doctor_run FIX
  local fix="$1"
  printf '\n==> doctor — worktree %s, stack %s (project %s)\n' \
    "$(basename "$REPO_ROOT")" "$STACK_SLUG" "$COMPOSE_PROJECT_NAME"
  doctor_toolchain "$fix"
  doctor_dapr
  doctor_config "$fix"
  doctor_port_plan
  doctor_ghosts
  doctor_source_freshness
  doctor_stack_state
  doctor_ai
  doctor_test_suite
}

cmd_doctor() {
  local fix=0 args=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --fix) fix=1 ;;
      *) args="$args $1" ;;
    esac
    shift
  done
  # shellcheck disable=SC2086
  resolve $args
  if [ "$fix" -eq 1 ]; then
    probe_node || true
    if [ ! -x "$DAPRD_BIN" ] && command -v dapr >/dev/null 2>&1; then
      local want
      want="$(sed -n 's|.*image:[[:space:]]*daprio/daprd:\([0-9.]*\).*|\1|p' "$COMPOSE_BASE" | head -1)"
      say "installing the Dapr slim binaries (starts nothing)"
      dapr init --slim --runtime-version "${want:-1.18.3}" || warn "dapr init --slim failed"
    fi
  fi
  doctor_run "$fix"
  printf '\n'
  if [ "$D_FAIL" -gt 0 ]; then
    printf '%s FAIL, %s WARN. Fix the FAIL lines; `dev:doctor -- --fix` handles the ones it can.\n' \
      "$D_FAIL" "$D_WARN" >&2
    exit 1
  fi
  printf 'doctor: 0 FAIL, %s WARN. `bun run dev:bootstrap` from here.\n' "$D_WARN"
}

# ---------------------------------------------------------------------------
# `seed` — `bun run db:seed` pointed at THIS stack.
#
# The root `db:seed` script defaults to `postgres://…@localhost:5433/cellar` and
# `http://localhost:3002`, which are the SHARED lane's ports. Run it bare in a
# worktree and it seeds somebody else's database through somebody else's actor
# host, reports success, and leaves this stack empty.
#
# Three things have to line up, and the third is the one that bites: better-auth
# refuses a state-changing request whose `Origin` is not trusted, so the script's
# `AUTH_TRUSTED_ORIGIN` must match this stack's `AUTH_TRUSTED_ORIGINS`
# (http://localhost:<WEB_PORT>), not the compose default of :3000.
#
# It also runs `node scripts/seed.ts` — real Node, not bun — so this is where a
# Node without type stripping actually costs you. The resolved binary goes in
# front of PATH for this one command instead of asking anyone to change a shell.
# ---------------------------------------------------------------------------
cmd_seed() {
  resolve
  probe_node || true
  if [ -z "$GOOD_NODE" ]; then
    die "db:seed runs \`node scripts/seed.ts\`, and no Node satisfying .nvmrc ($NVMRC_VERSION) was
  found on PATH or in fnm/nvm/volta/asdf. Install it (fnm install $NVMRC_VERSION) and re-run;
  on the wrong major version this fails with an ESM loader error that names neither."
  fi
  local pg
  pg="$(project_container "$COMPOSE_PROJECT_NAME" postgres)"
  [ -n "$pg" ] || die "this stack's Postgres is not running — \`bun run dev:bootstrap\` first"
  say "seeding $PG_DB on 127.0.0.1:$POSTGRES_PORT via $BETTER_AUTH_URL (node $GOOD_NODE_VERSION from $GOOD_NODE_SOURCE)"
  ( cd "$REPO_ROOT" \
    && PATH="$(node_path_prefix)" \
       DATABASE_URL="$DATABASE_URL" \
       BETTER_AUTH_URL="$BETTER_AUTH_URL" \
       AUTH_TRUSTED_ORIGIN="http://localhost:$WEB_PORT" \
       bun run --filter @cellar-assistant/actors db:seed ) \
    || die "db:seed failed against $BETTER_AUTH_URL. If it reported MISSING_OR_NULL_ORIGIN or an
  untrusted origin, this stack's AUTH_TRUSTED_ORIGINS is http://localhost:$WEB_PORT — check
  the generated $STACK_DIR/dapr.yaml."
}

# Proof that the seeded accounts can actually sign in: a real better-auth
# sign-in on this stack's actor host, with the Origin a browser would send.
# Only the status code and the presence of a session cookie are ever printed.
verify_sign_in() {
  local hdr code rc=0
  hdr="$(mktemp)"
  code="$(curl -sS -m 20 -o /dev/null -D "$hdr" -w '%{http_code}' -X POST \
    "http://127.0.0.1:$ACTORS_PORT/api/auth/sign-in/email" \
    -H 'content-type: application/json' \
    -H "origin: http://localhost:$WEB_PORT" \
    --data-binary '{"email":"test@test.com","password":"123456789"}' 2>/dev/null || true)"
  if [ "$code" = "200" ] && grep -qi '^set-cookie:.*session' "$hdr"; then
    printf '  OK   sign-in as test@test.com: HTTP 200 + session cookie (value not printed)\n'
  else
    local cookie
    cookie="no session cookie"
    grep -qi '^set-cookie:.*session' "$hdr" && cookie="session cookie present"
    printf '  FAIL sign-in as test@test.com returned HTTP %s (%s)\n' "${code:-none}" "$cookie"
    rc=1
  fi
  rm -f "$hdr"
  return "$rc"
}

wait_for_minio_bucket() {
  local minio init state i=0
  minio="$(project_container "$COMPOSE_PROJECT_NAME" minio)"
  [ -n "$minio" ] || die "MinIO container is not running in $COMPOSE_PROJECT_NAME"
  init="$(project_container_any "$COMPOSE_PROJECT_NAME" minio-init)"
  while [ "$i" -lt 60 ]; do
    if [ -n "$init" ]; then
      state="$(docker inspect "$init" --format '{{.State.Status}}/{{.State.ExitCode}}' 2>/dev/null || true)"
      case "$state" in
        exited/0) ;;
        exited/*) die "minio-init failed ($state): docker logs $init" ;;
        *) sleep 1; i=$(( i + 1 )); continue ;;
      esac
    fi
    case "
$(docker exec "$minio" ls -1 /data 2>/dev/null || true)
" in
      *"
$MINIO_BUCKET
"*) say "MinIO bucket \"$MINIO_BUCKET\" ready (minio-init ${state:-n/a})"; return 0 ;;
    esac
    sleep 1
    i=$(( i + 1 ))
  done
  die "MinIO bucket \"$MINIO_BUCKET\" did not appear within 60s (minio-init ${state:-absent})"
}

# ---------------------------------------------------------------------------
# `bootstrap` — one command, no human in the loop.
#
# Order matters and is not the obvious one: the schema lands BEFORE the apps
# boot, because the actor host's auth tables have to exist before `db:seed`
# signs the two accounts up through better-auth's HTTP API.
# ---------------------------------------------------------------------------
cmd_bootstrap() {
  local do_seed=1 do_tests=0 do_images=1 from="" args="" skip_doctor=0 fix=1
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-seed) do_seed=0 ;;
      --tests) do_tests=1 ;;
      --no-images) do_images=0 ;;
      --no-fix) fix=0 ;;
      --skip-doctor) skip_doctor=1 ;;
      --from) shift; from="$1" ;;
      --reset) args="$args --reset" ;;
      *) die "bootstrap: unknown option $1" ;;
    esac
    shift
  done
  # shellcheck disable=SC2086
  resolve $args

  printf '\n==> 1/7  preflight\n'
  if [ "$skip_doctor" -eq 0 ]; then
    doctor_run "$fix"
    printf '\n'
    [ "$D_FAIL" -eq 0 ] || die "$D_FAIL blocking problem(s) above. Nothing was started.
  Fix them (or re-run with --fix) and try again; everything marked WARN is either
  handled by the rest of this command or affects only the command it names."
    say "preflight: 0 FAIL, $D_WARN WARN"
  else
    say "preflight skipped (--skip-doctor)"
  fi

  printf '\n==> 2/7  infra containers\n'
  compose_up_infra
  wait_for_postgres
  wait_for_minio_bucket

  printf '\n==> 3/7  database schema\n'
  local pg tables sentinels
  pg="$(project_container "$COMPOSE_PROJECT_NAME" postgres)"
  tables="$(app_table_count "$pg" "$PG_DB")"
  sentinels="$(sentinel_count "$pg" "$PG_DB")"
  if [ "${tables:-0}" -gt 0 ] && [ "${sentinels:-0}" = "$(sentinel_total)" ]; then
    say "$PG_DB already has $tables application tables and every sentinel — leaving it alone"
  elif [ "${tables:-0}" -gt 0 ]; then
    die "$PG_DB has $tables application tables but only ${sentinels:-0}/$(sentinel_total) of the
  sentinels ($SCHEMA_SENTINELS). That is a half-built schema, and seeding on top of it fails
  several steps later with a message that names one missing relation. Start from an empty
  volume:  bun run dev:down -- --volumes && bun run dev:bootstrap"
  else
    local src
    src="$from"
    if [ -z "$src" ]; then
      # Any running cellar-* Postgres that is not mine will do; prefer the
      # shared lane because it is the one with a schema by construction.
      if [ -n "$(project_container cellar-stack postgres)" ]; then
        src="cellar-stack"
      else
        local cand
        for cand in $(cellar_projects | cut -f1); do
          [ "$cand" = "$COMPOSE_PROJECT_NAME" ] && continue
          [ -n "$(project_container "$cand" postgres)" ] || continue
          src="$cand"
          break
        done
      fi
    fi
    if [ -n "$src" ]; then
      say "empty database — cloning the schema and data from compose project \"$src\""
      cmd_db_clone --from "$src"
    else
      # No donor. The schema's source of truth is the cutover transform of an
      # Nhost dump (there is no replayable migration chain), so this is the
      # only other way to get one — and it needs the legacy stack up.
      say "empty database and no running cellar-* Postgres to clone from;"
      say "building the schema with packages/db/transform/run.sh (legacy Nhost dump)"
      DST_CONTAINER="$pg" DST_USER="$PG_USER" DST_PASSWORD="$PG_PASSWORD" DST_DB="$PG_DB" \
        PATH="$(node_path_prefix)" \
        "$REPO_ROOT/packages/db/transform/run.sh" \
        || die "transform/run.sh failed. It pg_dumps the legacy Nhost Postgres, so that stack has to
  be up (\`nhost up --apply-seeds\`; AGENTS.md \"Legacy rollback path only\"). Or start any
  other worktree's stack and re-run with --from <its compose project>."
    fi
  fi

  # Whichever way the schema arrived — left alone, cloned, or built — bring it
  # up to this tree's migrations. A no-op when run.sh just did it.
  say "db:migrate (the migration ledger)"
  run_migrate || die "db:migrate refused or failed against $PG_DB (above). Nothing else was started.
  A refusal names the migration and why; \`bun run dev:migrate -- --status\` repeats it read-only."

  printf '\n==> 4/7  apps + sidecars\n'
  cmd_up --detach

  printf '\n==> 5/7  readiness\n'
  cmd_wait

  if [ "$do_seed" -eq 1 ]; then
    printf '\n==> 6/7  seed + sign-in\n'
    cmd_seed
    verify_sign_in || die "the accounts seeded but cannot sign in. See $STACK_DIR/logs/dapr-run.log"
  else
    printf '\n==> 6/7  seed skipped (--no-seed)\n'
  fi

  if [ "$do_images" -eq 1 ]; then
    printf '\n==> 7/7  image path (check:images)\n'
    cmd_check_images
  else
    printf '\n==> 7/7  image path skipped (--no-images)\n'
  fi

  cmd_ports
  printf 'Stack %s is up, seeded and signed into.\n\n' "$STACK_SLUG"
  printf '  the frontend (yours to start, never started by this tooling):\n'
  # The client reads GRAPHQL_API_URL, BETTER_AUTH_ORIGIN and MINIO_PORT
  # (services/client/src/lib/api/config.ts, next.config.mjs), all of which
  # default to the SHARED lane. A dev server started without them talks to
  # cellar-stack instead of this worktree's stack, and sign-in then fails
  # because this stack's actors trust only localhost:$WEB_PORT. This hint used
  # to print NEXT_PUBLIC_API_URL, which nothing in services/client reads.
  printf '    PORT=%s GRAPHQL_API_URL=http://localhost:%s/graphql BETTER_AUTH_ORIGIN=http://localhost:%s MINIO_PORT=%s bun run dev\n\n' \
    "$WEB_PORT" "$API_PORT" "$ACTORS_PORT" "$MINIO_PORT"
  printf '  sign in at http://localhost:%s/sign-in as test@test.com / 123456789 -> /cellars\n\n' "$WEB_PORT"
  printf '  logs: bun run dev:logs      status: bun run dev:status      teardown: bun run dev:down\n\n'

  if [ "$do_tests" -eq 1 ]; then
    printf '\n==> tests  bun run test --force (unit suites; e2e excluded)\n'
    # --- WHERE the test database is built ---------------------------------
    # test-db.sh's DST_CONTAINER default is the SHARED cellar-stack-postgres-1.
    # It no longer drops a shared `cellar_test` there — each run gets its own
    # `cellar_test_..._run_<pid>_<epoch>` and the template build is serialised
    # on an advisory lock — but the TEMPLATE is still one database shared by
    # every worktree, and worktrees whose transform files differ invalidate each
    # other's fingerprint and pay for a rebuild when they alternate. So prefer
    # this worktree's own Postgres whenever it can build there, and say which
    # one it picked either way.
    local dst
    if [ -n "${DST_CONTAINER-}" ]; then
      dst="$DST_CONTAINER"
      say "test database: DST_CONTAINER is set by you (${dst:-<TCP>})"
    else
      local mine tmpl nhost
      mine="$(project_container "$COMPOSE_PROJECT_NAME" postgres)"
      tmpl="$(psql_in "$mine" postgres "select 1 from pg_database where datname='cellar_test_template'")"
      nhost="$(sed -n 's/^SRC_CONTAINER="\${SRC_CONTAINER:-\([^}]*\)}"/\1/p' \
        "$REPO_ROOT/packages/db/transform/run.sh" | head -1)"
      if [ "$tmpl" = "1" ]; then
        dst="$mine"
        say "test database: this stack's own Postgres ($dst) — its template is already built"
      elif [ -n "$nhost" ] && docker ps --format '{{.Names}}' | grep -qx "$nhost"; then
        dst="$mine"
        say "test database: this stack's own Postgres ($dst) — building the template from $nhost"
      elif docker ps --format '{{.Names}}' | grep -qx cellar-stack-postgres-1; then
        dst="cellar-stack-postgres-1"
        warn "test database: the SHARED $dst, because this stack cannot build a template
  (no cellar_test_template here and the legacy Nhost source is down). Concurrent runs are
  safe there — own run database each, advisory-locked build — but every worktree shares
  that one template, so alternating worktrees rebuild it. Bring up
  \`nhost up --apply-seeds\` to keep it local."
      else
        die "nowhere to build the test database: this stack has no cellar_test_template, the
  legacy Nhost source is down (so packages/db/transform/run.sh cannot dump), and
  cellar-stack-postgres-1 is not running. Start one of those, or set DST_CONTAINER."
      fi
    fi
    # --force, deliberately: turbo caches a green `test` on the file hashes, and
    # the client's document tests depend on a LIVE stack that is not in the
    # hash. Without it a bootstrap can "run the suite" and replay a pass from
    # when the stack was up. Measured: 11 of 12 tasks came from cache.
    ( cd "$REPO_ROOT" && PATH="$(node_path_prefix)" DST_CONTAINER="$dst" bun run test --force )
  fi
}

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Commands
  bootstrap [opts]          THE one command for a fresh worktree: preflight, infra,
                            schema, apps, seed, sign-in proof, image path.
                            --tests also runs the unit suites; --no-seed, --no-images,
                            --from PROJ (clone source), --skip-doctor, --no-fix, --reset
  doctor [--fix]            preflight only: every known silent failure mode, named
  seed                      `db:seed` pointed at THIS stack (ports, origin and Node)
  migrate [-- --status]     `db:migrate` against THIS stack: the migration ledger
  up [--detach] [--reset]   infra + `dapr run -f` for this worktree
  wait                      block until the API and the actor sidecar answer
  run-file FILE [--detach]  start a variant run file with this stack's full environment
  infra [--reset]           the compose half only
  down [--volumes]          stop the apps, then `compose down` this project
  status                    containers, host sidecars, endpoint probes
  logs                      tail the detached `dapr run` log
  ports [--reset]           this worktree's port table
  env [--reset]             the same, as shell `export` lines
  db:clone [--from PROJ]    copy a working database into this stack (default: cellar-stack)
  check:images              upload -> presigned GET -> byte compare, all from the host
  prune [--apply]           orphaned cellar-* compose projects from deleted worktrees
  selftest                  prove the port plan and the credential boundary
  dapr-token                the sidecar API token, for a harness to capture (never a TTY)

Environment
  CELLAR_STACK_SLUG   override the slug (default: the worktree directory name)
  CELLAR_STACK_SLOT   override the slot (default: hashed from the slug, then pinned)
EOF
}

main() {
  local cmd="${1:-}"
  [ $# -gt 0 ] && shift || true
  case "$cmd" in
    bootstrap) cmd_bootstrap "$@" ;;
    doctor)    cmd_doctor "$@" ;;
    seed)      cmd_seed "$@" ;;
    migrate)   cmd_migrate "$@" ;;
    up)        cmd_up "$@" ;;
    wait)      cmd_wait "$@" ;;
    run-file)  cmd_run_file "$@" ;;
    infra)     cmd_infra "$@" ;;
    down)      cmd_down "$@" ;;
    status)    cmd_status "$@" ;;
    logs)      cmd_logs "$@" ;;
    ports)     cmd_ports "$@" ;;
    env)       cmd_env "$@" ;;
    db:clone)  cmd_db_clone "$@" ;;
    check:images) cmd_check_images "$@" ;;
    prune)     cmd_prune "$@" ;;
    selftest)  cmd_selftest "$@" ;;
    dapr-token) cmd_dapr_token "$@" ;;
    ""|-h|--help|help) usage ;;
    *) printf 'unknown command: %s\n\n' "$cmd" >&2; usage; exit 2 ;;
  esac
}

main "$@"
