#!/usr/bin/env bash
# E3 · Restore a scripts/backup/minio-backup.sh snapshot into a bucket — for
# the monthly drill, or a real recovery.
#
#   scripts/backup/minio-restore.sh \
#     --source "$HOME/cellar-assistant-backups/minio/20260910T220000Z" \
#     --target-bucket cellar-files-restore-drill
#
# ## The safety rule
#
# `--target-bucket` MUST start with `cellar-files-restore-`, and this script
# creates it — it never restores into an existing bucket, `cellar-files`
# included. Same shape as pg-restore.sh's `cellar_restore_` prefix check, same
# reason: a typo in the flag must not be able to reach the real bucket.
set -euo pipefail

# The client image for MC_MODE=docker. The default is the same pin as
# `minio-init` in infra/docker-compose.yml: pgsty/mc, the client half of
# the silo fork. Its binary is still `mc`. `minio/mc` was deleted from
# Docker Hub in 2026-09. Override with MC_IMAGE (one variable, both
# scripts, and the compose file).
MC_IMAGE="${MC_IMAGE:-docker.io/pgsty/mc:RELEASE.2026-09-16T00-00-00Z@sha256:cfc83108c3abb371f8fb84d99c1fdc88f8c237e022409b0081fb7c0a3be634dd}"
MC_MODE="${MC_MODE:-docker}"
MC_NETWORK="${MC_NETWORK:-cellar-stack_default}"
MC_ENDPOINT="${MC_ENDPOINT:-http://minio:9000}"
MC_HOST_ENDPOINT="${MC_HOST_ENDPOINT:-http://127.0.0.1:9100}"

MINIO_ROOT_USER="${MINIO_ROOT_USER:-cellar}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-cellar-dev-secret}"

SOURCE=""
TARGET_BUCKET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --target-bucket)
      TARGET_BUCKET="$2"
      shift 2
      ;;
    *)
      echo "usage: minio-restore.sh --source <backup-dir> --target-bucket <cellar-files-restore-*>" >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET_BUCKET" != cellar-files-restore-* ]]; then
  echo "refusing to manage \"$TARGET_BUCKET\": --target-bucket must start with cellar-files-restore-" >&2
  exit 1
fi
if [[ -z "$SOURCE" || ! -d "$SOURCE" ]]; then
  echo "no such source directory: ${SOURCE:-<unset>}" >&2
  exit 1
fi
SOURCE="$(cd "$SOURCE" && pwd)"

echo "==> restoring $SOURCE -> bucket \"$TARGET_BUCKET\" (mode=$MC_MODE)"

if [[ "$MC_MODE" == "docker" ]]; then
  docker run --rm \
    --network "$MC_NETWORK" \
    -v "$SOURCE:/restore:ro" \
    --entrypoint /bin/sh \
    "$MC_IMAGE" -c "
      set -eu
      mc alias set dst '$MC_ENDPOINT' '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' > /dev/null
      mc mb --ignore-existing 'dst/$TARGET_BUCKET'
      mc mirror --quiet /restore 'dst/$TARGET_BUCKET'
      echo 'objects restored:' \$(mc ls -r 'dst/$TARGET_BUCKET' 2>/dev/null | wc -l)
    "
else
  if ! command -v mc > /dev/null; then
    echo "MC_MODE=host but no 'mc' binary on PATH." >&2
    exit 1
  fi
  mc alias set dst "$MC_HOST_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null
  mc mb --ignore-existing "dst/$TARGET_BUCKET"
  mc mirror --quiet "$SOURCE" "dst/$TARGET_BUCKET"
  echo "objects restored: $(mc ls -r "dst/$TARGET_BUCKET" | wc -l)"
fi

echo "==> done. To remove this throwaway bucket when the drill is finished:"
echo "    docker run --rm --network $MC_NETWORK --entrypoint /bin/sh $MC_IMAGE -c \\"
echo "        \"mc alias set dst '$MC_ENDPOINT' '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' && mc rb --force dst/$TARGET_BUCKET\""
