#!/usr/bin/env bash
# Rebuild a database from scratch: restore the checked-in baseline, then bring
# it up to date with `db:migrate`.
#
#   packages/db/baseline/build.sh
#
# The input is `schema.sql` beside this script: a schema-only dump at the
# migration ledger's horizon, pinned by checksum in
# `../src/migrate/baseline-freeze.test.ts`. `BASELINE=<file>` names another
# file; `test-db.sh` uses that to restore a private copy it has fingerprinted.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "usage: build.sh   (configure with DST_CONTAINER, DST_USER, DST_PASSWORD, DST_DB, BASELINE)" >&2
  exit 2
fi

# `-` not `:-`: an explicitly empty DST_CONTAINER selects the TCP path below.
DST_CONTAINER="${DST_CONTAINER-cellar-stack-postgres-1}"
DST_USER="${DST_USER:-cellar}"
DST_PASSWORD="${DST_PASSWORD:-cellar}"
DST_DB="${DST_DB:-cellar}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BASELINE="${BASELINE:-$HERE/schema.sql}"

# Set `DST_CONTAINER=` (empty) to reach the target over TCP with a local psql
# instead — `PGHOST`/`PGPORT` say where. That is the only way to reach a CI
# service container, whose name is generated per job and cannot be written down.
if [[ -n "$DST_CONTAINER" ]]; then
  dst() { docker exec -i -e PGPASSWORD="$DST_PASSWORD" "$DST_CONTAINER" psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"; }
else
  dst() { PGPASSWORD="$DST_PASSWORD" psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"; }
fi

# Checked before the reset, not discovered by it: the reset drops every schema
# the restore would recreate, so a missing input would otherwise leave the
# target empty and the error pointing at the restore.
if [[ ! -f "$BASELINE" ]]; then
  echo "no baseline at $BASELINE; nothing to restore, and $DST_DB was left as it was." >&2
  exit 1
fi

echo "==> reset $DST_CONTAINER/$DST_DB"
# Only the schemas the baseline recreates, plus `public`. Any other database in
# this container and any other schema is left alone. `drizzle` is drizzle-kit's
# own bookkeeping schema, created by `pull --init`; it has to go too, or the
# next `pull --init` refuses with "database already has migrations set".
#
# `cellar_meta` holds the migration ledger (`packages/db/src/migrate/`). It MUST
# go with the schema it describes: a ledger that survived the reset would record
# every migration as applied to a database that had just been rebuilt from a
# baseline without them, and `db:migrate` would then correctly do nothing.
dst -q -c "DROP SCHEMA IF EXISTS admin, cellar_meta, drizzle, storage CASCADE;" \
       -c "DROP SCHEMA IF EXISTS public CASCADE;" \
       -c "CREATE SCHEMA public;" > /dev/null

echo "==> restore $BASELINE"
dst -q < "$BASELINE" > /dev/null

# Every migration, through the one apply path (`db:migrate`,
# `packages/db/src/migrate/`), which records each in `cellar_meta.schema_migrations`.
# It adopts everything up to the horizon (records the baseline, re-applies the
# idempotent ones, probes the rest — `ledger.ts`) and applies every migration
# after it, so a fresh build and a long-lived database end at the same ledger.
#
# `db:migrate` is node + `pg`, so it reaches the target over TCP rather than
# through `dst`. With `DST_CONTAINER` set that is the container's published
# 5432 (the same derivation `test-db.sh` uses for its seed step); with it empty,
# `PGHOST`/`PGPORT`, as for `dst` itself.
if [[ -n "$DST_CONTAINER" ]]; then
  mapped="$(docker port "$DST_CONTAINER" 5432/tcp 2>/dev/null | head -1)"
  if [[ -z "$mapped" ]]; then
    echo "could not read the published 5432 port of container '$DST_CONTAINER'; db:migrate needs TCP" >&2
    exit 1
  fi
  migrate_port="${mapped##*:}"
else
  migrate_port="${PGPORT:-5432}"
fi
# Node 26 (.nvmrc) runs `.ts` through its own type stripping; an older one fails
# with an ESM loader error that names neither the version nor this step.
node "$REPO/scripts/check-node-version.mjs" > /dev/null
# The value goes through the environment, not argv: under `bun run --bun` (the
# vitest globalSetup that calls `test-db.sh`), `node` on PATH is bun, whose
# `-e` argv is laid out differently, and `process.argv[1]` was `undefined` —
# measured, as `password authentication failed for user "undefined"`.
urlenc() { URLENC_VALUE="$1" node -e 'process.stdout.write(encodeURIComponent(process.env.URLENC_VALUE ?? ""))'; }
echo "==> db:migrate"
node "$REPO/packages/db/src/migrate/cli.ts" \
  --url "postgres://$(urlenc "$DST_USER"):$(urlenc "$DST_PASSWORD")@${PGHOST:-localhost}:${migrate_port}/$(urlenc "$DST_DB")"

echo "==> done"
dst -At -c "SELECT 'public relations: ' || count(*) FROM information_schema.tables WHERE table_schema = 'public';"
dst -At -c "SELECT 'schemas: ' || string_agg(nspname, ', ' ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema';"
dst -At -c "SELECT 'enum types: ' || count(DISTINCT t.typname) FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e';"
