#!/usr/bin/env bash
# E3 · Nightly MinIO backup: mirror MINIO_BUCKET (default `cellar-files`) to a
# dated local directory, with retention pruning.
#
#   scripts/backup/minio-backup.sh
#   BACKUP_ROOT=/mnt/backup-disk/cellar-assistant/minio scripts/backup/minio-backup.sh
#
# ## Why a throwaway `mc` container rather than a host-native `mc`
#
# `mc` is not installed on this host, and this repo already has an established
# pattern for exactly this — `infra/docker-compose.yml`'s `minio-init` service
# runs the same image the same way (`mc alias set` against the `minio` service
# name, over the compose network) to create the bucket on first boot. This
# script reuses that pattern rather than inventing a second one.
#
# On Loki, where MinIO's S3 port is published to `127.0.0.1:${MINIO_PORT}`
# specifically so host-side tooling can reach it (`infra/docker-compose.prod.yml`'s
# own comment on that port binding), a host-native `mc` binary talking to
# `http://127.0.0.1:${MINIO_PORT}` is the lighter-weight alternative — set
# `MC_MODE=host` for that path; this script still defaults to the
# container-network path (`MC_MODE=docker`) because that is what is actually
# installed and reachable from wherever this drill has been run so far.
#
# `mc mirror` is one-way and additive by design (it does not delete files at
# the destination that were removed from the source, matching a backup's
# purpose); each night gets its own dated directory instead of a single
# continuously-updated one, so a bucket object deleted in MinIO today does not
# silently vanish from every past backup too — restoring last week's directory
# restores exactly what existed a week ago.
set -euo pipefail

# The client image for MC_MODE=docker. The default is the same pin as
# `minio-init` in infra/docker-compose.yml: pgsty/mc, the client half of
# the silo fork. Its binary is still `mc`. `minio/mc` was deleted from
# Docker Hub in 2026-09. Override with MC_IMAGE (one variable, both
# scripts, and the compose file).
MC_IMAGE="${MC_IMAGE:-docker.io/pgsty/mc:RELEASE.2026-09-16T00-00-00Z@sha256:cfc83108c3abb371f8fb84d99c1fdc88f8c237e022409b0081fb7c0a3be634dd}"
MC_MODE="${MC_MODE:-docker}"
MC_NETWORK="${MC_NETWORK:-cellar-stack_default}"
MC_ENDPOINT="${MC_ENDPOINT:-http://minio:9000}"          # docker mode: the service DNS name
MC_HOST_ENDPOINT="${MC_HOST_ENDPOINT:-http://127.0.0.1:9100}" # host mode

MINIO_ROOT_USER="${MINIO_ROOT_USER:-cellar}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-cellar-dev-secret}"
MINIO_BUCKET="${MINIO_BUCKET:-cellar-files}"

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/cellar-assistant-backups/minio}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST_HOST_DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST_HOST_DIR"

echo "==> mirroring bucket \"$MINIO_BUCKET\" -> $DEST_HOST_DIR (mode=$MC_MODE)"

if [[ "$MC_MODE" == "docker" ]]; then
  # `-v "$DEST_HOST_DIR:/backup"`: mc writes directly into the host directory,
  # so there is no second copy-and-clean-up step after the container exits.
  docker run --rm \
    --network "$MC_NETWORK" \
    -v "$DEST_HOST_DIR:/backup" \
    --entrypoint /bin/sh \
    "$MC_IMAGE" -c "
      set -eu
      mc alias set src '$MC_ENDPOINT' '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' > /dev/null
      mc mirror --quiet 'src/$MINIO_BUCKET' /backup
      echo 'objects mirrored:' \$(mc ls -r 'src/$MINIO_BUCKET' 2>/dev/null | wc -l)
    "
else
  if ! command -v mc > /dev/null; then
    echo "MC_MODE=host but no 'mc' binary on PATH. Install it (https://min.io/docs/minio/linux/reference/minio-mc.html) or leave MC_MODE=docker." >&2
    exit 1
  fi
  mc alias set src "$MC_HOST_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null
  mc mirror --quiet "src/$MINIO_BUCKET" "$DEST_HOST_DIR"
  echo "objects mirrored: $(mc ls -r "src/$MINIO_BUCKET" | wc -l)"
fi

LOCAL_COUNT="$(find "$DEST_HOST_DIR" -type f | wc -l | tr -d ' ')"
echo "==> ok: $DEST_HOST_DIR ($LOCAL_COUNT files on disk)"

echo "==> pruning snapshots older than ${RETENTION_DAYS}d under $BACKUP_ROOT"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} +

echo "==> current snapshots:"
ls -1 "$BACKUP_ROOT"
