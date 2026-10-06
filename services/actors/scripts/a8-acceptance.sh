#!/usr/bin/env bash
# A8's three acceptance criteria, against the running compose stack.
#
#   services/actors/scripts/a8-acceptance.sh upload   # PUT -> verify -> read presign -> GET
#   services/actors/scripts/a8-acceptance.sh endpoint # measure both presign authorities (E3)
#   services/actors/scripts/a8-acceptance.sh all
#
# Everything the unit tests can prove, they prove (`vitest run` in services/actors:
# `file-actor.test.ts`, `maintenance-actor.test.ts`). What is left needs a real
# host, a real sidecar and real MinIO: an actual signed PUT landing in the
# bucket, and `verify`/`presignRead` round-tripping through the live `files`
# binding. That is what this script is for.
#
# Requires: `bun run stack:up` and the actors app registered with FileActor
# (src/index.ts). No transformed database is required beyond what `bun run
# stack:up` already produces — this only exercises `files`, which is empty by
# default.
#
# Output: one `PASS: a8 <test>` / `FAIL: a8 <test>` line per test, then a
# `SUMMARY` line; `all` runs both whatever the first did. Exit status is the
# number of failed tests. (It used to print no verdict at all, and a PUT that
# came back 403 or a GET without `image/png` scrolled past as output.)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$ROOT/infra/docker-compose.yml"
dc() { docker compose -f "$COMPOSE" "$@"; }
psql_() { dc exec -T postgres psql -U "${POSTGRES_USER:-cellar}" -d "${POSTGRES_DB:-cellar}" "$@"; }
q() { psql_ -At -c "$1"; }

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }

# Invoke an actor method through the actors sidecar, from the *api* container
# (shares the network, not the actor host's own fate) — same pattern as
# a5-acceptance.sh's `invoke`.
invoke() {
  dc exec -T api node -e '
    const [type, id, method, args] = process.argv.slice(1);
    (async () => {
      const url = `http://actors-dapr:3502/v1.0/actors/${type}/${id}/method/${method}`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The sidecar API token this container was started with.
          "dapr-api-token": process.env.DAPR_API_TOKEN ?? "",
        },
        body: args,
        signal: AbortSignal.timeout(20000),
      });
      const text = await r.text();
      console.log(`HTTP ${r.status} ${text}`);
      if (!r.ok) process.exit(1);
    })().catch((e) => { console.error(e.message); process.exit(1); });
  ' "$1" "$2" "$3" "$4"
}

user_ctx() { printf '{"viewerId":"%s","kind":"user","requestId":"a8-acceptance"}' "$1"; }

# ---------------------------------------------------------------------------
# E3 note, because two steps below moved and it matters why.
#
# A presigned URL is only usable from a client that dials the authority it was
# signed for — SigV4 covers the `Host` header. Since E3 there are two:
#
#   browser-facing   FILES_S3_ENDPOINT/FILES_S3_PORT      localhost:9100
#   in-network       FILES_S3_INTERNAL_ENDPOINT/…_PORT    minio:9000
#
# So the PUT below runs from **this host**, with curl, because that is the
# position a browser is in and the upload URL is signed for browsers. It used
# to run inside the `actors` container, which worked only while everything was
# signed for `minio:9000` and no browser could upload at all. The read half is
# exercised from both positions on purpose: `presignRead` from the host,
# `presignReadInternal` from inside the network, which is what the AI seams do.
upload_test() {
  local file_id viewer target upload_url key bucket verified read_url read_url_json
  local internal_json internal_url png put_code get_headers remaining
  local problems=0
  problem() { echo "  !! $*"; problems=$(( problems + 1 )); }
  file_id="$(uuid)"; viewer="$(uuid)"
  png="$(mktemp -t a8pixel).png"
  # A real 1x1 PNG: `verify` decides the media type from the bytes and refuses
  # anything that is not an image, so this cannot be a text file any more.
  printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNoaGj4DwAFhAKAU5N0NgAAAABJRU5ErkJggg==' \
    | base64 -d > "$png"
  echo "== A8 upload protocol: file $file_id"

  echo "-- 1. FileActor.createUploadTarget (mints the row + a real PUT-presigned URL)"
  target="$(invoke FileActor "$file_id" createUploadTarget \
    "[$(user_ctx "$viewer"), {\"kind\":\"item-image\",\"contentType\":\"image/png\"}]")"
  echo "$target"
  case "$target" in HTTP\ 200\ *) ;; *) problem "createUploadTarget did not answer 200" ;; esac
  upload_url="$(echo "$target" | sed -n 's/.*"uploadUrl":"\([^"]*\)".*/\1/p' | sed 's/\\u0026/\&/g')"
  key="$(echo "$target" | sed -n 's/.*"key":"\([^"]*\)".*/\1/p')"
  bucket="$(echo "$target" | sed -n 's/.*"bucket":"\([^"]*\)".*/\1/p')"
  echo "-- parsed: bucket=$bucket key=$key"
  echo "-- signed for: $(echo "$upload_url" | sed -n 's#http://\([^/]*\)/.*#\1#p')  (the browser-facing authority)"
  echo "-- row committed (verified_at IS NULL — provisional):"
  q "select id, bucket, key, verified_at from files where id = '$file_id'"

  echo "-- 2. PUT from THIS HOST, exactly as a browser does — and claiming"
  echo "      Content-Type: text/html, which the signature does not cover, to"
  echo "      show what verify does about it (commit 7bdbc4da)"
  put_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X PUT -H 'content-type: text/html' --data-binary "@$png" "$upload_url")"
  echo "   PUT $put_code"
  [ "$put_code" = "200" ] || problem "the presigned PUT answered $put_code, not 200"

  echo "-- 3. FileActor.verify (never trusts the client's 'done' — reads the"
  echo "      first bytes through the binding, and rewrites the stored header)"
  verified="$(invoke FileActor "$file_id" verify "[$(user_ctx "$viewer")]")"
  echo "$verified"
  case "$verified" in
    *'"verifiedAt":"'*'"mimeType":"image/png"'*|*'"mimeType":"image/png"'*'"verifiedAt":"'*) ;;
    *) problem "verify did not return a verified image/png row" ;;
  esac
  echo "-- row after verify (mime_type is what the BYTES say, not what the PUT claimed):"
  q "select id, verified_at is not null as verified, size, etag, mime_type from files where id = '$file_id'"

  echo "-- 4. FileActor.presignRead — the browser's URL"
  read_url_json="$(invoke FileActor "$file_id" presignRead "[$(user_ctx "$viewer")]")"
  echo "$read_url_json"
  read_url="$(echo "$read_url_json" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p' | sed 's/\\u0026/\&/g')"

  echo "-- 5. GET it from this host, and check the headers a browser would get:"
  echo "      image/png (not the uploader's text/html) plus Content-Disposition"
  get_headers="$(curl -sS -D - -o /dev/null "$read_url" | sed -n '1p;/^[Cc]ontent-/p' | tr -d '\r')"
  printf '%s\n' "$get_headers" | sed 's/^/   /'
  printf '%s\n' "$get_headers" | head -1 | grep -q ' 200' \
    || problem "the presigned GET did not answer 200"
  printf '%s\n' "$get_headers" | grep -qi '^content-type: image/png' \
    || problem "the stored object is not served as image/png"

  echo "-- 6. FileActor.presignReadInternal — the same object for a caller inside"
  echo "      the network (src/lib/ai/images.ts), signed for a different authority"
  internal_json="$(invoke FileActor "$file_id" presignReadInternal "[$(user_ctx "$viewer")]")"
  internal_url="$(echo "$internal_json" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p' | sed 's/\\u0026/\&/g')"
  echo "   signed for: $(echo "$internal_url" | sed -n 's#http://\([^/]*\)/.*#\1#p')"
  dc exec -T actors node -e "
    (async () => {
      const res = await fetch(\"$internal_url\");
      const bytes = new Uint8Array(await res.arrayBuffer());
      console.log('   in-network GET:', res.status, bytes.byteLength, 'bytes');
      process.exit(res.ok && bytes.byteLength > 0 ? 0 : 1);
    })().catch((e) => { console.log('   in-network GET failed:', e.message); process.exit(1); });
  " || problem "the in-network GET of the internal URL failed"

  echo "-- cleanup"
  invoke FileActor "$file_id" delete "[$(user_ctx "$viewer")]" || problem "delete failed"
  remaining="$(q "select count(*) from files where id = '$file_id'")"
  echo "   remaining rows: $remaining"
  [ "$remaining" = "0" ] || problem "the files row survived delete"
  rm -f "$png"
  [ "$problems" -eq 0 ]
}

# ---------------------------------------------------------------------------
# The measurement E3 turns on, runnable rather than retold. Two agents lost a
# day each to a comment in this repo that recommended `host.docker.internal`,
# which does not resolve on a macOS host — so this now *checks* every candidate
# instead of asserting a conclusion.
endpoint_test() {
  echo "== E3 · which addresses reach MinIO, and from where"
  echo
  echo "-- the binding's endpoint (what the SIDECAR signs and dials):"
  grep -A1 'name: endpoint' "$ROOT/infra/dapr/components/files-binding.yaml" | sed 's/^/   /'
  echo "-- the app's two authorities (docker-compose.yml, services.actors):"
  dc exec -T actors env | grep '^FILES_S3_' | sort | sed 's/^/   /'
  echo
  echo "-- a presigned URL carries its authority INSIDE the signature"
  echo "   (X-Amz-SignedHeaders=host), so it is only valid from a client that"
  echo "   dials that exact host and port. Hence two URLs, not one:"
  local file_id viewer target upload_url endpoint_problems=""
  file_id="$(uuid)"; viewer="$(uuid)"
  target="$(invoke FileActor "$file_id" createUploadTarget "[$(user_ctx "$viewer"), {\"kind\":\"item-image\"}]")"
  upload_url="$(echo "$target" | sed -n 's/.*"uploadUrl":"\([^"]*\)".*/\1/p')"
  echo "   createUploadTarget -> $(echo "$upload_url" | sed -n 's#http://\([^/]*\)/.*#\1#p')"
  echo

  echo "-- reachability, measured now (200 = MinIO answered /minio/health/live):"
  case "$upload_url" in
    http://localhost:9100/*) ;;
    *) endpoint_problems="upload URL not signed for localhost:9100" ;;
  esac
  local candidate host code in_container
  for candidate in "localhost:9100" "minio:9000" "host.docker.internal:9100" "files.localhost:9100"; do
    host="$(printf '%s' "$candidate" | cut -d: -f1)"
    printf '   %-28s host: ' "$candidate"
    # The code, or the word — `%{http_code}` is "000" on a DNS failure, which
    # printed next to the fallback and read as "000unreachable".
    code="$(curl -sS -m 4 -o /dev/null -w '%{http_code}' "http://$candidate/minio/health/live" 2>/dev/null || true)"
    case "$code" in
      ""|000) printf 'unreachable' ;;
      *) printf '%s' "$code" ;;
    esac
    printf '   container: '
    in_container="$(dc exec -T actors node -e "
      fetch('http://$candidate/minio/health/live')
        .then((r) => process.stdout.write(String(r.status)))
        .catch(() => process.stdout.write('unreachable'));
    " 2>/dev/null)"
    printf '%s\n' "$in_container"
    # Only the two authorities the app actually signs for are asserted; the
    # other two are Docker Desktop facts, reported for the record.
    case "$candidate" in
      localhost:9100)
        [ "$code" = "200" ] || endpoint_problems="$endpoint_problems; localhost:9100 unreachable from the host" ;;
      minio:9000)
        [ "$in_container" = "200" ] || endpoint_problems="$endpoint_problems; minio:9000 unreachable from the actors container" ;;
    esac
  done
  echo
  echo "   Expected, and the whole reason the authority is split:"
  echo "     localhost:9100              host 200, container unreachable"
  echo "     minio:9000                  host unreachable, container 200"
  echo "     host.docker.internal:9100   host unreachable (Docker Desktop puts"
  echo "                                 that name in containers, not here),"
  echo "                                 container 200"
  echo "     files.localhost:9100        host 200, container unreachable EVEN"
  echo "                                 with an /etc/hosts entry: bun and"
  echo "                                 Chromium both hard-map .localhost to"
  echo "                                 loopback and never consult it"
  echo
  echo "   services/actors/src/lib/s3-presign.ts (§E3) has the full argument,"
  echo "   including the two single-hostname schemes that were rejected."
  invoke FileActor "$file_id" delete "[$(user_ctx "$viewer")]" >/dev/null 2>&1 || true
  if [ -n "$endpoint_problems" ]; then
    echo "  !! ${endpoint_problems#; }"
    return 1
  fi
}

# ---------------------------------------------------------------------------
PASSED=""
FAILED=""
run() { # run NAME — one PASS/FAIL line per test
  local name="$1"
  if "${name}_test"; then
    echo "PASS: a8 $name"
    PASSED="$PASSED $name"
  else
    echo "FAIL: a8 $name"
    FAILED="$FAILED $name"
  fi
}

case "${1:-all}" in
  upload|endpoint) run "$1" ;;
  all) run upload; echo; run endpoint ;;
  *) echo "usage: $0 {upload|endpoint|all}" >&2; exit 2 ;;
esac

failures="$(printf '%s' "$FAILED" | wc -w | tr -d ' ')"
echo
echo "SUMMARY a8: passed:${PASSED:- none}; failed:${FAILED:- none}"
exit "$failures"

