#!/usr/bin/env bash
# Start the actor host on a chosen runtime, drive representative traffic at it,
# and leave the evidence on disk.
#
#   services/actors/scripts/soak/run-soak.sh bun   --seconds 1800
#   services/actors/scripts/soak/run-soak.sh node  --seconds 1800
#   services/actors/scripts/soak/run-soak.sh bun   --seconds 86400 --detach
#   services/actors/scripts/soak/run-soak.sh ab    --seconds 1800      # node, then bun
#
# The host-run lane (`bun run dev:up`, docs/architecture/local-dev-stacks.md)
# starts both apps under `dapr run -f .stack/<slug>/dapr.yaml`. This script does
# the same thing with a **variant** run file: the actors app's `command:` is
# rewritten to the runtime under test plus `scripts/soak/instrument.mjs`, and
# `SOAK_*` is added to its `env:`. Everything else — placement, scheduler,
# components, the API app, the environment `stack.sh` exports — is untouched, so
# the only difference between the two arms of an A/B is the interpreter.
#
# ## Why it goes through `stack.sh run-file`
#
# A bare `dapr run -f` inherits none of what `dev:up` sets up; the isolation
# proof learned that the hard way (its stack B died on boot with
# `BETTER_AUTH_SECRET is required`, which made the crossed phase look like
# isolation). `stack.sh run-file` is the supported entry point for a variant run
# file and exports the same environment `up` does.
#
# ## Why the variant run file is written into `.stack/<slug>/`
#
# The generated run file carries `DATABASE_URL`. It is gitignored, per-worktree,
# and written 0600 — so its variants live beside it and are never printed.
#
# macOS ships bash 3.2: no associative arrays, no `${var,,}`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
STACK_SH="$REPO_ROOT/scripts/stack/stack.sh"

die() { echo "ERROR $*" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }

ARM_OUT=""
RUNTIME=""
SECONDS_ARG=1800
DETACH=0
VERIFY=1
DRIVER_RUNTIME=""
PASSTHROUGH=""

[ $# -gt 0 ] || die "usage: run-soak.sh <bun|node|ab> [--seconds N] [--detach] [--no-verify] [driver flags...]"
case "$1" in
  bun|node|ab) RUNTIME="$1"; shift ;;
  *) die "first argument must be bun, node or ab (got '$1')" ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --seconds) shift; SECONDS_ARG="$1" ;;
    --detach|-d) DETACH=1 ;;
    --no-verify) VERIFY=0 ;;
    --driver-runtime) shift; DRIVER_RUNTIME="$1" ;;
    *) PASSTHROUGH="$PASSTHROUGH $1" ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# This stack's identity and ports. `stack.sh env` prints `export` lines and
# deliberately omits DATABASE_URL (services/api refuses to start if it can see
# one); the driver does not need it — it reaches Postgres through
# `docker exec … psql`.
# ---------------------------------------------------------------------------
[ -x "$STACK_SH" ] || die "no $STACK_SH"
eval "$("$STACK_SH" env)"
: "${CELLAR_STACK_SLUG:?stack.sh env did not export CELLAR_STACK_SLUG}"
STACK_DIR="$REPO_ROOT/.stack/$CELLAR_STACK_SLUG"
RUN_FILE="$STACK_DIR/dapr.yaml"
[ -f "$RUN_FILE" ] || die "no $RUN_FILE — run \`bun run dev:up --detach\` first"

# Node 24 is required for `node src/index.ts` (type stripping). A shell whose
# default node is 20 produces `Unknown file extension \".ts\"` from inside daprd's
# child, several layers away from anything that says so.
if [ -d "$HOME/.local/share/fnm/node-versions/v24.14.0/installation/bin" ]; then
  PATH="$HOME/.local/share/fnm/node-versions/v24.14.0/installation/bin:$PATH"
  export PATH
fi
node_major="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
[ "$node_major" -ge 24 ] || die "node on PATH is v$node_major; the node arm needs >= 24 for type stripping"

# ---------------------------------------------------------------------------
# write_variant <runtime> <out-file> <sample-file>
#
# Rewrites the FIRST app block's `command:` (the actors app — the run template
# puts it first, and the substitution asserts it found exactly one actors block)
# and adds the SOAK_* env it needs.
# ---------------------------------------------------------------------------
write_variant() {
  local runtime="$1" out="$2" samples="$3"
  ( umask 077
    RUNTIME="$runtime" SAMPLES="$samples" python3 - "$RUN_FILE" "$out" <<'PY'
import os, sys

src, dst = sys.argv[1], sys.argv[2]
runtime = os.environ["RUNTIME"]
samples = os.environ["SAMPLES"]

if runtime == "bun":
    command = '["bun", "--preload", "./scripts/soak/instrument.mjs", "src/index.ts"]'
else:
    # --expose-gc so the sampler can ask for a collection before reading RSS;
    # without it Node's RSS trend is dominated by when the GC felt like running.
    command = ('["node", "--expose-gc", "--import", '
               '"./scripts/soak/instrument.mjs", "src/index.ts"]')

lines = open(src).read().split("\n")
out, replaced, in_actors, injected = [], 0, False, False
for line in lines:
    stripped = line.strip()
    if stripped.startswith("- appID:"):
        in_actors = "actors-" in stripped
    if in_actors and stripped.startswith("command:"):
        indent = line[: len(line) - len(line.lstrip())]
        out.append(f"{indent}command: {command}")
        replaced += 1
        continue
    if in_actors and not injected and stripped == "env:":
        out.append(line)
        indent = line[: len(line) - len(line.lstrip())] + "  "
        out.append(f'{indent}SOAK_SAMPLE_PATH: "{samples}"')
        out.append(f'{indent}SOAK_SAMPLE_INTERVAL_MS: "5000"')
        injected = True
        continue
    out.append(line)

if replaced != 1:
    sys.exit(f"expected exactly one actors `command:` line, rewrote {replaced}")
if not injected:
    sys.exit("could not find the actors app's `env:` block")

open(dst, "w").write("\n".join(out))
PY
  ) || die "could not write the $runtime variant run file"
}

# ---------------------------------------------------------------------------
# Stop whatever is serving this stack, WITHOUT touching the compose project.
#
# `stack.sh down` takes the infra down too, which would mean a fresh Postgres
# and a fresh scheduler between the two arms of an A/B — i.e. not an A/B. This
# is `stop_run_for_stack` from stack.sh, replicated rather than exported: two
# `dapr run -f` sets for one stack fight over the same ports and the survivor
# answers `did not find address for actor '<Type>/<id>'`.
# ---------------------------------------------------------------------------
stop_apps() {
  local f
  for f in "$STACK_DIR"/dapr*.yaml; do
    [ -f "$f" ] || continue
    dapr stop -f "$f" >/dev/null 2>&1 || true
  done
  for f in "$STACK_DIR"/*.pid "$STACK_DIR"/soak/*/dapr-run.pid; do
    [ -f "$f" ] || continue
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  done
  # `dapr stop` is not synchronous about the app's own children, and a
  # machine-wide `pgrep` would match another worktree's stack, so this waits on
  # the clock rather than on a process match it cannot scope.
  sleep 3
}

# ---------------------------------------------------------------------------
# one_arm <runtime>
# ---------------------------------------------------------------------------
one_arm() {
  local runtime="$1"
  local stamp out variant samples log pid
  stamp="$(date +%Y%m%d-%H%M%S)"
  out="$STACK_DIR/soak/$runtime-$stamp"
  mkdir -p "$out"
  variant="$STACK_DIR/dapr.soak-$runtime.yaml"
  samples="$out/host-samples.jsonl"
  log="$out/dapr-run.log"
  pid="$out/dapr-run.pid"

  say "arm: $runtime — out $out"
  write_variant "$runtime" "$variant" "$samples"

  stop_apps
  "$STACK_SH" run-file "$variant" --detach --log "$log" --pid "$pid" \
    || die "could not start the $runtime arm"

  say "waiting for the actor path"
  "$STACK_SH" wait || die "$runtime arm never became ready — see $log"

  # Which interpreter actually ended up running it — asserted, not assumed: the
  # whole experiment is void if the run file did not take.
  #
  # The pid comes from the instrument's own `boot` record, not from `pgrep`. A
  # machine-wide `pgrep -f src/index.ts` matches every other worktree's actor
  # host too — the command line is relative, so it carries no app directory to
  # filter on — and sampling the wrong process is exactly the kind of quiet
  # wrongness this exercise exists to avoid. The sample file is per-arm, so its
  # boot record can only be this arm's process.
  local host_pid
  host_pid="$(SAMPLES="$samples" RUNTIME="$runtime" python3 "$HERE/boot-record.py" \
    | tee "$out/host-command.txt" | tail -1)" \
    || die "could not confirm the runtime from $samples"
  [ -n "$host_pid" ] || die "cannot find the actor host process"

  if [ "$VERIFY" -eq 1 ]; then
    say "functional acceptance ($runtime)"
    "$APP_DIR/scripts/runtime-acceptance.sh" | tee "$out/acceptance.txt" \
      || die "acceptance failed on $runtime — see $out/acceptance.txt"
  fi

  say "soak ($runtime, ${SECONDS_ARG}s)"
  local driver="${DRIVER_RUNTIME:-$runtime}"
  # shellcheck disable=SC2086
  ARM_OUT="$out"
  ( cd "$APP_DIR" && "$driver" scripts/soak/soak.ts \
      --seconds "$SECONDS_ARG" \
      --out "$out" \
      --label "$runtime" \
      --dapr-port "$ACTORS_DAPR_HTTP_PORT" \
      --actors-port "$ACTORS_PORT" \
      --pg-container "$COMPOSE_PROJECT_NAME-postgres-1" \
      --host-samples "$samples" \
      --host-pid "$host_pid" \
      $PASSTHROUGH ) 2>&1 | tee "$out/driver.log"
}

main() {
  if [ "$DETACH" -eq 1 ]; then
    # Unattended: re-exec detached so a 24 h run outlives the shell.
    local log="$STACK_DIR/soak/detached-$RUNTIME-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$(dirname "$log")"
    say "detaching; log: $log"
    # shellcheck disable=SC2086
    nohup "$0" "$RUNTIME" --seconds "$SECONDS_ARG" \
      $([ "$VERIFY" -eq 0 ] && echo --no-verify) $PASSTHROUGH \
      > "$log" 2>&1 &
    echo "pid $!"
    return 0
  fi

  case "$RUNTIME" in
    ab)
      say "A/B: node first, then bun, same stack, same traffic"
      one_arm node; node_out="$ARM_OUT"
      one_arm bun;  bun_out="$ARM_OUT"
      say "comparison"
      python3 "$HERE/compare.py" "$node_out/summary.json" "$bun_out/summary.json"
      ;;
    *)
      one_arm "$RUNTIME"
      ;;
  esac
}

main
