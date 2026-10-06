#!/usr/bin/env bash
# Rebuild the transformed baseline database from scratch, apply every numbered
# transform file in order, then bring it up to date with `db:migrate`.
#
#   packages/db/transform/run.sh              dump from Nhost, restore, transform
#   packages/db/transform/run.sh --no-dump    reuse the last dump, restore, transform
#
# A3 runs this against a *schema-only* dump of the local Nhost database, which is
# migration-identical to production. E1 runs the same numbered files against a
# real production dump *with data* — see README.md.
set -euo pipefail

SRC_CONTAINER="${SRC_CONTAINER:-epic-burnell-4b4be9-postgres-1}"
SRC_USER="${SRC_USER:-postgres}"
SRC_DB="${SRC_DB:-local}"

# `-` not `:-`: an explicitly empty DST_CONTAINER selects the TCP path below.
DST_CONTAINER="${DST_CONTAINER-cellar-stack-postgres-1}"
DST_USER="${DST_USER:-cellar}"
DST_PASSWORD="${DST_PASSWORD:-cellar}"
DST_DB="${DST_DB:-cellar}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
# Duplicated from `test-db.sh` deliberately — see the long note there under "the
# dump" for why this is repo-relative rather than `${TMPDIR:-/tmp}`. Short
# version: Turborepo strips `TMPDIR` in strict env mode, so that default
# resolved to two different files depending on whether the build came from
# `bun run test` or from a shell, and `$TMPDIR` is per-user rather than
# per-worktree, so every worktree on the machine shared one dump of whichever
# worktree's Nhost container happened to be dumped last.
#
# Only the default's directory is created; a caller-supplied path is the
# caller's business.
if [[ -z "${DUMP:-}" ]]; then
  DUMP="$REPO/node_modules/.cache/cellar-test-db/nhost-schema.sql"
  mkdir -p "$(dirname "$DUMP")"
fi

# Set `DST_CONTAINER=` (empty) to reach the target over TCP with a local psql
# instead — `PGHOST`/`PGPORT` say where. That is the only way to reach a CI
# service container, whose name is generated per job and cannot be written down.
if [[ -n "$DST_CONTAINER" ]]; then
  dst() { docker exec -i -e PGPASSWORD="$DST_PASSWORD" "$DST_CONTAINER" psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"; }
else
  dst() { PGPASSWORD="$DST_PASSWORD" psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"; }
fi

if [[ "${1:-}" != "--no-dump" ]]; then
  echo "==> schema-only dump: $SRC_CONTAINER/$SRC_DB -> $DUMP"
  # WRITTEN TO A PRIVATE TEMP AND RENAMED, never straight to $DUMP.
  #
  # $DUMP defaults to a *fixed* path — deliberately, because `--no-dump` reuses
  # it and `test-db.sh` fingerprints it. But two dumps writing that one path at
  # the same time interleave, and the result is a file that restores *partially
  # and silently*, or fails with
  #
  #   \unrestrict: wrong key
  #
  # which is pg_dump 18's `\restrict`/`\unrestrict` pair no longer matching
  # because the stream between them came from two processes. Observed, and it
  # succeeded on an immediate retry — the signature of a race.
  #
  # `test-db.sh`'s advisory lock cannot fix this one: this script is also run
  # directly to build a *development* database, which the lock does not cover
  # and should not, since it targets a different database entirely. The
  # collision is on the shared file, so the fix belongs on the file. `mv` within
  # one filesystem is atomic, so a concurrent reader sees the old complete dump
  # or the new complete dump and never a torn one.
  #
  # The other half of that fix is on `test-db.sh`'s side: when *it* calls this
  # script it overrides `$DUMP` to a per-invocation path inside its lock
  # directory, so a template build neither reads nor writes the shared cache
  # while it holds the lock. Atomicity here covers the remaining case, a
  # development build racing a test build.
  #
  # `pgbouncer` is Nhost connection-pooler bookkeeping and owns nothing the app
  # touches. Everything else (public, auth, storage, hdb_catalog, admin) comes
  # across so the transform has the real artifacts to drop.
  DUMP_PARTIAL="$DUMP.$$.partial"
  docker exec "$SRC_CONTAINER" pg_dump -U "$SRC_USER" -d "$SRC_DB" \
    --schema-only --no-owner --no-privileges --no-comments -N pgbouncer > "$DUMP_PARTIAL" \
    || { rm -f "$DUMP_PARTIAL"; echo "pg_dump failed; $DUMP left as it was" >&2; exit 1; }
  # The same completion check `scripts/cutover/cutover.sh` makes, for the same
  # reason: pg_dump ends every successful run with this line, so its absence is
  # the cheapest possible integrity check and the only one available before the
  # restore. A truncated dump otherwise restores partially and without error.
  if ! tail -n 5 "$DUMP_PARTIAL" | grep -q 'PostgreSQL database dump complete'; then
    rm -f "$DUMP_PARTIAL"
    echo "dump does not end with pg_dump's completion marker — it is truncated." >&2
    echo "A concurrent test-database build is a known cause; re-run before investigating." >&2
    exit 1
  fi
  mv -f "$DUMP_PARTIAL" "$DUMP"
fi

echo "==> reset $DST_CONTAINER/$DST_DB"
# Only the schemas the dump recreates, plus `public`, which also carries
# better-auth's five tables since X2 (`13_better_auth_tables.sql`). Any other
# database in this container and any other schema is left alone.
# `drizzle` is drizzle-kit's own bookkeeping schema, created by `pull --init`.
# It has to go too, or the next `pull --init` refuses with "database already has
# migrations set".
#
# `cellar_meta` holds the migration ledger (`packages/db/src/migrate/`). It MUST
# go with the schema it describes: a ledger that survived the reset would record
# every migration as applied to a database that had just been rebuilt from a
# dump without them, and `db:migrate` would then correctly do nothing.
dst -q -c "DROP SCHEMA IF EXISTS admin, auth, cellar_meta, drizzle, hdb_catalog, storage CASCADE;" \
       -c "DROP SCHEMA IF EXISTS public CASCADE;" \
       -c "CREATE SCHEMA public;" > /dev/null

echo "==> restore"
dst -q < "$DUMP" > /dev/null

for f in "$HERE"/[0-9][0-9]_*.sql; do
  echo "==> $(basename "$f")"
  dst -q < "$f"
done

# Every migration, through the one apply path (`db:migrate`,
# `packages/db/src/migrate/`), which records each in `cellar_meta.schema_migrations`.
#
# This used to be a loop over the migrations carrying the "Hand-written SQL lane"
# marker, re-applied on every build because they were idempotent, while every
# other post-baseline migration reached this database only because a numbered
# file above mirrored it by hand. Now: the transform is frozen at the ledger's
# horizon, `db:migrate` adopts everything up to it (records the baseline,
# re-applies the idempotent ones, probes the rest — `ledger.ts`) and applies
# every migration after it. A fresh build and a long-lived database therefore
# take the same path and end at the same ledger.
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
# Node 24 (.nvmrc) runs `.ts` through its own type stripping; an older one fails
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
