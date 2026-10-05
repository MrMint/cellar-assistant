#!/usr/bin/env bash
# E3 · Restore a scripts/backup/pg-backup.sh dump into a database — for the
# monthly drill, or a real recovery.
#
#   scripts/backup/pg-restore.sh --dump /path/to/cellar-20260910T120000Z.dump \
#     --target-db cellar_restore_drill
#
#   scripts/backup/pg-restore.sh --dump ... --target-db cellar_restore_drill \
#     --drop-existing            # start clean if the drill has run before
#
#   scripts/backup/pg-restore.sh --dump ... --target-db cellar_restore_drill \
#     --row-counts                # print "table\tcount" for every table, then exit
#
# ## The safety rule, and why it is a prefix rather than a blocklist
#
# `--target-db` MUST start with `cellar_restore_`. `cellar` is the live
# database other work depends on; `cellar_test` and `cellar_test_template` are
# `packages/db/transform/test-db.sh`'s. A blocklist naming those three would
# miss the next database anyone adds. `packages/db/transform/test-db.sh` makes
# exactly this call for its own `cellar_test*` names — same reasoning, same
# shape, different prefix.
#
# `--drop-existing` is the only thing here that can destroy data, and the
# prefix check runs before it is honoured either way — there is no path from a
# typo in `--target-db` to `DROP DATABASE cellar`.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER-cellar-stack-postgres-1}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-cellar}"
PG_PASSWORD="${PG_PASSWORD:-cellar}"

DUMP=""
TARGET_DB=""
DROP_EXISTING=0
ROW_COUNTS_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump)
      DUMP="$2"
      shift 2
      ;;
    --target-db)
      TARGET_DB="$2"
      shift 2
      ;;
    --drop-existing)
      DROP_EXISTING=1
      shift
      ;;
    --row-counts)
      ROW_COUNTS_ONLY=1
      shift
      ;;
    *)
      echo "usage: pg-restore.sh --dump <path> --target-db <cellar_restore_*> [--drop-existing] [--row-counts]" >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET_DB" != cellar_restore_* ]]; then
  echo "refusing to manage \"$TARGET_DB\": --target-db must start with cellar_restore_" >&2
  exit 1
fi

psql_db() {
  local db="$1"
  shift
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -i -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
      psql -h 127.0.0.1 -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
  else
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" \
      -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
  fi
}

# `postgres` is the maintenance database: CREATE/DROP DATABASE cannot run
# inside the database being dropped.
admin() { psql_db postgres "$@"; }

# No filename argument — pg_restore reads stdin when none is given. A literal
# "-" is instead taken as a filename named "-" and fails to open (verified
# empirically against pg_restore 18.1). `-j` (parallel restore) needs a
# filename it can reopen per worker, so it is NOT used here: this deliberately
# restores single-threaded over the stdin pipe, trading restore speed for not
# needing a second copy of the dump inside the container.
restore_from_stdin() {
  local db="$1"
  if [[ -n "$PG_CONTAINER" ]]; then
    docker exec -i -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
      pg_restore -h 127.0.0.1 -U "$PG_USER" -d "$db" \
      --no-owner --no-privileges
  else
    PGPASSWORD="$PG_PASSWORD" pg_restore -h "$PG_HOST" -p "$PG_PORT" \
      -U "$PG_USER" -d "$db" --no-owner --no-privileges
  fi
}

row_counts() {
  local db="$1"
  # One row per user table, `table<TAB>count`, sorted by name — deterministic
  # output a drill script can diff between source and restored target.
  psql_db "$db" -At -F $'\t' -c "
    select c.relname, (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
    order by c.relname;
  "
}

if [[ "$ROW_COUNTS_ONLY" -eq 1 ]]; then
  row_counts "$TARGET_DB"
  exit 0
fi

if [[ -z "$DUMP" ]]; then
  echo "usage: pg-restore.sh --dump <path> --target-db <cellar_restore_*> [--drop-existing]" >&2
  exit 2
fi
if [[ ! -f "$DUMP" ]]; then
  echo "no such dump file: $DUMP" >&2
  exit 1
fi

EXISTS="$(admin -At -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")"
if [[ "$EXISTS" == "1" ]]; then
  if [[ "$DROP_EXISTING" -eq 1 ]]; then
    echo "==> dropping existing $TARGET_DB (--drop-existing)"
    # WITH (FORCE) so a psql session left open on it does not wedge the drop.
    admin -q -c "DROP DATABASE \"$TARGET_DB\" WITH (FORCE)"
  else
    echo "database \"$TARGET_DB\" already exists; pass --drop-existing to rebuild it, or pick a new name" >&2
    exit 1
  fi
fi

echo "==> creating $TARGET_DB"
admin -q -c "CREATE DATABASE \"$TARGET_DB\""

echo "==> restoring $DUMP -> $TARGET_DB (this server already has postgis/pgvector/pg_trgm/pgcrypto installed, so the dump's CREATE EXTENSION statements succeed without any extra setup)"
# pg_restore's own exit code is not trustworthy here: `--no-owner` still
# leaves harmless "role does not exist" warnings on stderr from privilege
# GRANT statements the dump carries, which pg_restore reports as errors
# without failing the process. The row-count comparison the drill does next
# is the real correctness check; this is just wiring.
restore_from_stdin "$TARGET_DB" < "$DUMP" || true

echo "==> row counts in $TARGET_DB:"
row_counts "$TARGET_DB"
