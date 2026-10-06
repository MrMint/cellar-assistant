# @cellar-assistant/db

Drizzle schema, RQB v2 relations, and migrations for the post-Nhost stack.

## Pinned versions

| Package | Version | Why exactly this |
|---|---|---|
| `drizzle-orm` | `1.0.0-rc.4` | Plain, unsuffixed. |
| `drizzle-kit` | `1.0.0-rc.4` | Plain, unsuffixed. |

Both are pinned with `--save-exact`. They are a coordinated joint release
(published 628 ms apart). **Do not use the `rc4` dist-tag**: it points at
`1.0.0-rc.4-5d5b77c`, a hash-suffixed interim build published five weeks *before*
the real `1.0.0-rc.4`. `drizzle-kit` does not declare `drizzle-orm` as a peer
dependency at all, so nothing enforces the pairing — pin both to the same exact
string.

Verify with `bunx drizzle-kit --version` (note: `node
./node_modules/.bin/drizzle-kit` does not work — that shim is a shell script).

## Layout

- `src/schema/tables.ts` — **generated.** `drizzle-kit pull` output. Hand-edits
  are marked in the file; see below.
- `src/schema/relations.ts` — **generated, then hand-audited.** See "The
  `.through()` audit".
- `src/schema/index.ts` — re-exports both, plus `tables`, the name → table map
  the single-writer test reads.
- `src/writers.ts` — single-writer registry (§1.2/§3), filled by A4. `TABLE_WRITERS`
  is total over `TableName`, so a table added by a re-pull fails typecheck as
  well as `src/writers.test.ts`.
- `src/writers-scan.ts` — test-support. Parses `services/actors/src` and reports
  every Drizzle write site per table; `writers.test.ts` checks each against the
  registry. Nothing at runtime imports it.
- `src/orm.ts` — `export * from "drizzle-orm"`. **Actors import `eq`, `and`,
  `sql`, … from `@cellar-assistant/db/orm`, never from `drizzle-orm` directly.**
  better-auth's `zod` can give `services/actors` a peer-resolution variant of
  `drizzle-orm` distinct from `packages/db`'s, and mixing the two is a page-long
  structural type error. One shared lockfile currently collapses them to a
  single store entry, so it is one copy today — but the rule holds regardless,
  because the peer set is what decides. One import path, one Drizzle. See
  `src/orm.ts`.
- `transform/` — the cutover transform. **Frozen** at the ledger horizon; see
  "Applying migrations" below and `transform/README.md`.
- `migrations/` — `drizzle-kit` output plus the hand-written lane (§8.6).
- `src/migrate/` — the migration ledger and `db:migrate`, the only thing that
  applies `migrations/`. See "Applying migrations".
- `scripts/check-drift.sh` — `bun run db:drift`: `drizzle-kit check`, then
  `generate` into a scratch copy, which must write nothing. CI runs it.

`tables.ts`, `relations.ts` and `migrations/` are excluded from Biome in the root
`biome.json`: they are generator output, and formatting them would make every
re-pull diff unreadable.

## Reproducing the baseline

The database must be a *transformed* one — `transform/run.sh` first.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.14.0/installation/bin:$PATH"

packages/db/transform/run.sh                    # restore + transform (drops the `drizzle` schema)
cd packages/db
bunx drizzle-kit pull --init                    # -> migrations/<ts>_<name>/{migration.sql,snapshot.json}
                                                #    plus migrations/schema.ts and relations.ts

mv migrations/schema.ts    src/schema/tables.ts
mv migrations/relations.ts src/schema/relations.ts
# then re-apply the hand-edits below, and:
bunx drizzle-kit generate --name=restore_expression_index_opclass
bunx drizzle-kit check
bunx drizzle-kit generate                       # must say "No schema changes"
```

`drizzle.config.ts` carries the two settings that matter:

- `schemaFilter: ["public"]`. A3 had to widen this to
  `["public", "auth", "storage"]` because `pull` emits a `.references()` for a
  foreign key whose target it was told not to pull, so a `public`-only baseline
  named `usersInAuth` / `filesInStorage` and threw at import. **That is over.**
  A8 moved the six `storage.files` foreign keys onto `public.files`
  (`transform/09`, `10`, `12`) and X2 moved the 31 `auth.users` ones onto
  `"user"` and dropped the schema (`transform/13`–`15`). No `public` table
  references anything outside `public`, and the narrow filter is now correct.
  better-auth's five tables are pulled like any other `public` table — see
  "better-auth's tables" below.
- `extensionsFilters: ["postgis"]`, which keeps `spatial_ref_sys` and PostGIS's
  own views out of the schema.
- `schema` points at `src/schema/tables.ts`, **not** the directory: rc.4 crashes
  with `Cannot read properties of undefined (reading 'config')` when the glob also
  picks up `relations.ts`.

### better-auth's tables

`user`, `session`, `account`, `verification` and `jwks` are in `public` and in
the generated `tables.ts` like everything else, since X2. They are the one table
group `packages/db` declares that an actor does not write —
`infrastructure:better-auth` in `src/writers.ts` — and their **property names are
a contract**: better-auth's Drizzle adapter addresses a column by the JS property
name, so a re-pull that renamed one would break sign-in at runtime and compile
perfectly. `services/actors/src/auth/auth-schema.test.ts` checks the generated
definitions against better-auth's own `getAuthTables()`; run it after a re-pull.

Their DDL is `transform/13_better_auth_tables.sql` — the same lane that creates
`files`, `jobs` and `outbox` (`06_new_tables.sql`) — and, through the baseline,
`migrations/`. A6's merge checklist asked for its generated migration
(`services/actors/src/auth/migrations/0000_better_auth_tables`) to be copied into
`migrations/` by hand; taking the baseline over a database the transform has
already built puts it there without a second copy to keep in sync.

### Hand-edits to re-apply after every re-pull

1. **`src/schema/relations.ts` import.** `pull` writes
   `import * as schema from "./schema"`; it becomes `"./tables.ts"`.
2. **`tables.ts`, `idx_places_name_compact_trgm`.** rc.4 drops the operator class
   from *expression* indexes (it keeps it on plain-column ones). Add
   ` gin_trgm_ops` inside the `sql` template. Without it the DDL drizzle generates
   is not merely different, it is invalid — `text` has no default GIN operator
   class. The `restore_expression_index_opclass` migration is the resulting
   no-op-against-a-transformed-database rebuild.
3. **The `.through()` audit** in `relations.ts`, below.
4. **The typed `customType` wrappers.** `pull` leaves `places.location`,
   `places.search_text` and `menu_scans.scan_location` as untyped
   `customType({ dataType: () => '...' })(...)` placeholders (see "Known rc.4
   rough edges" below). Add `import { geography, tsvector } from
   "./custom-types.ts"` and swap those three column definitions to
   `geography()` / `geography("scan_location")` / `tsvector("search_text")`.
   `custom-types.ts` itself is hand-written, not generated, and survives a
   re-pull untouched — only the three call sites in `tables.ts` need
   reapplying. `place_menu_items.menu_item_price` does **not** need one: it's
   `numeric(10,2)` since `transform/05_money_to_numeric.sql`, which Drizzle
   introspects natively.
5. **`outbox.seq`.** `pull` writes `bigserial({ mode: 'number' })`; it becomes
   `bigserial({ mode: "bigint" })`. See "Hand-edit 6" below — the number is a
   historical label, and hand-edit 5 is retired.

### Known rc.4 rough edges (all worked around, none reported upstream)

- `pull --init` **writes to the target database** (`drizzle.__drizzle_migrations`).
  It is not read-only. `transform/run.sh` drops the `drizzle` schema so a re-init
  is possible; without that, `--init` refuses with "database already has
  migrations set".
- `pull` writes single-column foreign keys as inline `.references(...)`, which has
  nowhere to hold the constraint's name, while `--init` writes a snapshot straight
  from the catalog *with* names. `generate` then wants to rename 171 foreign keys.
  `transform/07_align_constraint_names.sql` fixes it from the database side, so the
  generated `tables.ts` stays untouched generator output. Three derived names
  exceed Postgres's 63-byte identifier limit; drizzle substitutes
  `<table>_<12-char hash>_fkey` (deterministic), and `07` lists those three
  verbatim and aborts loudly if a fourth ever appears.
- `drizzle-kit migrate` **cannot replay the introspected baseline migration**: its
  SQL is wrapped in a `/* … */` block, and the runner splits on
  `--> statement-breakpoint` before stripping comments, so it hands Postgres an
  unterminated comment. Rebuild a development database with `transform/run.sh`,
  which produces the same schema directly and ends with `db:migrate`. Nothing
  here uses `drizzle-kit migrate` or its `__drizzle_migrations` table.
- The order of members within `relations.ts` blocks, and which side of a
  many-to-many carries the `from`/`to`, varies between runs. Content is
  equivalent; diffs between two pulls are noisy.

## The `.through()` audit

`pull` infers a many-to-many relation whenever a table has exactly two outgoing
foreign keys, whether or not it is a join table — and, worse, a table it treats as
a junction gets **no relations of its own at all**. Every `.through()` was checked
against the real constraints; the rule applied was: it is a genuine junction only
if the pair of foreign-key columns is uniquely keyed (composite primary key, or a
unique constraint on both).

The audit below is X2's, re-done from scratch against the `public`-only baseline.
A3's original had three more entries on each side — `user_providers` and
`user_roles` kept, `oauth2_auth_requests` and `refresh_tokens` deleted — all of
which went with the `auth` schema.

**Kept (6):** `place_brands`, `cellar_owners`, `menu_item_recipes`,
`user_place_interactions`, `recipe_reviews`, `recipe_votes`.

**Deleted (3):** the many-to-many via `check_ins`, `place_google_photos` and
`recipe_groups` — none of those tables keys its pair uniquely, so traversal would
duplicate rows, and `recipe_groups` is a plain entity that `recipes` points back
at. Deleting one means deleting its reciprocal `r.many` on the other side too.

**Added:** `r.one` relations (and their reciprocal `r.many`) for every orphaned
foreign key, including `friends` and `friend_requests`, which the generator left
out of `relations.ts` entirely, and `recipe_groups`' own two.

better-auth's `account` and `session` need no hand work: each has a single foreign
key to `user`, so `pull` writes both sides correctly.

`src/schema/relations.smoke.test.ts` guards the result: it builds the relations
object (a dangling reference or an unmatched alias only fails at runtime), asserts
every application table has an entry, and asserts the eleven audited junction
tables have relations of their own.

## Applying migrations: `db:migrate` and the ledger

```bash
bun run db:migrate --url postgres://…            # apply what the ledger lacks
bun run db:migrate --url postgres://… --status   # read-only; exit 3 = pending
bun run dev:migrate                              # this worktree's stack (dev lane)
```

`src/migrate/cli.ts` applies every directory under `migrations/` that the
database's `cellar_meta.schema_migrations` does not record, in name order, each
in its own transaction together with its ledger row (`name`, `sha256` of the
`migration.sql` applied, `method`, `applied_at`). It holds a per-database
advisory lock, sets `lock_timeout` (`MIGRATE_LOCK_TIMEOUT`, default 10s), and
**refuses**: a recorded migration whose file has changed; a pending migration
that sorts before one already recorded; SQL that cannot run in a transaction.
There is no default database and it never reads `DATABASE_URL`. It is the only
apply path — `transform/run.sh` (so `test-db.sh` and CI), `cutover.sh`'s
`migrate` phase, and the dev lane's `bootstrap` all call it.

**Writing a migration:** change `src/schema/tables.ts`, `bun run db:generate`
(or `drizzle-kit generate --custom` for SQL Drizzle cannot express), commit both,
and apply it with `db:migrate`. Do **not** mirror it into `transform/` — that rule
is retired: the transform is frozen at `TRANSFORM_HORIZON`
(`src/migrate/ledger.ts`, pinned by `src/migrate/transform-freeze.test.ts`) and
`db:migrate` applies everything after it to fresh builds too. Migrations are
forward-only and immutable once applied anywhere (migration plan §8.6). CI's
`db:drift` fails if `tables.ts` and the migrations disagree.

**Adoption.** A database built before the ledger existed is adopted on first
contact: the baseline is recorded, the five idempotent (ex-lane) migrations are
re-applied, and the five the transform mirrors are probed against the catalog —
present → `adopted`, absent → applied and re-probed, half present → refused. One
transaction, and only if the database looks transform-built. `ADOPTION` in
`ledger.ts` lists every migration up to the horizon and is frozen with it.

## Rule

`services/actors` is the only process that may call `createDb()`. `services/api` holds no
database credentials.

### Hand-edit 5: `item_favorites` sake/tea unique constraints — **retired**

`tables.ts` declares `item_favorites_user_id_{sake,tea}_id_key`, which the Nhost database never
had. B4 found the table carried per-type uniques for wine, beer, spirit and coffee only, so
`UserActor.favorite` could not use `onConflictDoNothing` for two of the six item types.
`transform/08_item_favorites_missing_uniques.sql` adds them, and **aborts rather than
deduplicating** if production data holds duplicates -- decide that deliberately during E1.
X2 re-took the baseline against a database `08` had already run on, so `pull` emits both
constraints from the catalog and there is nothing left to re-apply by hand.

### Hand-edit 6: `outbox.seq` is `bigserial({ mode: "bigint" })`

`pull` writes `mode: 'number'`, which makes Drizzle parse a `bigint` into a JS number and lose
precision past 2^53. A7b's delivery-ordering guarantee reads this column, and
`outbox-actor.test.ts` compares it as a `bigint` — with `mode: 'number'` the comparison does
not even typecheck, which is how X2 found it. A7b applied this edit and it was never written
down here; it is now. Re-apply it after every re-pull.

### Hand-edit 7: `outboxDeadLetterAcks` is written by hand, not pulled

`tables.ts` declares `outbox_dead_letter_acks` in a block marked `HAND-ADDED` (`3b187a32`),
which points here. The table is created by a hand-written lane migration,
`migrations/20260920164500_outbox_dead_letter_acks`, not by the transform, so its columns,
primary key and `ON DELETE CASCADE` foreign key were copied from that DDL. The foreign key is the
plain `.references()` form, because that is the only form `drizzle-kit pull` renders for a
single-column FK — a named `foreignKey({...})` builder made the cutover's baseline diff fail on
syntax alone (`fcd8f9e8`, verified against a from-scratch build). So the *database* is aligned to
Drizzle's derived name instead: `migrations/20260926150000_outbox_dead_letter_acks_fkey_align`
renames Postgres's default `outbox_dead_letter_acks_outbox_id_fkey` to
`outbox_dead_letter_acks_outbox_id_outbox_id_fkey`, the same direction
`transform/07_align_constraint_names.sql` takes for the pulled tables. `07` itself cannot do it,
because it runs before the lane creates this table. Its writer in `src/writers.ts` is `MaintenanceActor` (`acknowledgeDeadLetters`), not
`infrastructure:outbox`. Its one index is deliberately absent from
`transform/17_target_indexes.sql`: `run.sh` runs `db:migrate` after every numbered file, so `17`
cannot see the table, and `src/schema/target-indexes.test.ts` records the exemption.

#### Three things the creating migration's header says that are no longer true

`migrations/20260920164500_outbox_dead_letter_acks/migration.sql`'s DDL is right; parts of its
prose are not. The file is left as written — `transform/test-db.sh` hashes every lane migration
into the test template's fingerprint, and the file is also what an operator applies by hand to a
live database, so a comment-only edit would rebuild templates and make "which version did you
apply?" a question with two answers. The corrections live here instead:

1. **"a regression produces a *new* row with a new id, which no prior acknowledgement can have
   named."** False for a requeued row. An operator sets a dead row back to `pending`, it is
   delivered again, it dies again — under the *same* id, still carrying the acknowledgement of its
   first death. Keyed by id alone, that acknowledgement silenced the second death: the report said
   `newDead=0, regressed=0` and beat all-clear instead of paging. `MaintenanceActor` now counts an
   acknowledgement only if it post-dates the row's latest death (`acknowledged_at >= updated_at`,
   `ACK_COVERS_DEATH` in `services/actors/src/actors/maintenance-actor.ts`, which also says why
   `updated_at` is the time of death), and treats a row that died again after its own
   acknowledgement as a regression on its own.
2. **"an append-only annotation."** No longer strictly: `acknowledgeDeadLetters` replaces an
   acknowledgement *that no longer covers its row* (older than the row's latest death), because the
   stale one holds the primary key and would otherwise leave a page nothing can clear. A covering
   acknowledgement is still first-writer-wins and is never rewritten.
3. **"this table is not in `src/schema/tables.ts` and has no `TABLE_WRITERS` entry yet … writes to
   this table are invisible to [the containment half]."** False since `3b187a32`: the table is
   declared in `tables.ts` (the `HAND-ADDED` block above) and `src/writers.ts` gives it to
   `MaintenanceActor`, so the writers scan sees its writes and the coverage half requires the
   entry. The "owed follow-up" it describes is done.
