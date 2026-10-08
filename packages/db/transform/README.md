# The cutover transform

Ordered, re-runnable SQL that turns a Hasura/Nhost database into the database the
new stack expects.

**Frozen since `06171a44`** at the migration ledger's horizon
(`20260927215215_budget_attribution_and_reservation_index`; `../src/migrate/ledger.ts`).
Every file here and `nhost-schema.sql` is pinned by checksum
(`../src/migrate/transform-freeze.test.ts`). A schema change is a new migration under
`../migrations`, applied to every database — this build included — by `db:migrate`,
which `run.sh` now ends with; it is **never** mirrored here. The old rule ("every
post-baseline migration needs a mirror in this directory") and the "Hand-written SQL
lane" marker that chose what `run.sh` re-applied are both retired. A fix to how Nhost
*data* is converted that leaves the resulting schema unchanged may still land: re-pin
in the same commit and show `cutover.sh`'s `baseline` phase passes. **A3 produced this first cut; E1 owns the final version** and
is the workstream that runs it against a real production dump *with data*.

A3 built and proved it against a **schema-only** dump of the local Nhost database
(container `epic-burnell-4b4be9-postgres-1`, database `local`), restored into the
PG18 container from `infra/docker-compose.yml` on host port 5433. Local Nhost is
migration-identical to production, so the DDL side is faithful; **nothing here has
ever run against real rows.** Every step that touches data is called out below.

## Running it

```bash
packages/db/transform/run.sh                            # restore nhost-schema.sql, transform, migrate
SRC_CONTAINER=<pg> packages/db/transform/run.sh --dump  # take a fresh dump from <pg> first
```

The default needs no Nhost — and since 2026-10-05 there is no local Nhost stack to dump from;
the rollback of record is a checkout of `82450ad1` (`docs/architecture/e4-decisions.md`
decisions 11 and 15). `--no-dump` is still accepted and means the default. `--dump` has no
default container: it used to be `epic-burnell-4b4be9-postgres-1`, a name that was right in one
worktree on one machine. A fresh dump goes to `node_modules/.cache/cellar-test-db/` unless
`DUMP` names a file, so it never lands on the checked-in baseline by accident.

### The checked-in baseline (X4)

`nhost-schema.sql` in this directory is a schema-only `pg_dump` of the local Nhost
database, taken the same way `run.sh` takes one (`--schema-only --no-owner
--no-privileges --no-comments -N pgbouncer`) and containing no rows — only DDL,
so it is safe to commit. CI has no Nhost container to dump from, which used to
mean `ACTORS_TEST_DB_OPTIONAL: "1"` and 589 silently skipped tests (X4). It is now
the default input of both `run.sh` and `test-db.sh`, locally and in CI.

It is a snapshot of the schema `nhost/migrations` produced, and those are frozen
legacy history since D9, so it should never need regenerating. If it ever does:
bring up the legacy stack from a `82450ad1` checkout, then
`SRC_CONTAINER=<its postgres> DUMP="$PWD/packages/db/transform/nhost-schema.sql"
packages/db/transform/run.sh --dump`, and re-pin it in
`../src/migrate/transform-freeze.test.ts` in the same commit.

**Neither build path needs the live Nhost container any more.** Measured:

```bash
# the test database
packages/db/transform/test-db.sh --rebuild                    # exit 0

# the cutover's whole schema path, into a scratch target
WORK=/tmp/x DUMP="$PWD/packages/db/transform/nhost-schema.sql" \
  DST_DB=<scratch> SKIP_FILES=1 \
  scripts/cutover/cutover.sh restore transform-a files transform-b \
                             users transform-c migrate baseline smoke   # exit 0
```

What still wants a live source is exactly the two phases whose job is to ask
production something: `preflight` (read-only questions) and `dump` (the rows).
A schema-only dump cannot stand in for either, and neither should it. The `files`
phase additionally needs the legacy MinIO when there are `storage.files` rows to
copy — with the checked-in dump there are none, so the object path is not
exercised.

The template fingerprint hashes `$DUMP`. It once hashed only `nhost/migrations`,
so **editing or regenerating `nhost-schema.sql` left a stale template reporting
itself current** — verified, and verified fixed: appending one comment line to a
copy of the dump forces a rebuild where it previously printed `is current`. The
`nhost/migrations` term was dropped on 2026-10-05, once the baseline became the
default input (it changed every fingerprint once), so nothing here reads `nhost/`.

### The test database

`services/actors`' suite does not run against `cellar`. `test-db.sh` builds
`cellar_test_template` with the same `run.sh` above, adds the ten reference
tables, and then hands each `vitest run` a `CREATE DATABASE ... TEMPLATE` clone
of it. It used to add the hand-written SQL lane as well — the four search
functions `02` drops — which meant `run.sh` alone produced a *development*
database missing them while the test database had them. X2 moved the lane into
`run.sh`, and the ledger replaced the lane with `db:migrate`, so both build paths
end at the same schema *and* the same ledger. The template fingerprint hashes every
migration and the migrator, not just the lane files. `services/actors`'
`vitest.config.ts` runs it automatically; run it by hand to force a rebuild,
which the fingerprint makes unnecessary after any change to its inputs:

```bash
packages/db/transform/test-db.sh --rebuild
```

It manages only databases named `cellar_test*` and refuses anything else, so
`cellar` — which since X2 holds better-auth's tables too — is unreachable from
it.

Source and target are environment variables at the top of `run.sh`
(`DUMP`, `SRC_CONTAINER` for `--dump`, `DST_CONTAINER`, …). E1 does not use
`run.sh` against production; `scripts/cutover/cutover.sh` runs the same numbered
files in its own phases against a production dump.

`run.sh` **drops and recreates the `admin`, `auth`, `cellar_meta`, `drizzle`,
`hdb_catalog`, `public` and `storage` schemas** in the target database — `cellar_meta`
is the migration ledger, which must go with the schema it describes — and then runs
`db:migrate` (`../src/migrate/`), which adopts the fresh build onto the ledger and
applies every migration after the horizon. It touches nothing else in that container
and no other database. `db:migrate` connects over TCP: the published port of
`DST_CONTAINER`, or `PGHOST`/`PGPORT` when that is empty.

Applying the numbered files a second time on an already-transformed database is a
no-op; a fresh `run.sh` twice in a row produces byte-identical `pg_dump` output.
Both were verified.

## What each file does

| File | What it does |
|---|---|
| `01_drop_hasura_artifacts.sql` | Drops every trigger on an application table whose function lives in `hdb_catalog` (Hasura's event triggers, matched by shape not by name), then `hdb_catalog` itself. |
| `02_drop_phantom_result_tables.sql` | Drops the four search functions and the four permanently-empty `RETURNS SETOF <table>` result tables Hasura forced them to use. |
| `03_drop_legacy_views_jobs_triggers.sql` | Drops the three read views, the two bespoke `*_jobs` tables, and the three application triggers whose logic moves into actors. |
| `04_enum_split.sql` | Turns twelve reference tables into native enum types and retypes the thirteen columns that referenced them (migration-plan §4; `permission_type` covers two). |
| `05_money_to_numeric.sql` | `place_menu_items.menu_item_price`: `money` → `numeric(10,2)`. |
| `06_new_tables.sql` | Creates `files`, `jobs` and `outbox`. Also adds `outbox.seq` and widens `outbox_due_idx` to `(run_after, seq)` on a database created before A7b. |
| `07_align_constraint_names.sql` | Renames foreign-key and primary-key constraints to the names Drizzle derives, so `pull` and `generate` agree. |
| `08_item_favorites_missing_uniques.sql` | Adds the per-type unique constraints `item_favorites` was missing for sake and tea (B4). Aborts rather than deduplicating. |
| `09_item_file_fk_repoint.sql` | Repoints B2's three `storage.files` foreign keys onto `public.files`. |
| `10_place_file_fk_repoint.sql` | The same for B5's `place_google_photos.storage_file_id`. |
| `11_drop_broken_sakes_country_default.sql` | Drops `sakes.country DEFAULT 'Japan'`, which no `country` row could satisfy. |
| `12_menu_scan_file_fk_repoint.sql` | The same for B8's two `menu_scans` image columns. |
| `13_better_auth_tables.sql` | Creates better-auth's `user`, `session`, `account`, `verification` and `jwks` in `public` (X2). |
| `14_repoint_user_fks.sql` | Moves the 31 `public.*` foreign keys off `auth.users(id)` onto `"user"(id)`, renaming them to Drizzle's convention. Aborts if any referenced id is missing from `"user"`. |
| `15_drop_auth_schema.sql` | `DROP SCHEMA auth CASCADE`, after checking every `auth.users` row has a `"user"` row. |
| `16_widen_menu_item_detected_type.sql` | Widens `place_menu_items.detected_item_type`'s check constraint to the eight values the scanner actually emits (B8b), up from the four plus `unknown` it was restricted to. |
| `17_target_indexes.sql` | `CREATE INDEX IF NOT EXISTS` for every index `src/schema/tables.ts` declares on a table the transform builds (E4 decision 1) — **145** when written; `13bcca04` added two. A lane-created table's index comes from its own migration instead, since `run.sh` applies the lane after every numbered file (`3b187a32`). Must run after `06` and `13`, whose tables it indexes; it no longer claims to be last. |
| `18_teas_country_fk.sql` | Gives `teas.country` the foreign key to `country(value)` the other five item types already had, mirroring migration `20260920005733_teas_country_fk` (`c53dde69`). Validates rather than `NOT VALID`, because no database it was checked against held a tea country; a production dump that does fails here, during the transform. |

### Why `17` exists, and what it changes about the cutover

Before it, the transform recreated exactly **one** index on a table the source
already had — `idx_cellars_privacy_public`, and only because `04` has to drop it
to retype `cellars.privacy`. The other ten `CREATE INDEX` statements in the
transform are on tables the transform itself creates. So **134 indexes reached
the transformed database only because the dump happened to carry them.**

That made A1's five a cutover blocker rather than a performance item. A1 is
recorded `done (local; the prod apply belongs to the user)`, so if production
lacked them the dump lacked them, and `cutover.sh`'s `baseline` phase — a
`drizzle-kit pull` diffed against `tables.ts` — produced a non-empty diff and
aborted **with the site already frozen.**

`17` removes the dependency on the source entirely. Measured: a dump with all 135
of its target-index statements stripped out transforms to a database whose
`pg_indexes` output is **byte-identical** to one built from the complete dump
(231 indexes each), and the `baseline` phase passes. With `17` removed from the
directory the same run fails at `baseline` with "the transformed database does
not match packages/db/src/schema/tables.ts" — which is the failure decision 1
describes.

`src/schema/target-indexes.test.ts` asserts the file's index names are exactly
the set `tables.ts` declares, read through `getTableConfig`. That is what stops
the gap reopening the next time somebody adds an index.

#### Build times inside the freeze window

Everything already present is a name check, so a production database that has
its indexes pays almost nothing. The cost of the worst case — *every* index built
from nothing — was measured on synthetic rows at a generous plausible scale
(200k `cellar_items`, 100k `places`, 50k `friends`, 20k each `item_vectors` /
`place_vectors` at halfvec(768), 8k `cellar_owners`, 5k `cellars`):

| | |
|---|---|
| all 145, single-threaded | **5.9 s** |
| the four HNSW vector indexes | 0.87–0.97 s each |
| the two `gin_trgm_ops` indexes on `places.name` | 0.63 s, 0.68 s |
| A1's five, together | **0.075 s** |

Single-threaded because `max_parallel_maintenance_workers` had to be set to 0:
the Postgres container's `/dev/shm` is 64 MB and a parallel build of these fails
with `could not resize shared memory segment`. That makes the number pessimistic
rather than optimistic, and it is worth knowing before the freeze — a production
host with a normal `/dev/shm` will be faster, and one configured like this
container will fail a *parallel* index build, which is a reason to keep this step
plain rather than clever.

`CONCURRENTLY` is deliberately not used. There are no writers to avoid blocking
during a freeze, it is slower, and a failed concurrent build leaves an `INVALID`
index that a later `CREATE INDEX IF NOT EXISTS` of the same name will never
repair — the same landmine in a new place. `IF NOT EXISTS` matches on name alone
for the same reason it is cheap; the `baseline` phase is what compares
definitions.

## What it destroys

Everything in migration-plan §3's "Removed at cutover" list that lives inside the
database, except three deliberate omissions:

- **`auth.*` is gone; `storage.*` survives.** §3 lists both as removed *after*
  the transform, because A6 had to migrate users into better-auth's tables and A8
  files into `public.files` first, and because the Drizzle baseline still
  referenced them. X2 finished the `auth` half: `13` creates better-auth's tables,
  `14` moves the 31 foreign keys and `15` drops the schema. `storage` stays until
  E1 has verified the file migration against production rows — nothing in
  `public` references it any more (`09`, `10` and `12` moved all six), it is just
  still the only copy.
- **`admin.credentials` survives.** §3 and §9 both say its purpose is unknown and
  it must be confirmed before removal. E1 owns that call.
- **The four search functions are dropped, not ported.** They had to go for their
  phantom return tables to go. Re-creating them with `RETURNS TABLE(...)` is the
  first item in the hand-written SQL lane — see
  `../migrations/*_hand_written_sql_lane/migration.sql`.

## Things E1 must know before running this against production

1. **`menu_item_price` changes type, and that is a deliberate bug fix.** Postgres
   `money` formats and rounds according to the server's `lc_monetary`, so the same
   row reads back differently on a differently-configured server, and the stored
   value carries no currency of its own. `05` converts it to `numeric(10,2)` via a
   direct `::numeric` cast, which is exact for every value `money` can hold — but
   the read happens under the server's *current* `lc_monetary`. The file logs the
   setting it saw (`en_US.utf8` locally). Confirm production's before the real run
   and spot-check a handful of prices after.

2. **`04` hard-codes the enum values and asserts the reference tables match.** If
   production has a value this file has never seen, the transform aborts with the
   table and the offending value named. That is the intended behaviour: add the
   value here *and* to the Pothos enum, then re-run. Do not make it read the
   values dynamically — the whole point is that the Drizzle baseline is identical
   in every environment.

3. **Enum value order is alphabetical.** Enum order *is* sort order, and these
   columns are `text` today, so alphabetical is the only ordering that leaves
   existing `ORDER BY` results unchanged.

4. **`item_favorites.type` is dropped and re-added.** It is a `STORED GENERATED`
   column, which Postgres will not retype in place (it rejects `USING`, and a
   generation expression may not contain a text → enum cast because that cast is
   only `STABLE`). So `04` drops the column and re-adds it with the arms of its
   `CASE` producing enum literals directly. Values are recomputed from the other
   columns — which is what "generated" means, so nothing is lost — but **the
   column moves to the end of the table**, and on a large production table the
   re-add rewrites it.

5. **`07` renames 173 foreign keys and 3 primary keys.** Catalog-only, instant at
   any table size, and nothing in either stack reads constraint names now that
   Hasura is gone. It exists because `drizzle-kit@1.0.0-rc.4` loses constraint
   names on `pull`; see `../README.md`.

6. **Row counts are not verified anywhere.** A3 had no data. E1 must add
   before/after counts for every table the transform touches, and in particular
   must confirm that every value in the thirteen enum-bound columns casts.

7. **`13`–`15` are a three-part step with a script in the middle.** Run `01`–`13`,
   then `services/actors/scripts/migrate-users.ts` (source: the Nhost database;
   target: the transformed one), then `14` onwards. `run.sh` runs every
   numbered file in one pass, which is right for a schema-only dump and wrong for
   production data: `14` aborts if any `public.*` row references a user id that
   has not arrived in `"user"`, and `15` aborts if any `auth.users` row has no
   `"user"` row. Both abort with counts and name the script, so getting the
   order wrong costs a re-run, not data. `migrate-users.ts` is idempotent (a
   second run reports `changed 0` and leaves `xmin` untouched), so running it
   again before `14` is free.

8. **`14` renames the 31 constraints as it moves them.** `beers_created_by_id_
   users_id_fkey` becomes `beers_created_by_id_user_id_fkey`, because the
   referenced table is `user`, not `users`, and `drizzle-kit generate` derives
   its names from the referenced table. `07` cannot do it — it runs seven steps
   earlier, before the tables exist.
