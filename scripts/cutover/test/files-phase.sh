#!/usr/bin/env bash
# The REAL scripts/cutover/cutover.sh, driven end to end on scratch state:
# the `files` phase in every mode it has, its pre-phase refusals, and the
# `dump` / `restore` pair. Every case ASSERTS — an exit status, an output line,
# a row count, the bytes in a bucket — and the run exits non-zero if any case
# did not hold. Nothing here is a demonstration that prints and passes.
#
#   scripts/cutover/test/files-phase.sh          # CI: the compose stack's names
#
# What it needs, and the defaults (the compose stack CI and `bun run stack:up`
# start — override every one for another Postgres/MinIO pair):
#
#   CUT_TEST_PG_CONTAINER  cellar-stack-postgres-1   a Postgres 18 to docker-exec into
#   CUT_TEST_PG_PORT       5433                      its published port on this host
#   CUT_TEST_PG_USER       cellar      CUT_TEST_PG_PASSWORD  cellar
#   CUT_TEST_S3_CONTAINER  cellar-stack-minio-1      a MinIO, reached two ways:
#   CUT_TEST_S3_PORT       9100                      from this host (localhost:<port>)
#   CUT_TEST_NETWORK       cellar-stack_default      and from a container on this network
#   CUT_TEST_S3_ACCESS     cellar      CUT_TEST_S3_SECRET    cellar-dev-secret
#
# plus `bun`, `docker`, Node 24 as `node` (or NODE_BIN), and `bun install`
# done for services/actors. Everything it creates carries this run's tag and
# is removed on exit: two `cutfiles_*` databases and three `cutfiles-*`
# buckets. It never touches another database or bucket.
#
# The cases, and the one line each proves:
#   A   storage-api, host runner: 5 objects byte-identical under key = id
#   A2  rerun: copies nothing (skipped_present=5), fetches nothing
#   B   storage-api outside a rehearsal with a local URL: refused before phase 1
#   C   storage-api without the admin secret: refused before phase 1
#   D   a wrong admin secret: refused by the preflight, nothing copied
#   E   docker runner, `dump files` with SRC_CONTAINER: the preflight's known
#       file comes from the SOURCE database; the secret is never in docker argv
#   F   SOURCE_MODE=s3 (the local rehearsal path): byte-identical
#   G   FILES_MODE=rows-only: 5 rows, 0 objects, 0 GETs, all 5 carrying the
#       rows-only marker; then a full run (A) copies 5 and leaves 0 marked
#   M   a rows-only row whose object is missing at the source: the full run
#       exits 0, and `files` still dies on the marked row it leaves
#   H   SKIP_FILES=1: refused before phase 1, pointing at FILES_MODE=rows-only
#   R   `dump restore`: a custom-format archive round-trips; a truncated one is
#       refused BEFORE the target is reset
#   S   the admin secret appears in no output at all
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
CUT="$ROOT/scripts/cutover/cutover.sh"

PG="${CUT_TEST_PG_CONTAINER:-cellar-stack-postgres-1}"
PG_PORT="${CUT_TEST_PG_PORT:-5433}"
PG_USER="${CUT_TEST_PG_USER:-cellar}"
PG_PASSWORD="${CUT_TEST_PG_PASSWORD:-cellar}"
S3_CONTAINER="${CUT_TEST_S3_CONTAINER:-cellar-stack-minio-1}"
S3_PORT="${CUT_TEST_S3_PORT:-9100}"
NETWORK="${CUT_TEST_NETWORK:-cellar-stack_default}"
S3_ACCESS="${CUT_TEST_S3_ACCESS:-cellar}"
S3_SECRET="${CUT_TEST_S3_SECRET:-cellar-dev-secret}"

H="$(mktemp -d "${TMPDIR:-/tmp}/cutfiles.XXXXXX")"
mkdir -p "$H/work" "$H/shim"
TAG="$(date +%s)_$$"
DB="cutfiles_${TAG}"; SRCDB="cutfiles_src_${TAG}"
B1="cutfiles-a-${TAG//_/-}"; B2="cutfiles-e-${TAG//_/-}"; B3="cutfiles-f-${TAG//_/-}"
SECRET="harness-secret-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

FAILED=0; PASSED=0
pass() { PASSED=$((PASSED + 1)); printf 'HARNESS PASS %s\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf 'HARNESS FAIL %s\n' "$*"; }
check() { local what="$1"; shift; if "$@"; then pass "$what"; else fail "$what"; fi; }
has() { grep -qF -- "$2" "$1"; }

PSQL() { docker exec -i "$PG" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -q "$@"; }
S3() {
  ( cd "$ROOT/services/actors" && CUT_TEST_S3_PORT="$S3_PORT" CUT_TEST_S3_ACCESS="$S3_ACCESS" \
    CUT_TEST_S3_SECRET="$S3_SECRET" bun -e '
  const { Client } = await import("minio");
  const c = new Client({ endPoint: "localhost", port: Number(process.env.CUT_TEST_S3_PORT),
    useSSL: false, accessKey: process.env.CUT_TEST_S3_ACCESS, secretKey: process.env.CUT_TEST_S3_SECRET });
  const [op, b] = process.argv.slice(1);
  const keys = async () => { const k = []; for await (const o of c.listObjectsV2(b, "", true)) k.push(o.name); return k.sort(); };
  if (op === "mk") await c.makeBucket(b);
  if (op === "count") console.log((await keys()).length);
  if (op === "sha") {
    const { createHash } = await import("node:crypto");
    for (const k of await keys()) {
      const h = createHash("sha256");
      for await (const ch of await c.getObject(b, k)) h.update(ch);
      console.log(k, h.digest("hex"));
    }
  }
  if (op === "rm") { const k = await keys(); if (k.length) await c.removeObjects(b, k); await c.removeBucket(b); }
' "$@" )
}

STUB_PID=""
cleanup() {
  [ -n "$STUB_PID" ] && kill "$STUB_PID" 2> /dev/null
  PSQL -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    -c "DROP DATABASE IF EXISTS \"$SRCDB\" WITH (FORCE)" > /dev/null 2>&1
  for b in "$B1" "$B2" "$B3"; do S3 rm "$b" > /dev/null 2>&1; done
  rm -rf "$H"
}
trap cleanup EXIT

echo "cutover.sh under test: $ROOT (HEAD $(git -C "$ROOT" rev-parse --short HEAD))"
echo "postgres $PG (:$PG_PORT), minio $S3_CONTAINER (:$S3_PORT), network $NETWORK"

# ------------------------------------------------------------------ fixtures
PSQL -d postgres -c "CREATE DATABASE \"$DB\"" -c "CREATE DATABASE \"$SRCDB\"" || exit 1
DDL="CREATE SCHEMA storage; CREATE TABLE storage.files (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, bucket_id text DEFAULT 'default' NOT NULL, name text, size integer, mime_type text, etag text, is_uploaded boolean DEFAULT false, uploaded_by_user_id uuid, metadata jsonb);"
PSQL -d "$DB" -c "$DDL" && PSQL -d "$SRCDB" -c "$DDL" || exit 1
FILES_DDL="$(sed -n '/^CREATE TABLE IF NOT EXISTS public.files (/,/^);/p;/^CREATE UNIQUE INDEX IF NOT EXISTS files_bucket_key_idx/,/;/p' "$ROOT/packages/db/transform/06_new_tables.sql")"
[ -n "$FILES_DDL" ] || { echo "06_new_tables.sql no longer has the files table this harness reads"; exit 1; }
printf '%s\n' "$FILES_DDL" | PSQL -d "$DB" || exit 1

md5hex() { if command -v md5sum > /dev/null; then md5sum | cut -d' ' -f1; else md5 -q; fi; }
sha256hex() { if command -v sha256sum > /dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
uuid() { od -An -N16 -tx1 /dev/urandom | tr -d ' \n' | sed -E 's/^(.{8})(.{4}).(.{3}).(.{3})(.{12})$/\1-\2-4\3-a\4-\5/'; }

printf '{"secret":"%s","files":[' "$SECRET" > "$H/manifest.json"
sep=""
for i in 1 2 3 4 5 6; do
  id="$(uuid)"; size=$((2000 * i))
  head -c "$size" /dev/urandom > "$H/body"
  hex="$(od -An -v -tx1 "$H/body" | tr -d ' \n')"
  md5="$(md5hex < "$H/body")"
  extra=""; [ "$i" = 2 ] && extra=',"throttle":1'
  printf '%s{"id":"%s","hex":"%s"%s}' "$sep" "$id" "$hex" "$extra" >> "$H/manifest.json"; sep=","
  if [ "$i" = 6 ]; then
    # Only in the SOURCE database: case E proves the preflight's known id came
    # from SRC, not from the target.
    PSQL -d "$SRCDB" -c "INSERT INTO storage.files (id,name,size,mime_type,etag,is_uploaded) VALUES ('$id','f$i',$size,'image/png','\"$md5\"',true)" || exit 1
    echo "$id" > "$H/src-only-id"
  else
    PSQL -d "$DB" -c "INSERT INTO storage.files (id,name,size,mime_type,etag,is_uploaded,created_at) VALUES ('$id','f$i',$size,'image/png','\"$md5\"',true, now() + interval '$i seconds')" || exit 1
    echo "$id $(sha256hex < "$H/body")" >> "$H/expected-sha"
  fi
done
echo ']}' >> "$H/manifest.json"
sort -o "$H/expected-sha" "$H/expected-sha"

( cd "$ROOT/services/actors" && exec bun scripts/migrate-files-stub-serve.ts "$H/manifest.json" "$H/port" "$H/stublog.json" ) &
STUB_PID=$!
for _ in $(seq 1 100); do [ -s "$H/port" ] && break; sleep 0.1; done
[ -s "$H/port" ] || { echo "the stub Storage API did not start"; exit 1; }
PORT="$(cat "$H/port")"
for b in "$B1" "$B2" "$B3"; do S3 mk "$b" || exit 1; done

# A docker shim that records every argv it is given, then runs the real one.
REAL_DOCKER="$(command -v docker)"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s"\nexec "%s" "$@"\n' "$H/docker-argv.log" "$REAL_DOCKER" > "$H/shim/docker"
chmod +x "$H/shim/docker"

base_env=(DST_CONTAINER="$PG" DST_DB="$DB" DST_HOST_PORT="$PG_PORT" DST_USER="$PG_USER" DST_PASSWORD="$PG_PASSWORD"
  WORK="$H/work" SOURCE_MODE=storage-api
  TARGET_S3_ACCESS_KEY="$S3_ACCESS" TARGET_S3_SECRET_KEY="$S3_SECRET" FILES_PROGRESS_MS=100 FILES_RETRY_BASE_MS=10)
host_env=(FILES_RUNNER=host SOURCE_STORAGE_URL="http://127.0.0.1:$PORT/v1" TARGET_S3_ENDPOINT=localhost TARGET_S3_PORT="$S3_PORT" TARGET_S3_BUCKET="$B1")
RC=0
run() {
  local name="$1"; shift
  printf '\n===== %s\n' "$name"
  env "$@" bash "$CUT" files > "$H/$name.out" 2>&1; RC=$?
  sed 's/\x1b\[[0-9;]*m//g' "$H/$name.out" > "$H/$name.txt"
  cat "$H/$name.txt"
}
rows() { PSQL -d "$DB" -At -c "$1"; }
MARKER="cutoverRowsOnly"
marked() { rows "SELECT count(*) FROM files WHERE metadata ? '$MARKER'"; }
gets_total() { bun -e 'const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(Object.values(l.gets).reduce((a, b) => a + b, 0))' "$H/stublog.json"; }
sleep 0.3

check "the marker key agrees: cutover.sh" grep -qx "ROWS_ONLY_MARKER=$MARKER" "$CUT"
check "the marker key agrees: migrate-files-core.ts" grep -qF "export const ROWS_ONLY_MARKER = \"$MARKER\";" "$ROOT/services/actors/scripts/migrate-files-core.ts"

# ------------------------------------------------------------------ G first: rows-only on an empty target
run G-rows-only "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 FILES_MODE=rows-only \
  SOURCE_MODE=not-a-mode SOURCE_ADMIN_SECRET= TARGET_S3_ACCESS_KEY= TARGET_S3_SECRET_KEY=
check "G rows-only exits 0" [ "$RC" = 0 ]
check "G says objects were not copied" has "$H/G-rows-only.txt" "objects   NOT COPIED (--rows-only)"
check "G preflight checked no object store" has "$H/G-rows-only.txt" "no object store is contacted"
check "G wrote 5 rows (key = id, verified)" [ "$(rows "SELECT count(*) FROM files WHERE key = id::text AND bucket = '$B1' AND verified_at IS NOT NULL")" = 5 ]
check "G copied no object" [ "$(S3 count "$B1")" = 0 ]
check "G marked all 5 rows $MARKER" [ "$(marked)" = 5 ]
sleep 0.3
check "G fetched nothing from the source" [ "$(gets_total)" = 0 ]

# ------------------------------------------------------------------ A: the full copy after rows-only
run A-rehearsal-host "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SOURCE_ADMIN_SECRET="$SECRET"
check "A exits 0" [ "$RC" = 0 ]
check "A copies the 5 objects behind the rows-only rows" has "$H/A-rehearsal-host.txt" "objects   copied=5 skipped_present=0 missing_at_source=0 size_mismatch=0 hash_mismatch=0 failed=0"
check "A leaves the rows as they were" has "$H/A-rehearsal-host.txt" "rows      inserted=0 unchanged=5"
S3 sha "$B1" > "$H/got-a"
check "A is byte-identical under key = id" diff -q "$H/expected-sha" "$H/got-a"
check "A cleared the marker from all 5 rows" [ "$(marked)" = 0 ]
check "A counts them confirmed" has "$H/A-rehearsal-host.txt" "rows      inserted=0 unchanged=5 confirmed=5 unconfirmed=0"
check "A's files phase checked for marked rows" has "$H/A-rehearsal-host.txt" "no files row carries metadata.$MARKER"

run A2-rerun "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SOURCE_ADMIN_SECRET="$SECRET"
before="$(gets_total)"
check "A2 exits 0" [ "$RC" = 0 ]
check "A2 copies nothing" has "$H/A2-rerun.txt" "objects   copied=0 skipped_present=5"
sleep 0.3
check "A2 fetched no body" [ "$(gets_total)" = "$before" ]

# ------------------------------------------------------------------ M: a marked row a full run cannot confirm
# A new uploaded row the stub has no object for: rows-only marks it (and only
# it — the 5 verified rows stay unmarked); the full run finds it missing at the
# source, which alone exits 0, and phase_files must still refuse.
gone="$(uuid)"
PSQL -d "$DB" -c "INSERT INTO storage.files (id,name,size,mime_type,etag,is_uploaded) VALUES ('$gone','gone',10,'image/png','\"0123456789abcdef0123456789abcdef\"',true)" > /dev/null
run M1-rows-only "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 FILES_MODE=rows-only \
  SOURCE_MODE=not-a-mode SOURCE_ADMIN_SECRET= TARGET_S3_ACCESS_KEY= TARGET_S3_SECRET_KEY=
check "M1 rows-only exits 0" [ "$RC" = 0 ]
check "M1 marked only the new row" [ "$(marked)" = 1 ]
check "M1 marked it on the new id" [ "$(rows "SELECT id FROM files WHERE metadata ? '$MARKER'")" = "$gone" ]
run M2-full "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SOURCE_ADMIN_SECRET="$SECRET"
check "M2 refused" [ "$RC" != 0 ]
check "M2 migrate-files counted it missing" has "$H/M2-full.txt" "missing_at_source=1"
check "M2 migrate-files reported it unconfirmed" has "$H/M2-full.txt" "unconfirmed $gone"
check "M2 phase_files names the marked row" has "$H/M2-full.txt" "1 files row(s) still carry metadata.$MARKER"
check "M2 the row is still marked" [ "$(marked)" = 1 ]
printf '\n===== M3-smoke-gate\n'
env "${base_env[@]}" CUTOVER_REHEARSAL=1 FILES_MODE=full bash "$CUT" smoke > "$H/M3.out" 2>&1; RC=$?
sed 's/\x1b\[[0-9;]*m//g' "$H/M3.out" > "$H/M3-smoke-gate.txt"; cat "$H/M3-smoke-gate.txt"
check "M3 smoke refused" [ "$RC" != 0 ]
check "M3 smoke names the marked row" has "$H/M3-smoke-gate.txt" "smoke: 1 files row(s) still carry metadata.$MARKER"
PSQL -d "$DB" -c "DELETE FROM files WHERE id = '$gone'" -c "DELETE FROM storage.files WHERE id = '$gone'" > /dev/null

# ------------------------------------------------------------------ refusals: nothing runs
run B-not-rehearsal-local-url "${base_env[@]}" "${host_env[@]}" SOURCE_ADMIN_SECRET="$SECRET"
check "B refused" [ "$RC" != 0 ]
check "B names the local URL" has "$H/B-not-rehearsal-local-url.txt" "is a local storage API, and this is not a declared rehearsal"
check "B ran no phase" sh -c "! grep -q '##### files' '$H/B-not-rehearsal-local-url.txt'"

run C-no-secret "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SOURCE_ADMIN_SECRET=
check "C refused" [ "$RC" != 0 ]
check "C names the missing secret" has "$H/C-no-secret.txt" "needs SOURCE_ADMIN_SECRET"

run D-wrong-secret "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SOURCE_ADMIN_SECRET=wrong-secret-12345
check "D refused" [ "$RC" != 0 ]
check "D's preflight says the secret was refused" has "$H/D-wrong-secret.txt" "refused the admin secret: HTTP 403"
check "D ran no phase" sh -c "! grep -q '##### files' '$H/D-wrong-secret.txt'"

run H-skip-files "${base_env[@]}" "${host_env[@]}" CUTOVER_REHEARSAL=1 SKIP_FILES=1 SOURCE_ADMIN_SECRET="$SECRET"
check "H refused" [ "$RC" != 0 ]
check "H points at FILES_MODE=rows-only" has "$H/H-skip-files.txt" "SKIP_FILES is gone"
check "H ran no phase" sh -c "! grep -q '#####' '$H/H-skip-files.txt'"

# ------------------------------------------------------------------ E: docker runner, dump + files from SRC_CONTAINER
printf '\n===== E-docker-runner\n'
env "${base_env[@]}" PATH="$H/shim:$PATH" FILES_RUNNER=docker FILES_NETWORKS="$NETWORK" \
  SRC_CONTAINER="$PG" SRC_USER="$PG_USER" SRC_DB="$SRCDB" \
  SOURCE_STORAGE_URL="http://host.docker.internal:$PORT/v1" TARGET_S3_ENDPOINT="$S3_CONTAINER" TARGET_S3_PORT=9000 TARGET_S3_BUCKET="$B2" \
  SOURCE_ADMIN_SECRET="$SECRET" bash "$CUT" dump files > "$H/E.out" 2>&1; RC=$?
sed 's/\x1b\[[0-9;]*m//g' "$H/E.out" > "$H/E.txt"; cat "$H/E.txt"
check "E exits 0" [ "$RC" = 0 ]
check "E's preflight probed the SOURCE-only file" has "$H/E.txt" "known file $(cat "$H/src-only-id") -> 200"
S3 sha "$B2" > "$H/got-e"
check "E is byte-identical via the docker runner" diff -q "$H/expected-sha" "$H/got-e"
check "E passed the secret by name only" has "$H/docker-argv.log" "-e SOURCE_ADMIN_SECRET "
check "E never put the secret in docker argv" sh -c "! grep -qF -- '$SECRET' '$H/docker-argv.log'"

# ------------------------------------------------------------------ F: SOURCE_MODE=s3
run F-s3-mode "${base_env[@]}" FILES_RUNNER=host CUTOVER_REHEARSAL=1 SOURCE_MODE=s3 \
  SOURCE_S3_ENDPOINT=localhost SOURCE_S3_PORT="$S3_PORT" SOURCE_S3_ACCESS_KEY="$S3_ACCESS" SOURCE_S3_SECRET_KEY="$S3_SECRET" SOURCE_S3_BUCKET="$B1" \
  TARGET_S3_ENDPOINT=localhost TARGET_S3_PORT="$S3_PORT" TARGET_S3_BUCKET="$B3"
check "F exits 0" [ "$RC" = 0 ]
S3 sha "$B3" > "$H/got-f"
check "F is byte-identical via SOURCE_MODE=s3" diff -q "$H/expected-sha" "$H/got-f"

# ------------------------------------------------------------------ R: dump + restore, and a truncated archive
printf '\n===== R-dump-restore\n'
PSQL -d "$SRCDB" -c "CREATE TABLE public.r_probe (id int PRIMARY KEY, v text); INSERT INTO public.r_probe SELECT g, md5(g::text) FROM generate_series(1, 5000) g; CREATE INDEX r_probe_v ON public.r_probe (v);"
env "${base_env[@]}" SRC_CONTAINER="$PG" SRC_USER="$PG_USER" SRC_DB="$SRCDB" \
  bash "$CUT" dump restore > "$H/R.out" 2>&1; RC=$?
sed 's/\x1b\[[0-9;]*m//g' "$H/R.out" > "$H/R.txt"; cat "$H/R.txt"
check "R exits 0" [ "$RC" = 0 ]
check "R wrote a custom-format archive" sh -c "head -c 5 '$H/work/nhost-full.dump' | grep -q PGDMP"
check "R restored every row" [ "$(rows "SELECT count(*) FROM public.r_probe")" = 5000 ]
check "R restored the index" [ "$(rows "SELECT count(*) FROM pg_indexes WHERE indexname = 'r_probe_v'")" = 1 ]
check "R restored storage.files from the source" [ "$(rows "SELECT count(*) FROM storage.files")" = 1 ]
size="$(wc -c < "$H/work/nhost-full.dump" | tr -d ' ')"
head -c $((size * 2 / 3)) "$H/work/nhost-full.dump" > "$H/truncated.dump"
env "${base_env[@]}" DUMP="$H/truncated.dump" bash "$CUT" restore > "$H/R2.out" 2>&1; RC=$?
sed 's/\x1b\[[0-9;]*m//g' "$H/R2.out" > "$H/R2.txt"; cat "$H/R2.txt"
check "R refuses a truncated archive" [ "$RC" != 0 ]
check "R says why" has "$H/R2.txt" "does not read to the end"
check "R refused BEFORE resetting the target" [ "$(rows "SELECT count(*) FROM public.r_probe")" = 5000 ]

# ------------------------------------------------------------------ S: the secret, anywhere
check "S the admin secret is in no captured output" sh -c "! cat '$H'/*.out | grep -qF -- '$SECRET'"
check "S the stub saw the real secret (so the check above is not vacuous)" has "$H/stublog.json" '"manifest"'

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
