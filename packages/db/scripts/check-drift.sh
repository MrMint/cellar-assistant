#!/usr/bin/env bash
# Does packages/db/src/schema/tables.ts match the migrations? Fails if not.
#
#   bun run db:drift        (from packages/db; CI runs it on the packages/db leg)
#
# Two questions, both file-to-file — neither opens a database:
#
#   1. `drizzle-kit check`    — are the committed snapshots a consistent chain?
#   2. `drizzle-kit generate` — would a migration be generated right now? If so,
#      somebody changed tables.ts without committing the migration it implies
#      (or edited a snapshot), and every database built from the migrations is
#      a schema tables.ts no longer describes.
#
# (2) used to be asked in exactly one place: step 3 of `scripts/cutover/cutover.sh`'s
# `baseline` phase — i.e. for the first time during the production freeze. CI
# ran only (1), which validates the snapshot chain and says nothing about
# tables.ts.
#
# `generate` WRITES a migration directory when it finds a difference, so it runs
# against a SCRATCH COPY of migrations/ and the answer is whether a directory
# appeared there — more honest than parsing its stdout, and it can never leave
# a stray migration in the tree. The config it reads has to live inside
# packages/db (drizzle-kit resolves the config's own `import "drizzle-kit"`
# relative to the config's directory — cutover.sh's `baseline` phase measured
# the same thing), so a uniquely named one is written here and removed on exit.
#
# MIGRATIONS_SRC (default ./migrations) names the directory copied — used to
# prove this fails: point it at a copy missing its newest migration.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
SRC="${MIGRATIONS_SRC:-$HERE/migrations}"
[ -d "$SRC" ] || { echo "db:drift: no migrations directory at $SRC" >&2; exit 1; }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cellar-db-drift.XXXXXX")"
CONFIG="$HERE/drizzle.drift-check.$$.config.ts"
trap 'rm -rf "$SCRATCH"; rm -f "$CONFIG"' EXIT

cp -R "$SRC" "$SCRATCH/migrations"
cat > "$CONFIG" <<CFG
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/tables.ts",
  out: "$SCRATCH/migrations",
  schemaFilter: ["public"],
  extensionsFilters: ["postgis"],
});
CFG

list() { find "$SCRATCH/migrations" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort; }
before="$(list)"
count="$(printf '%s\n' "$before" | grep -c . || true)"
# A copy with nothing in it would make "no new directory" meaningless.
[ "$count" -gt 0 ] || { echo "db:drift: $SRC holds no migrations" >&2; exit 1; }

echo "==> drizzle-kit check (snapshot chain, $count migrations)"
bunx drizzle-kit check --config="$CONFIG"

echo "==> drizzle-kit generate against a scratch copy (tables.ts vs the latest snapshot)"
bunx drizzle-kit generate --config="$CONFIG"
after="$(list)"
new="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))"
if [ -n "$new" ]; then
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    echo "::error::drizzle-kit generate would write $(basename "$dir"):" >&2
    sed 's/^/    /' "$dir/migration.sql" >&2
  done <<< "$new"
  echo "" >&2
  echo "packages/db/src/schema/tables.ts no longer matches packages/db/migrations." >&2
  echo "Run \`bun run db:generate\` in packages/db and commit the migration it writes" >&2
  echo "(db:migrate applies it everywhere — do not mirror it into transform/)," >&2
  echo "or revert the tables.ts change." >&2
  exit 1
fi
echo "==> no drift: tables.ts matches the latest snapshot"
