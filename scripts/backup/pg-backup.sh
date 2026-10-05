#!/usr/bin/env bash
# E3 · Nightly Postgres backup: a custom-format `pg_dump` of `cellar` (or
# whatever PG_DB names), written somewhere other than the volume the live
# database lives on, with retention pruning and an integrity self-check.
#
#   scripts/backup/pg-backup.sh
#   BACKUP_ROOT=/mnt/backup-disk/cellar-assistant/postgres scripts/backup/pg-backup.sh
#   RETENTION_DAYS=30 scripts/backup/pg-backup.sh
#
# ## Where this runs
#
# On Loki, `infra/docker-compose.prod.yml` publishes Postgres on
# `127.0.0.1:${POSTGRES_PORT}` specifically so "the backup job (scripts/backup/)
# ... run[s] on this host" (that file's own comment) — i.e. a host-native
# `pg_dump`/`pg_restore` over loopback TCP, not a container. That is
# `PG_CONTAINER=""` below.
#
# This development sandbox has neither `pg_dump` nor `pg_restore` installed on
# the host (checked; PATH has none), so the default here instead runs them via
# `docker exec` into the already-running postgres container — matching
# `packages/db/transform/test-db.sh`'s own `DST_CONTAINER` convention exactly
# (same tool, same house pattern, same reason: it is what actually works on
# whichever machine the script is run from).
#
# ## Format and the self-check
#
# `-Fc` (custom format): compressed, and the only format `pg_restore --list`
# can index without doing a full restore — which is what makes the self-check
# below cheap. A plain SQL dump only proves the file is well-formed text;
# `pg_restore --list` proves pg_restore can actually parse the archive's table
# of contents, which is closer to "this file restores" than "this file is not
# empty". `--list` reads its input as a single sequential stream, so it works
# over the same stdin pipe the docker-exec path already uses for the dump
# itself — no second copy of the file has to reach the container.
set -euo pipefail

# `-` not `:-`: an explicitly empty PG_CONTAINER selects the host/TCP path.
PG_CONTAINER="${PG_CONTAINER-cellar-stack-postgres-1}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-cellar}"
PG_PASSWORD="${PG_PASSWORD:-cellar}"
PG_DB="${PG_DB:-cellar}"

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/cellar-assistant-backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

sha() { if command -v shasum > /dev/null; then shasum -a 256; else sha256sum; fi; }

# Writes the dump to stdout, uncompressed by this script (pg_dump -Fc already
# compresses the archive internally).
dump_to_stdout() {
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
      pg_dump -h 127.0.0.1 -U "$PG_USER" -d "$PG_DB" -Fc
  else
    PGPASSWORD="$PG_PASSWORD" pg_dump -h "$PG_HOST" -p "$PG_PORT" \
      -U "$PG_USER" -d "$PG_DB" -Fc
  fi
}

# Reads a custom-format archive from stdin and prints its TOC. pg_restore 18
# reads stdin when given NO filename at all — a literal "-" is instead taken
# as a filename named "-" and fails with "could not open input file"
# (verified empirically; this is not documented clearly either way).
restore_list_from_stdin() {
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -i "$PG_CONTAINER" pg_restore --list
  else
    pg_restore --list
  fi
}

mkdir -p "$BACKUP_ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_ROOT/cellar-${STAMP}.dump"
TMP="${FINAL}.partial"

echo "==> dumping database \"$PG_DB\" (container=${PG_CONTAINER:-<host>}) -> $TMP"
dump_to_stdout > "$TMP"

SIZE="$(wc -c < "$TMP" | tr -d ' ')"
if [[ "$SIZE" -lt 1000 ]]; then
  echo "refusing to accept a ${SIZE}-byte dump as valid; leaving $TMP for inspection" >&2
  exit 1
fi

echo "==> verifying archive TOC parses (pg_restore --list)"
TOC="$(restore_list_from_stdin < "$TMP" 2> /dev/null || true)"
# Every table pg-restore.sh will later report a row count for is one "TABLE
# DATA" entry in the TOC; counting them is a cheap corruption/completeness
# signal that does not require an actual restore.
TABLE_COUNT="$(printf '%s\n' "$TOC" | grep -c 'TABLE DATA' || true)"
if [[ -z "$TOC" || "$TABLE_COUNT" -eq 0 ]]; then
  echo "pg_restore --list found no table data in $TMP; refusing to publish it" >&2
  exit 1
fi

mv "$TMP" "$FINAL"
sha < "$FINAL" | awk '{print $1}' > "$FINAL.sha256"

echo "==> ok: $FINAL"
echo "    size:   $(du -h "$FINAL" | cut -f1)"
echo "    tables: $TABLE_COUNT"
echo "    sha256: $(cat "$FINAL.sha256")"

echo "==> pruning dumps older than ${RETENTION_DAYS}d under $BACKUP_ROOT"
find "$BACKUP_ROOT" -maxdepth 1 -name 'cellar-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete
find "$BACKUP_ROOT" -maxdepth 1 -name 'cellar-*.dump.sha256' -mtime "+${RETENTION_DAYS}" -print -delete

echo "==> current backups:"
ls -lh "$BACKUP_ROOT"/cellar-*.dump 2> /dev/null || echo "    (only the one just written)"
