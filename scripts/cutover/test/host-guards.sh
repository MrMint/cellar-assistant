#!/usr/bin/env bash
# Three things the 2026-10-04 cutover rehearsal on Loki (Linux) found in
# scripts/cutover/cutover.sh that no macOS run could, each pinned by a case
# that ASSERTS and fails the run if it does not hold:
#
#   P   the DSN path runs the CLIENT. PG_CLIENT_IMAGE's entrypoint is
#       `/bin/init.sh`, which ignores its arguments and boots a Postgres server;
#       `docker run "$IMG" psql …` therefore started a server on the host
#       network. `SRC_DSN=… cutover.sh preflight` and `… dump` must succeed
#       with the DEFAULT image, and leave no container of it behind.
#   J   smoke's surviving-table comparison under GNU coreutils. A whole-line
#       `sort` fed `join`, and GNU join refuses `public.outbox` after
#       `public.outbox_dead_letter_acks` ("is not sorted"); BSD join passes.
#       Run inside a Debian container, so a Mac proves it too.
#   T   a host without `bunx` is refused BEFORE phase 1, naming bunx — not at
#       `baseline`, phase 10, with the site frozen.
#
#   scripts/cutover/test/host-guards.sh
#
# Needs: docker, Node 24 as `node` (preflight's host checks), and the compose
# stack's Postgres (same defaults and overrides as files-phase.sh):
#
#   CUT_TEST_PG_CONTAINER  cellar-stack-postgres-1   CUT_TEST_PG_PORT  5433
#   CUT_TEST_PG_USER       cellar      CUT_TEST_PG_PASSWORD  cellar
#   CUT_TEST_DEBIAN_IMAGE  node:24-bookworm-slim     (GNU coreutils for J)
#
# It creates one `cutguard_src_*` database (dropped on exit) and removes only
# containers of PG_CLIENT_IMAGE that did not exist when it started.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
CUT="$ROOT/scripts/cutover/cutover.sh"
CMP="$ROOT/scripts/cutover/compare-rowcounts.sh"
BASH_BIN="$(command -v bash)"

PG="${CUT_TEST_PG_CONTAINER:-cellar-stack-postgres-1}"
PG_PORT="${CUT_TEST_PG_PORT:-5433}"
PG_USER="${CUT_TEST_PG_USER:-cellar}"
PG_PASSWORD="${CUT_TEST_PG_PASSWORD:-cellar}"
DEBIAN_IMAGE="${CUT_TEST_DEBIAN_IMAGE:-node:24-bookworm-slim}"
# Read from cutover.sh itself, so the case tests the default it ships.
# shellcheck disable=SC2016  # a literal `${` in the pattern, not an expansion
IMG="$(sed -n 's/^PG_CLIENT_IMAGE="\${PG_CLIENT_IMAGE:-\(.*\)}"$/\1/p' "$CUT")"

H="$(mktemp -d "${TMPDIR:-/tmp}/cutguard.XXXXXX")"
TAG="$(date +%s)_$$"
SRCDB="cutguard_src_${TAG}"

FAILED=0; PASSED=0
pass() { PASSED=$((PASSED + 1)); printf 'HARNESS PASS %s\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf 'HARNESS FAIL %s\n' "$*"; }
check() { local what="$1"; shift; if "$@"; then pass "$what"; else fail "$what"; fi; }
has() { grep -qF -- "$2" "$1"; }
lacks() { ! grep -qF -- "$2" "$1"; }

PSQL() { docker exec -i "$PG" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -q "$@"; }
img_containers() { docker ps -aq --no-trunc --filter "ancestor=$IMG" | sort; }

BEFORE="$H/containers-before"
cleanup() {
  # A regression starts a server that never exits; remove what THIS run made.
  if [ -f "$BEFORE" ]; then
    img_containers | comm -13 "$BEFORE" - | while IFS= read -r c; do
      [ -n "$c" ] && docker rm -f "$c" > /dev/null 2>&1
    done
  fi
  PSQL -d postgres -c "DROP DATABASE IF EXISTS \"$SRCDB\" WITH (FORCE)" > /dev/null 2>&1
  rm -rf "$H"
}
trap cleanup EXIT

# `"$@"` with a deadline, since the bug under P hangs rather than fails when
# 5432 is free. macOS ships no `timeout`.
with_deadline() {
  local secs="$1" pid w rc; shift
  "$@" & pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2> /dev/null ) > /dev/null 2>&1 & w=$!
  wait "$pid"; rc=$?
  kill "$w" 2> /dev/null; wait "$w" 2> /dev/null
  return "$rc"
}

echo "cutover.sh under test: $ROOT (HEAD $(git -C "$ROOT" rev-parse --short HEAD))"
echo "postgres $PG (:$PG_PORT); PG_CLIENT_IMAGE default $IMG; GNU image $DEBIAN_IMAGE"
[ -n "$IMG" ] || { echo "could not read PG_CLIENT_IMAGE's default from $CUT"; exit 1; }

# ------------------------------------------------ P: the DSN path runs the client
# A Nhost-shaped source: the checked-in schema-only dump (X4) is what
# preflight.sql's questions are written against.
PSQL -d postgres -c "CREATE DATABASE \"$SRCDB\"" || exit 1
PSQL -d "$SRCDB" < "$ROOT/packages/db/transform/nhost-schema.sql" > "$H/schema-load.log" 2>&1 \
  || { tail -20 "$H/schema-load.log"; exit 1; }
docker image inspect "$IMG" > /dev/null 2>&1 || docker pull -q "$IMG" > /dev/null || exit 1
img_containers > "$BEFORE"

SRC="postgres://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${SRCDB}"
# rows-only and the host runner: the files path (its object stores, its
# docker runner) is files-phase.sh's business, not this case's.
with_deadline 180 env -u PG_CLIENT_IMAGE SRC_CONTAINER="" SRC_DSN="$SRC" WORK="$H/work-p" \
  FILES_MODE=rows-only FILES_RUNNER=host DST_CONTAINER="$PG" DST_HOST_PORT="$PG_PORT" \
  DST_USER="$PG_USER" DST_PASSWORD="$PG_PASSWORD" \
  "$BASH_BIN" "$CUT" preflight > "$H/P.out" 2>&1; RC=$?
check "P preflight over SRC_DSN with the default image exits 0 (got $RC)" [ "$RC" = 0 ]
check "P psql answered: preflight.txt carries the source's server_version" has "$H/work-p/preflight.txt" server_version
check "P psql answered: the row-count snapshot is non-empty" [ -s "$H/work-p/rowcounts-source.txt" ]
check "P no server boot in the output (init.sh's 'Initializing database')" lacks "$H/P.out" "Initializing database"

with_deadline 180 env -u PG_CLIENT_IMAGE SRC_CONTAINER="" SRC_DSN="$SRC" WORK="$H/work-p" \
  "$BASH_BIN" "$CUT" dump > "$H/P2.out" 2>&1; RC=$?
check "P dump over SRC_DSN with the default image exits 0 (got $RC)" [ "$RC" = 0 ]
check "P pg_dump answered: the archive is custom format" [ "$(head -c 5 "$H/work-p/nhost-full.dump" 2> /dev/null)" = PGDMP ]
check "P no container of $IMG left behind" diff -q "$BEFORE" <(img_containers)
if [ "$FAILED" != 0 ]; then echo "--- P.out"; tail -30 "$H/P.out"; echo "--- P2.out"; tail -30 "$H/P2.out"; fi

# ------------------------------------------------ J: smoke's comparison, GNU join
mkdir -p "$H/j"
printf '%s\n' 'public.outbox|5' 'public.outbox_dead_letter_acks|0' 'public.items|10' \
  'public.dropped_by_transform|3' 'auth.users|2' > "$H/j/source.txt"
printf '%s\n' 'public.outbox|4' 'public.outbox_dead_letter_acks|0' 'public.items|9' \
  'public.user|2' 'auth.users|2' > "$H/j/target.txt"
printf '  %-45s %s -> %s\n' public.items 10 9 public.outbox 5 4 > "$H/j/expected.txt"

docker run --rm -v "$ROOT/scripts/cutover:/cutover:ro" -v "$H/j:/j:ro" --entrypoint bash \
  "$DEBIAN_IMAGE" -c 'join --version | head -1; bash /cutover/compare-rowcounts.sh /j/source.txt /j/target.txt' \
  > "$H/J.out" 2> "$H/J.err"; RC=$?
check "J runs under GNU coreutils" has "$H/J.out" "(GNU coreutils)"
check "J GNU: compare-rowcounts.sh exits 0 (got $RC; stderr: $(tr '\n' ' ' < "$H/J.err"))" [ "$RC" = 0 ]
check "J GNU: exactly the two changed surviving tables, outbox included" \
  diff -u "$H/j/expected.txt" <(sed 1d "$H/J.out")
"$BASH_BIN" "$CMP" "$H/j/source.txt" "$H/j/target.txt" > "$H/J-host.out" 2>&1; RC=$?
check "J this host ($(uname -s)): same answer, exit $RC" diff -u "$H/j/expected.txt" "$H/J-host.out"

# ------------------------------------------------ T: bunx absent, refused before phase 1
# This PATH minus bunx: a symlink farm of every other program on it.
mkdir -p "$H/shim"
IFS=: read -r -a dirs <<< "$PATH"
for d in "${dirs[@]}"; do
  [ -d "$d" ] || continue
  for f in "$d"/*; do
    n="$(basename "$f")"
    [ "$n" = bunx ] && continue
    [ -x "$f" ] && [ ! -e "$H/shim/$n" ] && ln -s "$f" "$H/shim/$n"
  done
done
check "T the shim PATH really has no bunx" bash -c "! PATH='$H/shim' command -v bunx"
PATH="$H/shim" WORK="$H/work-t" "$BASH_BIN" "$CUT" baseline > "$H/T.out" 2>&1; RC=$?
check "T baseline without bunx exits non-zero (got $RC)" [ "$RC" != 0 ]
check "T the refusal names bunx" has "$H/T.out" "bunx (baseline)"
check "T no phase started (no '#####' header)" lacks "$H/T.out" "#####"
check "T refused before the target login, too" lacks "$H/T.out" "TCP"
PATH="$H/shim" WORK="$H/work-t" "$BASH_BIN" "$CUT" report > "$H/T2.out" 2>&1; RC=$?
check "T a run whose phases need no bunx is not refused for it (report exits $RC)" [ "$RC" = 0 ]
[ "$FAILED" = 0 ] || { echo "--- T.out"; cat "$H/T.out"; }

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
