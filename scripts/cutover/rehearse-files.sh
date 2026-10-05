#!/usr/bin/env bash
# E1 · Exercise the file migration at volume, without touching Nhost.
#
# A8's file migration moved **0 objects** locally: this dev environment's
# `storage.files` is empty and the Nhost bucket holds no objects, so the
# mechanism is proven and the volume is not. A rehearsal that copies nothing
# tells you nothing about the phase that will dominate the real cutover.
#
# This seeds a synthetic corpus into the RESTORED COPY (never Nhost) and into a
# throwaway bucket in the stack's own MinIO, so `cutover.sh files` has real rows
# and real bytes to move. It also plants one `item_image` row pointing at one of
# them, which is what makes `09_item_file_fk_repoint.sql`'s guard fire — the
# ordering constraint that a schema-only rehearsal cannot see.
#
#   # after `cutover.sh restore transform-a`:
#   scripts/cutover/rehearse-files.sh seed 200 32     # 200 objects of 32 KiB
#   scripts/cutover/rehearse-files.sh prove-order     # 09 must ABORT here
#   SOURCE_S3_ENDPOINT=localhost SOURCE_S3_PORT=9100 \
#     SOURCE_S3_ACCESS_KEY=cellar SOURCE_S3_SECRET_KEY=cellar-dev-secret \
#     SOURCE_S3_BUCKET=cutover-rehearsal FILES_RUNNER=host \
#     scripts/cutover/cutover.sh files
#   scripts/cutover/cutover.sh transform-b users transform-c lane baseline smoke
#
# Source and target are the same MinIO here, different buckets, read under
# SOURCE_MODE=s3. That is enough for the engine: migrate-files.ts streams each
# object to the other bucket (FILES_CONCURRENCY at a time), so the copy loop,
# the skip-if-verified and the size/hash verify all run exactly as they will
# against two separate endpoints. Production reads Nhost Cloud through
# SOURCE_MODE=storage-api instead (README, "Reading the objects"), whose HTTP
# half this corpus does not exercise: `etag` is seeded NULL, so the MD5 check
# is skipped here too.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

DST_CONTAINER="${DST_CONTAINER:-cellar-stack-postgres-1}"
DST_USER="${DST_USER:-cellar}"
DST_PASSWORD="${DST_PASSWORD:-cellar}"
DST_DB="${DST_DB:-cellar}"

REHEARSAL_BUCKET="${REHEARSAL_BUCKET:-cutover-rehearsal}"
S3_ENDPOINT="${REHEARSAL_S3_ENDPOINT:-localhost}"
S3_PORT="${REHEARSAL_S3_PORT:-9100}"
S3_ACCESS_KEY="${REHEARSAL_S3_ACCESS_KEY:-cellar}"
S3_SECRET_KEY="${REHEARSAL_S3_SECRET_KEY:-cellar-dev-secret}"

export PATH="${NODE_BIN:-$HOME/.local/share/fnm/node-versions/v24.14.0/installation/bin}:$PATH"

dst() {
  docker exec -i -e PGPASSWORD="$DST_PASSWORD" "$DST_CONTAINER" \
    psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"
}
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

seed() {
  local n="${1:-200}" kb="${2:-32}"
  dst -At -c "SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='files'" \
    | grep -q 1 || die "storage.files is not present — run the restore phase first"
  dst -At -c "SELECT to_regclass('public.files')" | grep -q files \
    || die "public.files is not present — run transform-a (06 creates it) first"

  say "seeding $n synthetic storage.files rows of ${kb} KiB"
  # Ids are generated in SQL and re-read, so the object keys and the rows cannot
  # drift apart — key = id is A8's whole invariant.
  dst -q -c "
    CREATE TEMP TABLE seeded AS
    SELECT gen_random_uuid() AS id FROM generate_series(1, $n);
    INSERT INTO storage.files (id, bucket_id, name, size, mime_type, etag,
                               uploaded_by_user_id, is_uploaded, metadata)
    SELECT s.id, 'default', 'rehearsal/' || s.id || '.bin', $((kb * 1024)),
           'application/octet-stream', NULL,
           (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
           true, '{\"rehearsal\": true}'::jsonb
      FROM seeded s;
  " > /dev/null

  local ids_file="${TMPDIR:-/tmp}/cutover-rehearsal-ids.txt"
  dst -At -c "SELECT id FROM storage.files WHERE metadata->>'rehearsal' = 'true' ORDER BY id" > "$ids_file"
  say "$(wc -l < "$ids_file" | tr -d ' ') rows; ids in $ids_file"

  say "uploading $n objects to $REHEARSAL_BUCKET (key = id, exactly as Nhost stores them)"
  cat > "$ROOT/services/actors/.cutover-seed-objects.mjs" <<'EOF'
import { readFileSync } from "node:fs";
import { Client } from "minio";
const [idsFile, bucket, kb] = process.argv.slice(2);
const s3 = new Client({
  endPoint: process.env.S3_ENDPOINT, port: Number(process.env.S3_PORT),
  useSSL: false, region: "us-east-1",
  accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY,
});
if (!(await s3.bucketExists(bucket))) await s3.makeBucket(bucket, "us-east-1");
const ids = readFileSync(idsFile, "utf8").split("\n").filter(Boolean);
// Distinct bytes per object: identical payloads would let a broken copy that
// wrote the same object N times still pass the size check.
const body = (id) => {
  const b = Buffer.alloc(Number(kb) * 1024, 0);
  b.write(id, 0, "utf8");
  return b;
};
let n = 0;
for (const id of ids) {
  const b = body(id);
  await s3.putObject(bucket, id, b, b.length, { "Content-Type": "application/octet-stream" });
  if (++n % 50 === 0) console.log(`  ${n}/${ids.length}`);
}
console.log(`uploaded ${n} object(s) to ${bucket}`);
EOF
  ( cd "$ROOT/services/actors" \
    && S3_ENDPOINT="$S3_ENDPOINT" S3_PORT="$S3_PORT" \
       S3_ACCESS_KEY="$S3_ACCESS_KEY" S3_SECRET_KEY="$S3_SECRET_KEY" \
       node ./.cutover-seed-objects.mjs "$ids_file" "$REHEARSAL_BUCKET" "$kb" )
  rm -f "$ROOT/services/actors/.cutover-seed-objects.mjs"

  say "planting one item_image row so 09's guard has something to catch"
  dst -q -c "
    INSERT INTO item_image (id, user_id, file_id, wine_id, is_public)
    SELECT gen_random_uuid(),
           (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
           (SELECT id FROM storage.files WHERE metadata->>'rehearsal' = 'true' ORDER BY id LIMIT 1),
           (SELECT id FROM wines ORDER BY created_at LIMIT 1),
           true
     WHERE NOT EXISTS (SELECT 1 FROM item_image WHERE user_id IS NOT NULL AND file_id IN
             (SELECT id FROM storage.files WHERE metadata->>'rehearsal' = 'true'));
  " > /dev/null
  dst -c "SELECT (SELECT count(*) FROM storage.files) AS storage_files,
                 (SELECT count(*) FROM item_image)    AS item_image_rows,
                 (SELECT count(*) FROM files)         AS public_files;"
}

# The ordering constraint, demonstrated rather than asserted: run 09 while
# `public.files` is still empty and it must abort, naming migrate-files.ts.
prove_order() {
  say "running 09_item_file_fk_repoint.sql with public.files still empty"
  if dst -q < "$ROOT/packages/db/transform/09_item_file_fk_repoint.sql" 2> "${TMPDIR:-/tmp}/09.err"; then
    die "09 SUCCEEDED — the guard did not fire. Either no item_image row references a file, or the guard has regressed."
  fi
  grep -q "migrate-files" "${TMPDIR:-/tmp}/09.err" \
    || { cat "${TMPDIR:-/tmp}/09.err"; die "09 failed, but not with the expected guard message"; }
  printf '\033[32m    09 aborted as designed:\033[0m\n'
  sed 's/^/      /' "${TMPDIR:-/tmp}/09.err" | head -6
  say 'this is why the files phase runs between transform-a and transform-b'
}

clean() {
  say "removing the rehearsal bucket and rows"
  cat > "$ROOT/services/actors/.cutover-clean-objects.mjs" <<'EOF'
import { Client } from "minio";
const bucket = process.argv[2];
const s3 = new Client({
  endPoint: process.env.S3_ENDPOINT, port: Number(process.env.S3_PORT),
  useSSL: false, region: "us-east-1",
  accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY,
});
if (!(await s3.bucketExists(bucket))) { console.log("bucket absent"); process.exit(0); }
const keys = [];
await new Promise((res, rej) => {
  const s = s3.listObjectsV2(bucket, "", true);
  s.on("data", (o) => o.name && keys.push(o.name));
  s.on("end", res); s.on("error", rej);
});
if (keys.length) await s3.removeObjects(bucket, keys);
await s3.removeBucket(bucket);
console.log(`removed ${keys.length} object(s) and the bucket`);
EOF
  ( cd "$ROOT/services/actors" \
    && S3_ENDPOINT="$S3_ENDPOINT" S3_PORT="$S3_PORT" \
       S3_ACCESS_KEY="$S3_ACCESS_KEY" S3_SECRET_KEY="$S3_SECRET_KEY" \
       node ./.cutover-clean-objects.mjs "$REHEARSAL_BUCKET" )
  rm -f "$ROOT/services/actors/.cutover-clean-objects.mjs"
}

case "${1:-}" in
  seed)        shift; seed "${1:-200}" "${2:-32}" ;;
  prove-order) prove_order ;;
  clean)       clean ;;
  *) printf 'usage: %s {seed [N] [KiB]|prove-order|clean}\n' "$(basename "$0")" >&2; exit 2 ;;
esac
