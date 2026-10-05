# Migration plan — Nhost/Hasura → Dapr actors + Pothos + Drizzle

**Status:** design settled 2026-09-08; **implementation 74 of 75 workstreams closed as of
2026-09-18** — 73 marked done, `B9` absorbed into `B5`. Phases A (foundations), B (aggregates),
C (read side) and D (frontend) are complete, as are E1 (cutover rehearsal), E2 (browser golden
flows) and E3 (Loki infra). **`E4` (cutover execution) is the only row left**, and it is
*unblocked*: all five of its blocking decisions are resolved in
[`e4-decisions.md`](./e4-decisions.md), none by a judgement call. What stands between here and a
flip is mechanical, not a decision — see that file's closing section.

Gates as of 2026-09-18, everything on bun 1.4.2 and Node 24.14.0, measured with turbo caching
forced off. No SHA was recorded with them, so they are that day's reading, not a baseline to
compare against:

```
bun run typecheck            13/13 projects
bun run test --force         12/12 tasks, exit 0
services/actors             997 passed |  3 skipped
services/api                240
services/client             293 across 22 files
packages/db / policy / contracts   17 / 31 / 46
packages/e2e (Playwright)    81 passed | 0 failed | 3 skipped   (84 total)
```

e2e runs against the **containerised client on `:3003`**, not a host dev server — that is new, and
it is why the suite had gone un-run through the whole restructure. The 3 skips are not flakes:
they are gated on a compile-time `const scanId = null` because a presigned PUT signed for an
internal MinIO host is unreachable from a browser (E3). They come back when that hostname is
unified. **Since then:** E3 landed as two signed authorities rather than one hostname, and
`packages/e2e/specs/09-menu-scan.spec.ts` now gates those three tests on a runtime condition, so
they skip only if the browser upload before them fails.

**Two suite results in this repo lie, and both are documented rather than fixed by luck:** `bun run
test` was turbo-cached while some suites read live state, so a green could be a replay (now
uncacheable for the client); and `turbo run test` has no `--continue`, so the first red package
SIGTERMs every still-running task — which reads as a database failure in `services/actors`,
the only task slow enough to still be running.

*The denominator moved and the numerator with it.* The count was previously given as "57 of 72",
derived by a regex that assumed single-digit workstream ids and therefore skipped `X10` entirely,
and the table was carrying three rows still marked `todo` whose work had in fact landed —
`X1b` and `X5` in `10c7a0ff`, `E2d` across `c43bf60a` and `10c7a0ff`. `E2f` had no row at all.
75 is a machine count of unique ids in §6.0, checked for duplicates; it grew by two when
`E2f` and `X11` were added. The one still open is `E4`.

**E4's open questions now live in [`e4-decisions.md`](./e4-decisions.md)** — eleven of them, five
blocking, each cited to a file and line (when this was written; that file now numbers fourteen,
and none of them blocks E4 — see the status paragraph above). Three corrections that document
makes to this one are worth
carrying here: the **feature losses are five, not three**, and only two of them (image search, the
`/search` discovery feed) were ever *chosen* — brand reverse edges, cellar type+text filtering, and
the "which tier lists rank this item" panel simply fell out, and the last was recorded nowhere at
all. The **idle-timeout regression is larger than recorded**: the activations that replaced
`unstable_cache` took over a 7-day geocode cache and a 24-hour search-vector cache, and are now
10-minute in-process activations. And `admin.credentials`, filed in §9 as "purpose unknown", was the
GCP service-account JSON fallback — meaning that row may hold the only copy of a live private key.
(Decision 4 found the table empty in the rollback database, but that did not hold for production:
a 2026-09-28 rehearsal against a real production backup found one row with a live key, dropped at
cutover by migration `20260928194604_drop_admin_credentials`; the key still needs rotating in GCP
by hand.)

**The most dangerous item is not a product decision.** Four of A1's five indexes are created by no
transform step and are not covered by `preflight.sql`, so if production lacks them the cutover's
baseline diff is non-empty and phase 5 aborts *with the site already frozen*. Verified here: of the
index names in the Drizzle baseline, only `idx_cellars_privacy_public` appears in an actual transform
step (`04_enum_split.sql`); every other appears solely in `nhost-schema.sql`, which is a dump of the
*local* database and therefore proves nothing about production. One query against Nhost settles it,
and it must be run before the freeze rather than during it. **Closed 2026-09-17 by e4-decisions
decision 1:** `packages/db/transform/17_target_indexes.sql` now creates every declared index
idempotently whatever the source had, and `preflight.sql` §10 reports A1's five, so production
lacking them no longer aborts the baseline phase.

**Committed** on `claude/nhost-migration-research-42044b`; the restructure into `services/*` and
`packages/*` is `72215d5d`. Nothing is pushed: the branch is local-only with no upstream configured.
Pushing the branch (or opening a PR from it) is inert for production; **merging it to `main` is
not** — Nhost Cloud deploys production from `main`. See E4 step (0a) and `e4-decisions.md` decision 15.
Each workstream's row in §6.0 links to an in-line *outcome* note recording what it built, what it
corrected in this plan, and what it could not verify.
**Companion:** [`target-stack.md`](./target-stack.md) records *what* was chosen and *why*.
**Toolchain:** the repo moved from pnpm + Node to **bun 1.4.2** after this plan's last count —
installs, every test suite and all three service runtimes. That effort is tracked separately in
[`toolchain-traps.md`](./toolchain-traps.md) (renamed from `bun-migration.md` 2026-09-19) and
closed no workstream here, but it reset the gate baseline and changed how every command in this
document is invoked (`bun run …`, not `pnpm …`).

This document records *what to build*, in what order, and how each piece proves itself done.
**Audience:** agents picking up a workstream. Read §0 first, then only the workstream you own, then the
catalog entries it references.

---

## 0. How to work from this plan

1. **Pick a workstream** from §6 whose dependencies are all marked done in §6.0 (the status table).
   Do not start a workstream with an open dependency.
2. **Read the actor catalog entries** (§2) your workstream touches. Actor boundaries, owned tables,
   and method shapes are decided. If the boundary looks wrong for your case, raise it in the PR
   description — don't silently move a table to a different writer.
3. **The rules in §1 are not guidelines.** They are tested: §1.2 (single writer) is enforced by a
   test that maps every table to one writer module; §1.6 (viewer tests) is a per-method requirement
   reviewers check.
4. **Definition of done** for every workstream is the acceptance list on that workstream plus the
   baseline in §7. A workstream is not done until the status table is updated in the same PR.
5. **Conventions** (§8) cover naming, `ctx`, errors, pagination, and repo layout. Follow them so
   the next agent's code looks like yours.

Terms used throughout:

- **Aggregate** — a root table plus the child tables one actor owns and loads on activate.
- **Owner / writer** — the single actor class allowed to write a table.
- **Outbox** — the `outbox` table; a side-effect intent committed in the same transaction as a
  domain write, drained by `OutboxActor`.
- **Viewer** — the principal on whose behalf a call is made, carried in `ctx`.

---

## 1. Rules (settled, tested where possible)

### 1.1 Actor categories

Every actor is tagged with exactly one category. The tag determines what it may do.

| Category | May write | May read | Keyed by | Cache |
|---|---|---|---|---|
| **entity** | its owned tables only | its owned tables (+ FK lookups via other actors) | row id (or natural key) | its aggregate, loaded on activate |
| **collection** | nothing | any table, directly via Drizzle | viewer id (or a scope id) | none, or short-lived |
| **search** | nothing | any table, directly via Drizzle; external APIs | hash of all inputs | the result, idle-evicted |
| **view** | nothing | any table, directly via Drizzle | viewer id | screen-shaped projection |
| **reference** | nothing (data changes by migration) | reference tables | singleton | everything, loaded on activate |
| **job** | its own `jobs` row; everything else via entity actors | any table | job id | progress cursor |

Infrastructure tables are exempt from the writer rule and are listed explicitly in §3.

**Gap A5 found:** there is no category for §2.7's infrastructure actors. `OutboxActor` is tagged
`entity` (it writes one table and is keyed as a singleton) and only `mayWrite` is branched on, so
nothing breaks — but the tag is a lie of convenience. `MaintenanceActor` is listed under job actors
in §2.6 and is not one: it is an unbounded scheduled singleton, not a finite cursor chain, and both
A5 and A8 independently landed it as a plain `ActorBase`. Either add a seventh tag or say plainly
that infrastructure actors borrow `entity`.

### 1.2 Single writer

> Every application table has exactly one writing actor class. A collection, search, view, or
> reference actor never writes. A cross-aggregate operation is a sequence of idempotent calls to
> the owning actors, with the outbox as the retry mechanism. No actor writes another aggregate's
> rows, even inside a transaction.

**Made mechanical by A4** (the original wording was not implementable: Drizzle has no per-table
write helpers to import — tables are imported for reads too). The rule is **call-site** based and
lives in `packages/db/src/writers.ts` + `writers-scan.ts`, tested by `packages/db/src/writers.test.ts`:

- Every table in the Drizzle schema appears exactly once in `TABLE_WRITERS`, which is **total over
  `TableName`** — a missing entry fails typecheck before it fails the test.
- A write is a `.insert(t)` / `.update(t)` / `.delete(t)` call site, or a raw-SQL write statement.
- **The ownership unit is a module path derived from the actor's class name**: `CellarActor` owns
  `actors/cellar-actor.ts` or `actors/cellar-actor/**`. This derived path is load-bearing for every
  B workstream — put the actor at the derived path or the containment test fails.
- Test files, `src/lib/testing.ts` and `src/auth/**` are excluded from the scan.
- Registry actors (§2.1) hold a lock and *call* the entity actor's `create`; they do not insert.
- Exemptions carry a verb, because `outbox` and the §4 reference tables are exempt for **opposite**
  reasons (writable by every actor vs. writable by none): `infrastructure:outbox` and
  `infrastructure:migrations`.

### 1.3 Postgres is the only truth

- Actors load on activate, cache in memory, and write through synchronously inside the turn.
- No Dapr state store is declared for domain data. Actors never call the state manager (lint rule).
- An eviction loses nothing. An in-memory copy is a cache.
- **An actor may cache only the rows it itself writes; anything else it needs is read fresh per
  call.** Added 2026-09-09 after B6, **sharpened to row granularity on 2026-09-09 after B4b.**
  Table granularity was never the real rule — it is a proxy that coincides for actors keyed 1:1
  with a parent row, and **fails silently for any table whose key column can hold another
  instance's id.** `UserActor` was the case: it is the sole writer *class* of `friends`, so the
  table-level rule passed, while `UserActor(bob)` writes rows `UserActor(alice)` was caching.
  `TABLE_WRITERS` is structurally incapable of expressing this, so it stays a review-time rule
  whose fence is a per-actor regression test — B6, B10 and B4b each have one. Original note, after
  B6 hit this on the
  running stack, not in a test. `RecipeGroupActor`'s membership lives in `recipes.recipe_group_id`
  — a column `RecipeActor` owns — so the cached member list went stale with nothing to invalidate
  it, and a live `vote` answered *"recipe X is not in recipe group Y"* for a recipe that was in it.
  `RecipeActor` had the mirror bug: it cached the owning group for its vector-freshness check and
  would have skipped exactly the regenerations a canonical change causes. **Rows an actor does not
  own must be read fresh per call** — the single-writer rule (§1.2) is what makes owned rows safe to
  cache, because no one else can change them. B10 audits the actors built before this rule existed.

### 1.4 The outbox is the only durability primitive for side effects

When a write needs a follow-up — regenerate a vector, notify a peer actor, retry a cross-actor
call, generate insights, run something later — the actor inserts an `outbox` row **in the same
transaction** as its domain write. `OutboxActor` (singleton, kept alive by a Dapr reminder) drains
rows in order, invokes the target actor method, records attempts, and dead-letters after `N`.
`run_after` covers scheduled work. Reminders are used for keep-alive only; no reminder carries
domain intent.

**Corrected 2026-09-08 by A5, which built it:**

- **"Drains rows in order" was not true as specified, and A7b made it true.** `outbox.id` is a
  random v4 uuid, so ordering by it is arbitrary; A5's `(run_after, created_at, id)` still tied for
  rows written by one transaction, which share `created_at` (transaction-start time). A7b added
  `outbox.seq`, a `bigserial` assigned at INSERT, and the drain claims by `(run_after, seq)`.
  **Two outbox rows written in sequence are now attempted in sequence**, including within one
  transaction. Three things survive that warning:
  - **`ORDER BY` alone was never enough.** `UPDATE … WHERE id IN (SELECT … ORDER BY …) RETURNING`
    emits rows in **heap** order, so the claim is a CTE that re-imposes order on the way out.
    Measured on this database: with ids assigned in reverse the old claim still returned insertion
    order, because heap order equals insertion order *until a row is updated* — and every outbox row
    is updated the moment it is claimed or retried. In that state the old claim delivered every odd
    row before every even one. **`seq` alone would not have fixed this; the CTE is load-bearing.**
  - This orders the **first attempt** only. A failed row is rescheduled with backoff and lands
    behind rows enqueued after it.
  - Delivery is still at least once, so §8.4 idempotency remains every target method's contract.
- **A drainer that dies mid-delivery had no recovery path.** The table's constraint carries a
  `delivering` state but nothing un-stuck it, so a kill *during* delivery lost the row silently.
  A5 added a reclaim sweep: a row stuck in `delivering` for 10 minutes is reclaimed **and charged
  an attempt**, so a message that kills the host dead-letters instead of crash-looping.
- **The idempotency key has nowhere to live in §2.7's `method(ctx.system, payload)` signature.**
  ~~It travels as `ctx.requestId = "outbox:<row id>"`, read with `outboxRowId(ctx.requestId)`.~~
  **Superseded (12e00c72):** `OutboxActor` mints `ctx.delivery = { outboxId, attempt, final }` on
  the one ctx it delivers with, the wire accepts it only on a `system` ctx, every forward strips
  it, and a target derives its §8.4 key with a stated purpose via
  `idempotencyKey(ctx, "<Actor.method:thing>")` (`services/actors/src/lib/delivery.ts`, whose
  header says why the requestId form was wrong). `ctx.requestId` is log correlation only, and
  `outboxRowId` no longer exists.
- Backoff is `min(2s · 2^(n-1), 10min)`, dead-lettered at attempt 10. **Deliberately no jitter:**
  jitter de-correlates competing consumers and a singleton drainer has none, while a deterministic
  schedule is assertable in tests. An attempt is charged only when delivery is actually attempted,
  never at claim time, so a row released at the drain deadline keeps its budget.

### 1.5 Reads

- `EntityActor.get(ctx)` returns the aggregate **header**. Child lists are paged from the owner:
  `CellarActor.items(ctx, page)`.
- Collection actors return **either ids or full projections, declared per method** in the
  contract. Ids for owned lists whose entity actors are cheap and likely warm; projections for
  high-cardinality catalog lists (map, item search, brand index).
- Pothos resolves ids through a DataLoader that batches into parallel entity-actor calls.
- Search actors are keyed by a hash of every input **except pagination**. The actor runs the
  search once, holds the capped result set (the SQL functions already cap at 50–500), and pages
  it in memory. The viewer id is part of the hash **only** for the three identity-sensitive
  surfaces: in-cellar item search, map browse with tier-list or visit filters, and user search.
  Everything else is shared across viewers.
- Reference and other singleton read actors are a serialization point: Dapr runs one turn at a
  time per actor id. Key read-only actors by something with cardinality (`ReferenceDataActor(kind)`),
  and reserve true singletons for things that *should* serialize (`BudgetActor`, `OutboxActor`).
  `PlaceCreationActor` was on this list until `291bcb97` re-keyed it per creator: what it
  serialised was two invariants, and neither needed a global lock
  (`docs/architecture/actor-keys.md`, "Decision 1").
- All list reads are paged. There is no unbounded read.
- **A cached read actor must authorize on every turn, before the cache.** Added 2026-09-09 after
  C1 hit it on the compose stack, not in a unit test. With the visibility check inside `runSearch`,
  the first call authorized *and cached*, and every later call on that activation skipped the check
  — **an anonymous request got a full result set back.** Search, view and collection actors all
  cache, so this applies to every one of them: `authorize` runs per turn, the cache serves only
  after it passes. This is the same family of bug as §1.3's cached un-owned rows: caching is safe
  only for the thing the actor is entitled to hold.

### 1.6 Authorization lives in actors

- There is no RLS. The actors' Postgres role is the only application role.
- Every actor method takes `ctx` first (§8.2). Visibility rules live in `packages/policy` and are
  called from actors, never from resolvers.
- **Every method whose result depends on the viewer has three tests: owner, friend, stranger.**
  For catalog data the stranger case is "any signed-in user"; the test still exists.
- `ctx.kind === 'system'` is only ever constructed by `OutboxActor` and job actors. It is not
  derivable from a request.
- `bypassesPolicy` covers `system` **and** `admin`. `isFriend` deliberately does *not* short-circuit
  for either: it answers a question of fact, not of permission.
- **Check-in visibility — SETTLED by B1 (2026-09-09). The two surfaces take different rules,
  because they have different entry points:**
  - **Cellar-scoped `CellarActor.checkIns` uses `canSeeCellar`.** You reach it by naming a cellar
    id, and every row carries a `cellarItemId` from that cellar. Under the looser rule a
    friend-of-any-drinker who cannot see the cellar still gets a page back, which turns the cellar
    id into an oracle for a PRIVATE collection's existence, activity and item ids. `bulkCheckIn`
    widens it further, since "friends of someone with a check-in here" is a strictly larger set
    than anyone the owner chose to share with.
  - **Item-scoped `CheckInsCollectionActor` uses `canSeeCheckIn`** (author OR friend-of-author),
    unchanged. It is reached by naming an *item*, never a cellar, and its answer names the drinker
    rather than where the bottle sat. **C3 keeps `canSeeCheckIn` as A4 wrote it.**
  - Net effect: a friend can see that you drank something on the *item* page, and cannot enumerate
    a private cellar through the *cellar* page.
  - Deliberate consequence: inside a cellar you can see, you see every check-in including a
    co-owner's, friend or not. Today's Hasura rule gated on friendship alone with no cellar branch,
    so co-owners could not see each other's history. **The cellar is the unit of sharing.**

### 1.7 Cross-aggregate operations

An operation touching two aggregates is written as a sequence of idempotent calls, each to the
owning actor, initiated by the actor that owns the triggering row. The initiating actor's own write
and an outbox row for the next call commit together; the outbox delivers the call. Example, friend
acceptance (§2.1 `UserActor`):

1. Recipient's `UserActor.acceptFriendRequest(ctx, requestId)` inserts its own `friends` row and
   an outbox row targeting the requester's `UserActor.confirmFriendship(system, recipientId)`.
2. Outbox delivers; requester's actor inserts its `friends` row and closes the request. Both
   methods are idempotent on their unique keys.

---

## 2. Actor catalog

Keys are shown as `Name(key)`. "Owns" is the write set. "Loads" is what activate reads into memory.
Method lists are the *minimum* the frontend needs; add methods, don't move tables.

### 2.1 Entity actors

**`UserActor(userId)`**
- Owns: `friends` (rows where `user_id = me`), `friend_requests` (rows where `user_id = me`, the
  requester), `item_favorites`, `user_place_interactions`.
- Loads: the above for this user. Profile fields live in better-auth's `user` table (§3, exempt).
- Methods: `getProfile`, `updateProfile` (proxies to better-auth's API), `sendFriendRequest`,
  `acceptFriendRequest`, `confirmFriendship` (system), `rejectFriendRequest`, `removeFriend`,
  `removeFriendOtherSide` (system), `toggleFavorite`, `recordPlaceInteraction` (visit count is
  computed here, never client-supplied).
- Notes: today `visit_count` is incremented in the browser and posted back; that ends here.
  **No AI or external call runs inside a `UserActor` turn** — a multi-second call would block
  every other operation for that user. Onboarding therefore has its own actor.

**`ItemOnboardingActor(onboardingId)`**
- Owns: `item_onboardings`.
- Methods: `start(type, images)` (AI label/barcode extraction — replaces the six `*_defaults`
  actions and `getItemDefaults`; the AI call runs in this actor's turn, which blocks only this
  onboarding), `defaults`, `confirm(itemInput)` → `ItemActor.create` + `BarcodeActor.ensure` +
  `BrandRegistryActor.resolve` + `CellarActor.addItem`, as idempotent calls, `reprocess` (system,
  called by `OnboardingReprocessJobActor`).
- Visibility: owner only.

**`CellarActor(cellarId)`**
- Owns: `cellars`, `cellar_owners`, `cellar_items`, `check_ins`.
- Loads: the cellar row, owners, all `cellar_items` (a cellar is small enough to hold), and
  `check_ins` for those items.
- Methods: `get`, `create`, `update` (replaces the delete-all/re-insert owner pattern with a set
  diff in one transaction), `delete`, `items(page, sort?, semanticQuery?)`, `addItem`,
  `updateItem`, `removeItem`, `setItemPercentage`, `openItem`, `emptyItem`, `checkIn`,
  `bulkCheckIn(userIds)` (rows written on behalf of friends; friend check in policy),
  `checkIns(page)`.
- Visibility: PUBLIC, or FRIENDS and viewer is a friend of the creator, or viewer is creator or
  co-owner — the four-branch rule from the RLS spike, now in `packages/policy`.
- Semantic sort of items (`semanticQuery`) calls `EmbeddingActor` for the vector, then computes
  distances over the cached items' vectors fetched via `ItemActor` or a direct read.

**`ItemActor(type:itemId)`** — `type ∈ wine | beer | spirit | coffee | sake | tea | generic`
- The `item_type` enum's values are exactly `WINE, BEER, SPIRIT, COFFEE, SAKE, TEA`; `generic`
  is the `generic_items` table (recipe ingredients like salt). Cocktails are **recipes**, not
  items — menu-scan matching branches on that.
- Owns: the type's row in `wines | beers | spirits | coffees | sakes | teas | generic_items`,
  `item_image`, `item_vectors`, `item_reviews`, `item_brands`.
- Loads: the item row, its images, brand links, reviews, current vector ids.
- Visibility: the item is public; `item_image` rows are visible when `is_public` or owned by the
  viewer.
- Methods: `get`, `create` (called by `ItemOnboardingActor` and `RecipePhotoJobActor`), `update`
  (creator only; enrichment updates use `system`), `attachImage(fileId)` (verifies the object
  exists via `FileActor` before writing), `addReview`, `updateReview`, `deleteReview`, `score`
  (computed from reviews in memory; replaces the `_aggregate` calls), `linkBrand`, `unlinkBrand`,
  `regenerateVector` (system, via outbox; change detection on embedding-relevant fields only —
  today every column update re-embeds).
- Presented to GraphQL as one `Item` interface with per-type implementations. The six physical
  tables and the six-column polymorphic FK are hidden behind this actor (§9, deferred consolidation).

**`BarcodeActor(code)`**
- Owns: `barcodes`. Natural-key entity; doubles as the registry for barcode uniqueness.
- Methods: `get`, `ensure(type)`, `linkItem`. Today any user can update any barcode; now only the
  actor can, and only on creation or admin.

**`BrandActor(brandId)`**
- Owns: `brands`.
- Methods: `get`, `create` (called only by `BrandRegistryActor`), `update` (admin), `setParent`.

**`BrandRegistryActor(normalizedName)`** — registry (entity category, no owned table)
- Serializes find-or-create by `lower(trim(name))`. `resolve(name)` returns an existing id or calls
  `BrandActor(newId).create`. Replaces the read-check-insert-recheck loop in `src/utilities/brand.ts`.
  The `lower(name)` unique index stays as the tripwire.

**`PlaceActor(placeId)`**
- Owns: `places`, `place_google_enrichments`, `place_google_photos`, `place_menus`,
  `place_menu_items`, `place_brands`, `place_vectors`, `menu_item_recipes`.
- Loads: the place, enrichment, photos, menus with items.
- Methods: `get`, `create` (called only by `PlaceCreationActor`), `enrichFromGoogle` (budget via
  `BudgetActor`, files via `FileActor`; today 8 sequential admin round-trips), `addMenuFromScan`
  (system, called by `MenuScanActor`), `verifyMenuItemMatch`, `linkBrand`, `refreshFromSource`
  (system, called by `PlaceRefreshJobActor`), `recordAccess`.

**`PlaceCreationActor(viewerId)`** — keyed per creator (was a singleton until `291bcb97`)
- Runs one user's place creation: rate limit (today a TOCTOU count), an early fuzzy duplicate
  check, AI review, then `PlaceActor(newId).create`. The key is the viewer id
  (`placeCreationActorId`), so one user's submissions serialise — which keeps the per-user rate
  limit exact — and an AI review only ever blocks the user who asked for it. `createPlace` refuses
  a ctx whose viewer is not the key.
- **The cross-user duplicate rule is not the key's job.** "No two near-duplicate places" is a
  fuzzy predicate over name and distance, so no actor key can serialise it. `PlaceActor.create`
  holds it instead: `pg_advisory_xact_lock` on every geocell the duplicate distance can reach, in
  one sorted order, then `find_duplicate_places` again under those locks, then the insert — held
  for milliseconds, never across the review.
- The geohash-keyed actor this entry used to offer as an escape hatch was rejected: two
  near-duplicates either side of a cell edge land in different activations, and an actor turn
  cannot also hold its neighbours' keys without nested, non-reentrant calls.
  `docs/architecture/actor-keys.md`, "Decision 1", has the full design, the rejected option and
  the tests.

**`RecipeActor(recipeId)`**
- Owns: `recipes`, `recipe_ingredients`, `recipe_instructions`, `recipe_vectors`, `recipe_reviews`.
- Methods: `get`, `create`, `update`, `setIngredients`, `setInstructions`, `addReview`,
  `regenerateVector` (system, outbox).

**`RecipeGroupActor(groupId)`**
- Owns: `recipe_groups`, `recipe_votes`.
- Methods: `get`, `create`, `vote` (recomputes `canonical_recipe_id` and `name` in-turn —
  replaces the PL/pgSQL trigger), `recipes(page)`.

**`TierListActor(tierListId)`**
- Owns: `tier_lists`, `tier_list_items`.
- Methods: `get`, `create`, `update`, `delete`, `items`, `addItem` (position computed in-turn,
  no read-modify-write race), `removeItem`, `reorderBand(band, orderedIds)` (one transaction —
  replaces N parallel updates with partial-failure detection), `generateInsights` (system, outbox,
  replaces the DB-trigger-as-message-bus).
- Visibility: PUBLIC, or FRIENDS and friend of creator, or creator.

**`MenuScanActor(scanId)`**
- Owns: `menu_scans`, `item_match_suggestions`.
- Methods: `get`, `create(fileId, placeHint)`, `process` (system, outbox: AI extraction, then
  `PlaceActor.addMenuFromScan`, then `match`), `match` (system: vector match via
  `ItemSearchActor` / `RecipeSearchActor`, AI verification in the 0.4–0.9 band), `actOnSuggestion`.
- Visibility: scan owner only. `/discoveries` acts on suggestions by suggestion id, so the
  collection projection (§2.2) carries `scanId` for the resolver to route the mutation.
- Replaces the `processing_status` event trigger, the HTTP shim `onMenuScanComplete`, and the raw
  `fetch` from the server action.

**`FileActor(fileId)`**
- Owns: `files` (new table replacing `storage.files`; object keys preserved exactly).
- Methods: `createUploadTarget(kind)` → presigned PUT + provisional id, `verify` (HEAD via the
  binding; marks `verified_at`), `presignRead`, `delete`. Orphans (never verified/attached) are
  reaped by `MaintenanceActor` via a scheduled outbox row.

**`BudgetActor()`** — singleton
- Owns: `api_budget_config`, `api_usage_log`.
- Methods: `reserve(kind, cost)` → allowed/denied and a usage row **in one turn** (fixes the
  check-then-log race), `usage(range)`.

**`CategoryVectorsActor()`** — singleton
- Owns: `category_vectors`.
- Methods: `seed` (admin; replaces `seedCategoryVectors`), `all`.

### 2.2 Collection actors (read-only; return ids unless noted)

| Actor | Serves | Returns |
|---|---|---|
| `CellarsCollectionActor(viewerId)` | `/cellars`: mine, co-owned, friends' visible | ids |
| `CheckInsCollectionActor(viewerId)` | item detail check-in history: mine + friends' for an item | ids |
| `TierListsCollectionActor(viewerId)` | `/tier-lists` | ids |
| `FavoritesCollectionActor(viewerId)` | `/favorites` | ids (typed `Item` refs) |
| `FriendsCollectionActor(viewerId)` | `/friends`: friends, incoming/outgoing requests | ids + request rows |
| `MenuScansCollectionActor(viewerId)` | `/map/scans` | ids |
| `MatchSuggestionsCollectionActor(viewerId)` | `/discoveries`: pending `item_match_suggestions` for places the viewer has interacted with, by confidence | **projection** (includes `scanId`) |
| `RecipeGroupsCollectionActor()` | `/recipes` list, category filter, paged | **projection** |
| `BrandsCollectionActor()` | `/brands` index, paged | **projection** |

`CellarActor.items` serves in-cellar lists; no collection actor is needed there.

### 2.3 Search actors (keyed by input hash; idle-evicted at 5 minutes)

| Actor | Replaces | Viewer in hash | Returns |
|---|---|---|---|
| `EmbeddingActor(hash(text))` | `create_search_vector` + `unstable_cache` admin workaround | no | vector |
| `ItemSearchActor(hash)` | `text_search` / `image_search` native queries, `searchByText`, `searchByImage` | no | projection (id, type, name, distance) |
| `CellarItemSearchActor(hash)` | in-cellar semantic sort | **yes** | cellar_item ids ordered |
| `PlaceSearchActor(hash)` | `performSemanticSearch` 4-hop pipeline; `search_places_hybrid` + `search_category_vectors` | no | projection |
| `DuplicatePlaceSearchActor(hash)` | `find_duplicate_places` | no | projection |
| `GooglePlacesActor(hash)` | `google_autocomplete`, `google_nearby_search`, text search | no | projection; charges via `BudgetActor` |
| `RecipeSearchActor(hash)` | recipe group `_ilike` search, `recipe_vectors` match | no | projection |
| `BrandSearchActor(hash)` | picker autocomplete `_ilike` | no | projection |
| `UserSearchActor(hash)` | friend search with existing-friend exclusion | **yes** | projection |
| `GeocodeActor(hash)` | Photon forward/reverse geocode (`getCachedGeocode`, the map's address short-circuit) | no | coordinates; long idle window (24h) |

Search SQL: `search_places_hybrid` and `search_places_adaptive_cluster` keep their SQL bodies at
cutover in the hand-written migration lane, called from the actor, **with every weight passed as
an argument from TypeScript** so there is one source of truth. Rewrite later behind the actor.

### 2.4 View actors

| Actor | Serves | Notes |
|---|---|---|
| `MapActor(viewerId)` | `/map` viewport browse | calls `search_places_adaptive_cluster` with tier-list and visit filters; **tier-list visibility is enforced here, in the actor** (see target-stack.md §7); returns a reduced projection (id, lat/lng, name, category, rating, cluster flags) |
| `RankingsActor(viewerId)` | `/rankings` | replaces the `item_scores` Hasura native query: `AVG(score)`, `COUNT(*)` over `item_reviews` grouped by item, for a reviewer set of *everyone* or *viewer + friends*, top 200 by score then count. The reviewer set is derived from `ctx`, never passed by the client (today it is). Returns a projection with typed `Item` refs. |

There is no taste-profile route today; the spec in memory is unbuilt. Nothing in this plan
implements it.

### 2.5 Reference actor

**`ReferenceDataActor(kind)`** — one activation per reference table (§4, "table" column), so no
single actor serializes every dropdown in the app. `all()`, `byValue(value)`. Data changes by
migration; the actors are restarted by deploy.

### 2.6 Job actors

All extend `JobActor`, which owns the `jobs` table (kind, status, cursor, counters, error).
Progress is written to `jobs` each batch; the next batch is scheduled by an outbox row targeting
the same actor. Cancellation is a status flip checked at the top of each batch.

| Actor | Replaces |
|---|---|
| `PlaceRefreshJobActor(jobId)` | `refreshPlaces` + `processPlaceRefreshBatch` + `place_refresh_jobs` cursor loop |
| `OnboardingReprocessJobActor(jobId)` | `reprocessOnboardingBatch` + `onboarding_reprocess_jobs`; iterates `item_onboardings` and calls `ItemOnboardingActor.reprocess` per row |
| `RecipePhotoJobActor(jobId)` | `processRecipePhoto` action + `_utils/recipe-database` (creates recipes, items, brands through their actors) |
| `MaintenanceActor()` (singleton) | orphan-file reaper, dead-letter report; scheduled via `run_after` outbox rows |

### 2.7 Infrastructure actors

**`OutboxActor()`** — singleton. Reminder-registered keep-alive (`drain`, every 2s). Reads
`outbox` rows `where status='pending' and run_after <= now()` ordered by id, batch 100, invokes
`target_actor.method(ctx.system, payload)`, marks delivered or increments attempts; dead-letters at
10 with exponential backoff between. Idempotency is the target method's responsibility.

---

## 3. Table → writer map (source for the single-writer test)

| Table | Writer | Notes |
|---|---|---|
| `cellars`, `cellar_owners`, `cellar_items`, `check_ins` | `CellarActor` | |
| `wines`, `beers`, `spirits`, `coffees`, `sakes`, `teas`, `generic_items` | `ItemActor` | |
| `item_image`, `item_vectors`, `item_reviews`, `item_brands` | `ItemActor` | |
| `item_favorites`, `user_place_interactions` | `UserActor` | |
| `item_onboardings` | `ItemOnboardingActor` | |
| `friends`, `friend_requests` | `UserActor` | rows where `user_id` = the actor's user |
| `barcodes` | `BarcodeActor` | |
| `brands` | `BrandActor` | created via `BrandRegistryActor` |
| `places`, `place_google_enrichments`, `place_google_photos`, `place_menus`, `place_menu_items`, `place_brands`, `place_vectors`, `menu_item_recipes` | `PlaceActor` | created via `PlaceCreationActor` |
| `category_vectors` | `CategoryVectorsActor` | |
| `recipes`, `recipe_ingredients`, `recipe_instructions`, `recipe_vectors`, `recipe_reviews` | `RecipeActor` | |
| `recipe_groups`, `recipe_votes` | `RecipeGroupActor` | |
| `tier_lists`, `tier_list_items` | `TierListActor` | |
| `menu_scans`, `item_match_suggestions` | `MenuScanActor` | |
| `files` | `FileActor` | new; replaces `storage.files` |
| `api_budget_config`, `api_usage_log` | `BudgetActor` | |
| `jobs` | `JobActor` base class | new; replaces both `*_jobs` tables |

**Exempt (infrastructure):**

| Table | Written by |
|---|---|
| `outbox` | any actor inserts inside its own transaction; `OutboxActor` updates status |
| better-auth tables (`user`, `session`, `account`, `verification`, `jwks`) | better-auth via its Drizzle adapter, mounted in `services/actors` |
| reference tables (§4) | migrations only |

**Removed at cutover:** `hdb_catalog.*`, `place_search_results`, `hybrid_search_results`,
`search_category_vectors_results`, `duplicate_place_results` (phantom `SETOF` types),
`recipe_summary`, `recipe_ingredients_detailed`, `item_brands_detailed` (views),
`place_refresh_jobs`, `onboarding_reprocess_jobs`, `storage.*`, `auth.*` (after transform),
triggers `update_canonical_recipe`, `trigger_recipe_group_embedding_update`,
`tier_list_items_content_changed`. `admin.credentials` — the GCP service-account JSON fallback for
Vertex AI (`functions/_utils/gcp-credentials.ts`); production's row held a live private key.
Dropped at cutover by migration `20260928194604_drop_admin_credentials` (`e4-decisions.md`
decision 4); the key still needs rotating in GCP by hand.

---

## 4. Enum classification

Compile-time enums become `pgEnum` in Drizzle, `enumType` in Pothos, literal unions in gql.tada.
Reference data stays a table behind `ReferenceDataActor`. Move an entry across the line when the
code's use of it disagrees with the classification.

| `pgEnum` (code branches on the value) | Table (catalog with display data, code never branches) |
|---|---|
| `item_type` | `country` (197 rows) |
| `permission_type` | `wine_variety` |
| `friend_request_status` | `wine_style` |
| `instruction_types` | `beer_style` |
| `brand_types` | `spirit_type` |
| `recipe_category` | `coffee_cultivar` |
| `coffee_roast_level` | `sake_category` |
| `coffee_process` | `sake_type` |
| `coffee_species` | `sake_rice_variety` |
| `tea_caffeine_level` | `tea_category` |
| `tea_form` | |
| `sake_serving_temperature` | |

**Corrected 2026-09-08 by A3, against the live database. §4 named tables; the unit is the column.**

- **`item_type` has exactly one referencing column**, `item_favorites.type` — and it is a
  `STORED GENERATED` column, so the enum conversion must drop and re-add it. It moves to the end of
  the table and its values are recomputed. Anything selecting `*` in column order will notice.
- **`cellar_items.type` carries the identical uppercase vocabulary with no foreign key**, so it is
  untouched by the enum split and stays `text`. If it should be an enum, that is a deliberate extra
  change, not part of the mechanical conversion.
- **`tier_list_items.type` adds `'PLACE'`**, which `item_type` cannot represent. It cannot be
  converted to `item_type` without widening the enum. Left as `text`.
- **Key columns differ:** `instruction_types` and `brand_types` key on `id`; the other ten key on
  `value`. `ReferenceDataActor` and the enum conversion both have to respect this.

---

## 5. Function and action disposition

Every one of the 33 Nhost functions and 15 Hasura actions has a destination. "Port" means the
logic moves; the HTTP handler, admin-secret client, and Kriti transform are deleted.

| Today | Destination |
|---|---|
| `wine/beer/spirit/coffee/sake/tea_defaults` (6 actions → `getItemDefaults`) | one mutation `startItemOnboarding(type, images)` → `ItemOnboardingActor.start` |
| `create_search_vector` → `getVectorForString` | `EmbeddingActor` |
| `item_image_upload` → `uploadItemImage` | `FileActor.createUploadTarget` + `ItemActor.attachImage` |
| `processRecipePhoto` | `RecipePhotoJobActor` (the owner is taken from the caller's identity, never from the request body — see target-stack.md §7) |
| `reviewUserPlace` | inside `PlaceCreationActor` |
| `google_autocomplete`, `google_nearby_search` | `GooglePlacesActor` |
| `enrich_place_from_google` → `enrichPlaceFromGoogle` | `PlaceActor.enrichFromGoogle` |
| `search_nearby_places` → `searchNearbyPlaces` (no caller) | delete; `MapActor` covers it |
| `refresh_places` + `processPlaceRefreshBatch` | `PlaceRefreshJobActor` |
| `reprocessOnboardingBatch` | `OnboardingReprocessJobActor` |
| `generateItemVector`, `generateItemImageVector` (6 event triggers + HTTP shim) | `ItemActor.regenerateVector` via outbox |
| `generateRecipeVector` | `RecipeActor.regenerateVector` via outbox |
| `friendManager` (event trigger) | `UserActor.acceptFriendRequest` / `confirmFriendship` |
| `onMenuScanComplete` → `matchMenuItems`, `processMenuScan` (raw fetch) | `MenuScanActor.process` / `match` |
| `generateTierListInsights` | `TierListActor.generateInsights` via outbox |
| `seedCategoryVectors` | `CategoryVectorsActor.seed` |
| `hybridPlaceSearch`, `semanticPlaceSearch`, `semanticRecipeSearch`, `generatePlaceVector`, `generateImageVector`, `generatePlaceholder`, `discoverPlaceMenu` (no callers) | **port into the owning actor as unexposed methods, tagged `@deprecated candidate`** for the post-cutover review (§9). Do not expose in GraphQL. |
| `_utils/ai-providers`, `_utils/google-places`, `_utils/budget`, `_utils/item-matching` | `services/actors/src/lib/` |
| `text_search`, `image_search` (Hasura native queries) | `ItemSearchActor` |
| `item_scores` (Hasura native query, `reviewers` array argument) | `RankingsActor` — reviewer set derived server-side |
| `getCachedGeocode` / Photon (`src/lib/cache/index.ts`) | `GeocodeActor` |
| `DiscoveryDashboard` (`src/components/map/discovery/`, raw-string queries with a TODO saying they don't match the schema) | rewritten against `MatchSuggestionsCollectionActor`; it is already broken, so D5 treats it as new |
| `search_places_hybrid`, `search_category_vectors`, `find_duplicate_places`, `search_places_adaptive_cluster` (tracked SQL functions) | kept as SQL in the hand-written lane; called from `PlaceSearchActor`, `DuplicatePlaceSearchActor`, `MapActor` |
| `ADD_MENU_ITEM_TO_CELLAR` (dead reference to a non-existent action) | delete from `src/components/map/queries.ts` |

---

## 6. Workstreams

Dependencies are by id. A workstream with no listed dependency can start immediately.
Sizes are rough agent-sessions: S ≤ 1, M 1–3, L 3+.

### 6.0 Status

| Id | Workstream | Size | Depends on | Status |
|---|---|---|---|---|
| A1 | Five production indexes | S | — | **done** (local; prod apply is the user's) |
| A2 | Repo scaffolding + compose + CI | M | — | **done** |
| A3 | Database baseline (PG18, dump, `pull --init`, enums) | M | A2 | **done** (hand-written SQL lane split out to A3b) |
| A4 | Actor harness, `ctx`, policy package, single-writer test | M | A2, A3 | **done** |
| A5 | Outbox + `OutboxActor` + `JobActor` base | M | A4 | **done** |
| A6 | better-auth + JWT + user migration script | M | A3 | **done** (own `auth_dev` DB until A3/E1 merge it — see `services/actors/src/auth/README.md`) |
| A6b | better-auth ids `text` → `uuid` | S | A6 | **done** |
| A3b | Hand-written SQL lane (4 search fns, 5 distance helpers, customType) | S | A3 | **done** |
| A7 | API skeleton (yoga, Pothos, JWKS, actor proxies, schema snapshot) | M | A4, A6 | **done** |
| A7b | Actor-host error envelope + outbox `seq` ordering | S | A5, A7 | **done** |
| A8 | `FileActor` + MinIO binding + object-key migration | M | A4 | **done** |
| A9 | `ReferenceDataActor` + `CategoryVectorsActor` + local seed | S | A4, A6 | **done** |
| B1 | Cellar aggregate | L | A5, A7 | **done** |
| B2 | Item aggregate + `BarcodeActor` + `ItemOnboardingActor` | L | A5, A7, A8, B3 | **done** |
| B3 | Brand aggregate + registry | S | A5, A7 | **done** |
| B4 | User aggregate (friends, favorites, interactions) | M | A5, A7 | **done** |
| B5 | Place aggregate + creation registry + Google + budget (incl. B9) | L | A5, A7, A8 | **done** |
| B3b | Re-prove B3's concurrent brand create with a barrier | S | B3, B5 | **done** (B3's original test *was* contending) |
| B6 | Recipe + RecipeGroup aggregates | M | A5, A7, B2, B3 | **done** |
| B10 | Audit every actor for cached un-owned rows (§1.3) | S | B6 | **done** (2 violations fixed) |
| B7 | TierList aggregate | M | A5, A7 | **done** |
| B8 | MenuScan aggregate | M | A5, A7, A8, B5, C1 | **done** |
| B8b | Widen `place_menu_items.detected_item_type` | S | B8 | **done** (cocktail home still open — see B8c) |
| B8c | Give an accepted cocktail a home via `menu_item_recipes` | S | B8b | **done** (`a88a5db3`) |
| B9 | `BudgetActor` | S | A5 | **absorbed into B5** (§6's B5 text already covers it) |
| C1 | Search actors: embedding, item, cellar-item, recipe, brand, user, duplicate-place, place, Google, geocode | L | A7, A9, B2, B5 | **done** |
| C2 | View actors: `MapActor`, `RankingsActor` | M | A7, B2, B5, B7 | **done** |
| C1b | Fix `ClusteredPlaceRow`'s field list in `place-search-sql.ts` | S | C1, C2 | **done** |
| C3 | Collection actors | M | A7, B1, B4, B7, B8 | **done** |
| C4 | Job actors: place refresh, onboarding reprocess, recipe photo, maintenance | M | A5, B2, B3, B4, B5, B6 | **done** |
| C4b | Overture bulk reload job (BigQuery seam + `PlaceActor` bulk upsert) | M | C4, B5 | **done** (`a88a5db3`) |
| C4c | Hoist `derivedUuid` (3 copies) into `src/lib` | S | C4 | **done** |
| D1 | Frontend: auth + URQL client + proxy routes + server-component token flow | M | A6, A7 | **done** (additive; D9 flips) |
| D2 | Frontend: cellars pages | L | D1, B1, B2, C3 | **done** (+ auth pages) |
| X1 | Wire an AI provider into `services/actors` | M | A4 | **done** |
| X1b | Restore the enum-constrained item-defaults schema | S | X1, A9 | **done** (`10c7a0ff`) |
| B7b | Widen `InsightsGenerator`'s input beyond type+id | S | B7, X1 | **done** (`fdc0c5ba`) — the widening was already in `10c7a0ff`; its abstention gate was never called and the six-field parse blocked every write |
| X2 | Merge `auth_dev` into the main database | M | A6b | **done** |
| X3 | Give the test suites their own database | S | A4 | **done** |
| X4 | Make CI actually build the test database; fold the SQL lane into `run.sh` | S | X3 | **done** (`a2d8dcef`) |
| D3 | Frontend: item pages + add/onboarding | L | D1, B2, A8 | **done** |
| A7c | Close the API-surface gaps D3 found (incl. a silent data-loss path) | M | A7, A8, B2 | **done** |
| D3b | Re-point D3's `referenceData` documents at the new result union | S | A7c, D3 | **done** (by D5) |
| A7e | Error unions on the eight remaining paging root fields | S | A7c | **done** (`85ddc0e7`) |
| D4 | Frontend: search, brands, favorites | M | D1, C1, C3 | **done** |
| A7g | `Brand` reverse edges; `Query.brand` result union; document the search caps | S | A7c, B3 | **done** (`38f34c9d`) — all four edges live; the client's `try/catch` became `unwrapResult`, which is what a union error needs |
| D3c | Use `Item.isFavorite` in `viewerAndFavorite.ts` | S | A7c, D3, D4 | **done** |
| D5 | Frontend: map, places, create-place, scans, discoveries | L | D1, B5, B8, C2, C3 | **done** |
| A7f | Expose the actors that have no GraphQL surface (`MapActor`, `RankingsActor`, jobs) | M | C2, C4 | **done** |
| D5b | `/map`: switch to `Query.mapBrowse` | S | A7f, D5 | **done** |
| D6b | `/recipes/ai-generator`: build the real flow | S | A7f, D6, X1 | **done** |
| X5 | Wire the Photon geocoder into `GeocodeActor` | S | C1 | **done** (`10c7a0ff`) |
| D6 | Frontend: recipes | M | D1, B6, C1, C4 | **done** |
| A7d | Recipe API gaps + systemic connection defects (D6) | M | A7c, B6, C1, C4 | **done** (`totalCount` fixed in the collection base, not eight times) |
| D7 | Frontend: tier lists, rankings | M | D1, B7, C2, C3 | **done** |
| X6 | Fold `graphcache-keys` generation into schema codegen | S | A7, D1 | **done** (`5b96b0b6`) |
| D8 | Frontend: friends, users/edit | M | D1, B4, C3 | **done** |
| B4b | `UserActor` instance-granularity staleness + typed error discriminator | S | B4, D8 | **done** |
| D9 | Remove Nhost client, `functions/`, Hasura metadata, subscriptions | M | D2–D8 | **done** (~445 files, ~92k lines) |
| D5c | The geolocation cookie has no writer — `initialCenter` is null for every viewer | S | D5, D9 | **done** (`1adeb839`) |
| X10 | CLAUDE.md describes a stack that no longer exists | S | D9 | **done** (`185c4549`) |
| X11 | The onboarding wizard silently discards a typed barcode | S | E2c | **done** (a wiring bug, not a product question — `ensureBarcode` + `linkBarcodeItem` already existed) |
| E1 | Cutover transform scripts + rehearsal | L | A3, A6, A8, all B | **done** (rehearsed 3×) |
| E2 | Playwright golden flows | M | D2–D8 | **done** (67 pass, 14 real failures) |
| E2a | Sign-out still calls Nhost **(security)** | S | E2 | **done** |
| E2b | Server pages importing values from `"use client"` modules — 4 routes 500 | S | E2 | **done** |
| E2e | `next/link` passed as a *prop* into Joy client components | S | E2b | **done** (4 pages, not 3) |
| X7 | Move the client-boundary scan out of Playwright into a unit test | S | E2b | **done** |
| X8 | The root Next app has **no CI workflow at all** | S | — | **done** |
| X9 | Port or delete three Jest-syntax tests with no Jest in the repo | S | X8 | **done** (row was stale; D9 deleted them) |
| E2c | Onboarding fabricates an item from no image, then overwrites your input | M | E2, X1b | **done** (`10c7a0ff`; sake picker follow-on `4aa3191e`) |
| E2d | `removeFriend` breaks read-your-own-writes; `createMenuScan` skips verify | M | E2 | **done** (`c43bf60a`, `10c7a0ff`) |
| E2f | `ItemOnboardingActor` uses label-image ids it never verifies | S | E2d | **done** (`4c371dd4`) |
| E3 | Loki infra: DNS, port forward, Caddy, Grafana, secrets, deploy pipeline, backups | M | A2 | **done** |
| E4 | Cutover runbook execution | S | E1, E2, E3, D9 | **gated at step (0a)** — 0 of 5 blocking decisions remain, but nothing may be merged to `main` until `e4-decisions.md` decision 15's two settings changes are made and confirmed; runbook revised 2026-09-18 and 2026-09-27 |

### A — Foundations

> **Phase A is complete as of 2026-09-08.** Verified together: 231 tests passing
> (contracts 24, policy 31, db 11, api 31, actors 134), `tsc` clean in all six packages, `biome`
> clean across 110 files, seven actors registered, `docker compose config` valid, `functions/`
> untouched. Note **`CI=true` is required for `pnpm exec`** in this repo — without it pnpm aborts
> with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` and the failure looks like a compile error.

**A1 · Five production indexes.** Independent of everything; do first, on the current Nhost stack
through the `nhost-hasura-admin` agent as a normal migration.
```sql
CREATE INDEX idx_cellar_items_cellar_id ON cellar_items (cellar_id);
CREATE INDEX idx_cellars_created_by_id  ON cellars (created_by_id);
CREATE INDEX idx_cellars_privacy_public ON cellars (id) WHERE privacy = 'PUBLIC';
CREATE INDEX idx_friends_friend_user    ON friends (friend_id, user_id);
CREATE INDEX idx_cellar_owners_cellar   ON cellar_owners (cellar_id, user_id);
```
Accept: migration applied locally and in prod; `EXPLAIN` on the cellars list query shows index use.

**A2 · Repo scaffolding.** DONE 2026-09-08. Create `services/api`, `services/actors`, `packages/db`,
`packages/contracts`, `packages/policy` (§8.1). **The stack compose landed at
`infra/docker-compose.yml`, not the repo root** — a root `docker-compose.yaml` already exists for
unrelated MCP tooling and Docker Compose hard-errors when both spellings are present. Dapr
components live in `infra/dapr/components/`. Host ports avoid the running Nhost stack, which holds
5432 and 443: Postgres **5433**, MinIO 9100/9101, api 3001, actors 3002, Grafana 3010.
Postgres is a local build on `imresamu/postgis:18-3.6-bookworm` (official `postgis/postgis` is
amd64-only) plus `postgresql-18-pgvector`. **PG18 gotcha:** mount the volume at
`/var/lib/postgresql`, *not* `/var/lib/postgresql/data`, or the entrypoint refuses to start.
Dapr sidecars are **separate containers**, not `network_mode: service:<app>` — the shared-namespace
form breaks permanently when the app container restarts. Original spec follows:
`docker-compose.yml` at repo root: `postgres:18` with postgis, pgvector,
pg_trgm, pgcrypto; `minio`; Dapr `placement` and `scheduler`; sidecars for both apps; `grafana/otel-lgtm`.
Dapr components: `minio` S3 binding, no state store, no pub/sub. CI: typecheck, biome, vitest,
single-writer test, schema snapshot.
Accept: `docker compose up` brings both apps healthy with sidecars registered; a smoke actor
(`PingActor.ping`) is callable from the API; CI green on the scaffold.

**A3 · Database baseline.** Restore a production dump into PG18 locally. Write the cutover
transform (E1 owns the final version; A3 produces the first cut): drop Hasura artifacts, apply §4
enum split, create `files`, `jobs`, `outbox`. Then `drizzle-kit pull --init` to baseline
`packages/db/schema`. Pin `drizzle-orm@1.0.0-rc.4` and `drizzle-kit@1.0.0-rc.4`; record both in
`packages/db/README.md`. Add the hand-written migration for the four SQL search functions,
`geography` columns, and the pgvector distance helpers.

**Answered by A3's `drizzle-rc-pull` findings (2026-09-08).** That report was retired on
2026-09-19 once the baseline had been taken and its durable answers had moved into
`target-stack.md` §2; the full text is in git history. The operative answers, inlined:
- `pull --init` *does* emit a full RQB v2 `defineRelations` file. It is not hand-written.
- It must be run with `schemaFilter: ["public","auth","storage"]`. Scoped to `public` alone the
  generated relations reference `usersInAuth` / `filesInStorage`, which are absent, and the file
  throws at import. This is transitional: after cutover `auth` and `storage` are gone, so re-baseline
  against `public` alone once better-auth's tables and `files` have replaced them.
- The generated `.through()` many-to-many relations are **wrong on ordinary two-FK tables**
  (`cellars`, `brands`, `tier_lists` confirmed). Audit every `.through()` by hand; do not trust them.
- `halfvec` and its HNSW indexes round-trip natively. `geography`, `geometry`, `tsvector` and `money`
  fall back to untyped `customType(...)` placeholders — hand-write typed wrappers for these (§8.6).
- This database has **no composite foreign keys at all** (188 FKs at the time A3 measured — that is
  every FK in every schema, which is the right scope for a composite check but **not** the number
  that matters for the user-table re-point; see X2), so the
  kit's composite-FK truncation bug is unreachable here. Nothing to spot-check.
- The live database is already PostgreSQL **18.4**. There is no version skew to migrate across.
- `pull --init` is **not read-only** — it creates `drizzle.__drizzle_migrations`. Expect it.

Only nine columns in `public` use those four types, and five of them belong to the phantom
`RETURNS SETOF` tables §3 deletes at cutover (`duplicate_place_results`, `hybrid_search_results`,
`place_search_results`). **Typed wrappers are therefore needed for exactly four surviving columns:**

| Column | Type |
|---|---|
| `places.location` | `geography` |
| `places.search_text` | `tsvector` |
| `menu_scans.scan_location` | `geography` |
| `place_menu_items.menu_item_price` | `money` |

`menu_item_price` being `money` is a latent bug worth fixing in the same pass: Postgres `money`
is locale-dependent (it formats and rounds per the server's `lc_monetary`) and is the wrong type
for a stored price. Convert it to `numeric(10,2)` in the A3 cutover transform, and record the
change in E1 so the transform script carries it.

Accept: `drizzle-kit check` clean; `drizzle-kit generate` produces an empty diff against the
restored database; the RC pin verified; RQB v2 relations exist for every FK in §2's "Loads" lists
and every `.through()` has been hand-audited; the four `customType` columns have typed wrappers.

**A3 outcome (2026-09-08).** Transform lives in `packages/db/transform/` (`01`—`07` + `run.sh`).
Baseline is `packages/db/src/schema/{tables,relations}.ts`; `drizzle-kit check` clean and
`generate` reports no changes. The `.through()` audit removed 5 of 13 generated junctions and,
more seriously, found that **30 of 173 foreign keys had no relation at all** — the kit emits none
for a table it treats as a junction, so `friends` and `friend_requests` were missing from
`relations.ts` outright. All 30 were added and `relations.smoke.test.ts` now guards the count.

Two further rc.4 `pull` bugs the recon pass did not reach:
- `pull` writes single-column FKs as inline `.references()`, losing the constraint name, while
  `--init` snapshots the catalog *with* names — so `generate` demanded 171 rename hints. Resolved
  from the database side by `transform/07_align_constraint_names.sql`, which renames 173 FKs and 3
  PKs to Drizzle's convention so `tables.ts` stays untouched generator output. **This is safe here
  and would not be elsewhere:** the transform builds the *new* database from a dump; the Nhost
  database is never modified, so no live Hasura ever sees a renamed constraint, and the rollback
  path (Q32) is unaffected. The ~176 `on_conflict` call sites in today's frontend name Hasura
  constraints, but every one of them is rewritten in the D workstreams anyway.
  Three derived names exceed Postgres's 63-byte limit and get Drizzle's deterministic
  `<table>_<hash>_fkey`; `07` lists those three verbatim and aborts if a fourth appears.
- `pull` drops the operator class from *expression* indexes, so `idx_places_name_compact_trgm` came
  back without `gin_trgm_ops` — not just different, invalid. One marked hand-edit in `tables.ts`
  plus a `restore_expression_index_opclass` migration.

Also: `drizzle-kit migrate` cannot replay the introspected baseline (its SQL sits inside `/* */`
and the runner splits on the statement breakpoint before stripping comments). Rebuild dev databases
with `transform/run.sh`. And `schema:` must point at `tables.ts`, not the `./src/schema` directory,
which crashes rc.4 when the glob picks up `relations.ts`.

**A4 · Actor harness.** `packages/contracts`: `Ctx`, actor interface types, category tags.
`services/actors/src/lib/actor-base.ts`: base class injecting a Drizzle instance, `onActivate` loading
hook, transaction helper. `packages/policy`: `canSeeCellar`, `canSeeTierList`, `canSeeCheckIn`,
`canSeeItemImage` (`is_public` or owner), `isOwner` (menu scans, onboardings, interactions,
favorites), `isFriend`, with the four-branch rule. An in-memory harness that instantiates actors
as plain classes against a test database without Dapr. The single-writer test (§1.2).
Also add the **no-actor-state test**: no file under `services/actors/src/actors` may reference
`getState`, `setState`, `removeState` or `saveState`. A2 was forced to declare an `actorStateStore`
component (Dapr will not host actors without one — see A2 above and `target-stack.md` Q30) and
chose `state.in-memory`. Nothing may come to rely on it: Postgres stays the only truth (§1.3).
This test is what preserves that, now that the component's absence no longer does.
Accept: harness runs an actor's `onActivate` and a method against testcontainers Postgres with no
sidecar; single-writer test fails when a table is added to the schema without a writer entry;
no-actor-state test fails when an actor calls `setState`; policy functions have
owner/friend/stranger tests.

**A5 · Outbox and jobs.** `outbox` table (id, target_actor, target_id, method, payload, run_after,
attempts, status, last_error). `OutboxActor` with reminder keep-alive, batch drain, backoff,
dead-letter. `JobActor` base with `jobs` table, cursor, cancel check. **The §6.4 confirmation is superseded.** A2 established that an
`actorStateStore` component must be declared or Dapr refuses to host actors at all, so "do
reminders work without one" is not a reachable configuration. The question A5 must actually
answer: **does a registered reminder survive a full restart of the actor host and its sidecar, and
still fire?** Reminders live in the Scheduler's etcd volume since Dapr 1.15, so they should —
prove it, and record the result in `target-stack.md` §7.
Accept: a test actor writes a row + outbox entry in one transaction, kills the process before
delivery, and the entry is delivered after restart; dead-letter after 10 attempts is observable in
Grafana; a reminder registered before `docker compose restart actors actors-dapr` still fires
afterwards.

**A6 · better-auth.** Mounted in `services/actors` on its HTTP server at `/api/auth/*`, Drizzle
adapter, `jwt` plugin (15-minute tokens, JWKS at `/api/auth/jwks`), Google / Facebook / Discord
providers with new callback URLs registered. `scripts/migrate-users.ts`: `auth.users` +
`auth.user_providers` → better-auth `user` + `account`, bcrypt hashes preserved via a custom
`password.verify`. Note: there is no `public.users` table today; profile fields live on
`auth.users` and move to better-auth's `user` table.
Accept: sign-in with a migrated password works; each OAuth provider relinks by email; a JWT
verifies against the JWKS; the migration script is idempotent on re-run.

**A7 · API skeleton.** graphql-yoga in `services/api`, Pothos with `plugin-relay`, `plugin-errors`,
`plugin-dataloader`. JWKS verification middleware building `ctx` (§8.2). Typed actor proxies from
`packages/contracts`. `printSchema` written to **`packages/schema/schema.graphql`** and snapshot-tested (a new tiny
package — see §8.1; the `packages/shared` originally named here does not exist);
gql.tada configured against that file (`graphql-env.d.ts` generated from it, not from introspection).
`Item` interface declared. Every list field is a Relay connection.
Accept: `me` query resolves through a JWT; a resolver calls `PingActor` via the sidecar; schema
snapshot test fails on any schema change; the API process has no database connection string.

**A7b · Actor-host error envelope.** A7 found that `plugin-errors` can only map an actor failure
to a typed GraphQL error if the actor host serialises thrown errors as `{ code, message }`. Today
the Dapr JS SDK returns a 500 with a stack, so every domain error (`NotFound`, `Forbidden`,
`Conflict`, `Validation`, `BudgetExceeded`) degrades to an opaque `ActorInvocationError`.
`services/api/src/dapr.ts` already parses the envelope and falls back gracefully, so this is additive.
Add the handler in `services/actors` so `ActorError` subclasses cross the wire with their `code`.
Accept: a resolver calling an actor that throws `ForbiddenError` receives a typed error with
`code: 'FORBIDDEN'`, not a 500; the fallback still works for a genuinely unexpected throw.

**A8 · Files.** `FileActor`, `files` table, MinIO binding with `presign`. Migration script copies
`storage.files` rows to `files` and objects from Nhost storage to MinIO **with keys preserved**.
Orphan reaper as a `MaintenanceActor` scheduled outbox row (24h).
**A8 outcome (2026-09-08). Four corrections:**
- **The FK repoint is not A8's.** The six columns still pointing at `storage.files`
  (`item_image.file_id` and friends) are repointed by each consuming actor in B2 / B5 / B8.
  `packages/db/src/schema/tables.ts` was deliberately left alone.
- **Dapr's S3 binding cannot presign uploads** — reading `dapr/components-contrib`, it implements
  `PresignGetObject` only. Uploads are signed in-process with the `minio` client
  (`services/actors/src/lib/s3-presign.ts`). See `target-stack.md` §4: this makes the upload path
  provider-specific code, so a later swap to GCS is no longer component-config alone.
- **The endpoint problem is worse than DNS.** `X-Amz-SignedHeaders=host` puts the Host header inside
  the signature, so a hosts-file alias cannot rescue it — the browser must both resolve *and*
  address the request as the host that signed it. E3 owns this for **both** read and write paths.
- **The migration moved 0 objects locally.** This dev environment's `storage.files` is empty and the
  Nhost bucket holds no objects, so only the *mechanism* is proven (key `=` row id, traced through
  `hasura-storage`'s source; get→put→verify byte-identical and idempotent against two real buckets).
  **E1 must rehearse this against production data** — it is unverified at any scale.

Accept: browser PUT to a presigned URL, `verify` succeeds, read presign returns the image;
every migrated key resolves; unverified targets older than 24h are deleted by the reaper in a test.

**A9 · Reference data and local seed.** `ReferenceDataActor(kind)`, `CategoryVectorsActor`,
GraphQL enum types for §4. `pnpm db:seed` replaces `nhost up --apply-seeds`: loads
`nhost/seeds/default/*.sql` reference rows and creates the two test accounts
(`test@test.com`, `test2@test.com`, password `123456789`) through better-auth's API so their
hashes are native.
**A9 outcome (2026-09-08). Two corrections to this workstream's own text:**
- **`nhost/seeds/default/*.sql` never contained the reference rows.** That file is sample fixture
  data (test cellars and items). The ten reference tables were populated by one-off `INSERT`
  *migrations* (`nhost/migrations/default/*_insert_into_public_*`), which is why A3's schema-only
  dump carries their shape and zero rows. A9 sourced `services/actors/scripts/reference-data.json`
  from a live `SELECT` against Nhost instead — 197 countries, 55 wine varieties, 53 beer styles,
  matching §4's own "country (197 rows)" aside.
- **`docker compose up && pnpm db:seed` is not sufficient on an empty volume.** It must be
  `transform/run.sh` (schema) — then `auth:push` (better-auth tables) — then `db:seed`.
- Confirmed: **ten** reference tables remain, all keyed on `value`. `instruction_types` and
  `brand_types` are not among them — the §4 transform turns both into native `pgEnum`s.

Accept: `referenceData(kind)` query returns each table; `pgEnum` types appear in the schema
snapshot; `transform/run.sh` + `auth:push` + `pnpm db:seed` on a fresh volume yields a
sign-in-able test account.

### B — Domain aggregates

Each B workstream delivers: the actor(s) per §2 with all listed methods, the Pothos object types
and root fields for that aggregate, owner/friend/stranger tests per viewer-dependent method,
outbox side effects wired, and the schema snapshot updated. Frontend is **not** in scope for B.

**B1 · Cellar.** `CellarActor`. Accept: the four-branch visibility rule passes its three-viewer
tests for `get`, `items`, `checkIns`; `bulkCheckIn` rejects a non-friend id; `update` with a
changed owner set is one transaction (verify with a failing-midway test).

**B1 outcome (2026-09-09). Corrections:**
- **`CellarActor` emits no outbox row, and that is correct.** The B-section preamble's "outbox side
  effects wired" is not universal — this aggregate is an outbox *target* only. `addItem` and
  `checkIn` are idempotent on `input.cellarItemId ?? outboxRowId(ctx.requestId) ?? randomUUID()`,
  which prepays B2's "confirm re-delivered twice yields one cellar item" acceptance. *(Since
  12e00c72 the middle term is `idempotencyKey(ctx, "CellarActor.addItem:cellar-item")` —
  derived from `ctx.delivery`, not parsed out of `requestId`; see §1.4's
  corrections.)*
- **§2.1 never said who may `update`/`delete`.** B1 preserved today's Hasura split:
  creator-or-co-owner for name, privacy and all item methods; **creator only** for changing the
  co-owner set and for `delete`.
- **Two deliberate tightenings against today's behaviour, both worth ratifying:** `checkIn`/
  `bulkCheckIn` now require the cellar to be visible, and `delete` refuses a non-empty cellar
  (every FK into `cellars`/`cellar_items` is `ON DELETE RESTRICT`, so a cascade would be unbounded,
  which §1.5 forbids).
- **For B2:** `ItemActor` is keyed `type ∈ wine|beer|spirit|coffee|sake|tea|generic` in §2.1, but
  `ITEM_TYPES` in `packages/contracts/src/items.ts` has only the six. Reconcile before building.
- **For C1:** `EmbeddingActor` must be keyed by `sha256(lower(trim(text)))` — `CellarActor`'s
  `semanticQuery` already calls it that way (`embeddingActorId` in `cellar-actor.ts`).
- **Harness note for every later B/C agent:** inside `withTestDb`'s single transaction `now()` is
  constant, so every `created_at` ties. Anything asserting insertion order needs an explicit
  timestamp or a tie-break assertion.

**B2 · Item + Barcode + Onboarding.** `ItemActor` for all seven types, `BarcodeActor`,
`ItemOnboardingActor`. Accept: `Item` interface resolves each type; `update` by a non-creator is
refused; `attachImage` refuses an unverified file; `regenerateVector` runs via outbox only when
embedding-relevant fields changed (test: a `notes` update does not enqueue); `score` matches the
old `_aggregate` result on a fixture; `ItemOnboardingActor.confirm` re-delivered twice creates one
item, one barcode link, one cellar item; onboarding `start` returns AI defaults for each item type.

**B2 outcome (2026-09-09). The `generic` type question, settled against the database:**
`generic` is a **key namespace of `ItemActor`, not a member of `ItemType`.** Both §2.1 and
`ITEM_TYPES` were right about different things. Evidence: `pg_enum` for `item_type` holds exactly
six labels and no `generic`; `generic_items.item_type` is `text` with a check for
`spirit|wine|beer|coffee|ingredient` — lowercase, and `ingredient` is a value `item_type` cannot
represent; and `generic_items` is referenced only by `recipe_ingredients`. No satellite table has a
`generic_item_id` column, so a generic item has no images, vector, reviews or brands, cannot be
favourited and cannot sit in a cellar. **It is not an `Item`.** `ItemActor` remains its single
writer and keeps the seventh key prefix; every item method throws `ValidationError` on a `generic:`
key and vice versa. This is the same shape as A3's `tier_list_items.type = 'PLACE'`: a `text`
discriminator deliberately wider than the enum. *(Since `e73bab89`, migration
`20260928043100_generic_items_sake_tea_kinds`, the check also admits `sake` and `tea`; the list is
`GENERIC_ITEM_KINDS` in `packages/contracts/src/items.ts`, held to the live check by
`services/actors/src/lib/item-spec-schema.test.ts`.)*

**Other corrections:**
- **§2.1's `setBarcode(ctx, code: string | null)` is not implementable** — the outbox payload trap,
  now hit three times (B4, B2). Real signature: `setBarcode(ctx, { code })`.
- **B2's own acceptance text referenced a `notes` column that does not exist** on any of the six
  item tables. The embedding-inert column is `barcode_code`; the test asserts `create` enqueues one
  `regenerateVector`, `setBarcode` enqueues none, a description change does, a same-value `name`
  rewrite does not.
- **`confirm` returns ids for rows that do not exist yet.** §8.5 forces its entity→entity calls
  (`ItemActor.create`, `linkBrand`, `CellarActor.addItem`) through the outbox, while
  `BarcodeActor.ensure` and `BrandRegistryActor.resolve` stay synchronous. Made safe by minting ids
  **deterministically** from the onboarding id, so idempotency does not depend on a status
  short-circuit. The plan never stated this consequence.
- **§2.1 gives no policy for `linkBrand`/`unlinkBrand`, `attachImage`/`detachImage` or the review
  methods.** B2 preserved today's Hasura rules exactly: images insert = any signed-in, update/delete
  = uploader; reviews insert = any signed-in, update/delete = author; `item_brands` = item creator.
- **`ItemActor` has no anonymous `Visibility:` rule**; B3's catalog rule (any signed-in viewer,
  anonymous refused) was applied for consistency. **Ratify or overrule** — it is one line if items
  should be readable logged-out.
- **Pothos fact worth recording:** `plugin-errors` with `directResult: true` cannot wrap a field
  returning an *interface*, because a union member must be an object type. `Query.item`,
  `createItem` and `updateItem` therefore use `directResult: false`.
- **Two schema findings for E1** (fixed or noted separately): `sakes.country`'s default was
  unsatisfiable — **fixed**, see below. `item_reviews.text` is `json` rather than `jsonb`, and
  `item_onboardings.status` is bare `text` with no check constraint. E1 may want both tightened.

**Fixed while reviewing B2 (2026-09-09): `sakes.country` had `DEFAULT 'Japan'` against a
`country(value)` FK whose row is `'JAPAN'`.** Every insert omitting `country` failed with a foreign
key violation; it presumably never fired because every writer sets the column.
`transform/10_drop_broken_sakes_country_default.sql` **drops** the default rather than correcting
it to `'JAPAN'`: `ItemActor` writes `country` explicitly (null unless supplied), so "no country
unless specified" is the code's real behaviour, and correcting the value would make a
never-executed branch start executing — a behaviour change disguised as a typo fix. If a default
country for sake is wanted, add it back as a product decision.

**B3 · Brand.** `BrandActor`, `BrandRegistryActor`. Accept: 50 concurrent `resolve("Same Name")`
produce one brand; the unique index remains as tripwire.

**B3 outcome (2026-09-09). Three §2.1 corrections:**
- **`BrandActor` has no `Visibility:` line**, unlike Cellar/Item/TierList. B3 read the absence of an
  owner column plus §1.6's catalog note as **any signed-in viewer; anonymous refused**. That is a
  design call the plan never made explicitly — it is now the rule for catalog aggregates.
- **Brand has zero outbox usage.** The B-section preamble's blanket "outbox side effects wired"
  does not apply to every aggregate.
- **The existing unique index is `lower(name)`, not `lower(trim(name))`** as §2.1's prose says
  (`1773700000000_brands_dedup_and_unique_name_index`). `BrandActor` always stores `name.trim()`,
  which keeps the two equivalent for every row it writes — but the index is the weaker one.
- Note for B2: `BrandRegistryActor.resolve` is naturally idempotent (find-or-create by name), so a
  redelivered `ItemOnboardingActor.confirm` needs no extra idempotency handling. Build the actor id
  with `normalizeBrandName()` from `@cellar-assistant/contracts`, not your own lowercasing.

**B4 · User.** `UserActor`. Accept: friend acceptance completes across two actors through the
outbox with the second call failing once; `removeFriend` removes both rows eventually; visit count
is computed server-side; no method in `UserActor` awaits an AI or external HTTP call (lint or test).

**B4 outcome (2026-09-09). Five corrections, two of them structural:**
- **§2.1 is missing a system method.** `rejectFriendRequest` cannot work as listed:
  `friend_requests.user_id` is the *requester*, so a recipient declining may not delete the row.
  B4 added `withdrawFriendRequest(system)`, mirroring `removeFriendOtherSide`. Cancel (by the
  requester) is one turn; decline (by the recipient) goes through the outbox.
- **§1.7's `confirmFriendship(system, recipientId)` cannot take a bare id.** `enqueueOutbox` types
  `payload` as `Record<string, unknown>` and `OutboxActor.deliver` invokes exactly
  `method(systemCtx, payload)`. The real signature is `confirmFriendship(ctx, { friendId, requestId })`.
- **"Loads: the above for this user" is wrong for `friends`.** Writing is strictly one-sided, but
  *reading* matches either direction — and that asymmetry is load-bearing: between the two calls of
  an acceptance only one row exists, so a one-directional read would flicker "not friends" for the
  width of the outbox window.
- **Schema gap (not a plan error): `item_favorites` has unique constraints on
  `(user_id, {wine,beer,spirit,coffee}_id)` but none for sake or tea.** "Idempotent on a unique
  constraint" is therefore unavailable for two of the six types; `UserActor` compensates with a
  turn-serialised read-then-write, safe only because every row it touches has `user_id = this.key`.
  **Recommend adding the two missing constraints in the A3 transform** rather than carrying the
  asymmetry into the new database. *(Done: `packages/db/transform/08_item_favorites_missing_uniques.sql`;
  `packages/db/README.md`, "Hand-edit 5 … retired".)*
- **`updateProfile` "proxies to better-auth's API" is not implementable as written.**
  `auth.api.updateUser` is session-shaped (cookie/bearer), which an actor turn does not have, and
  calling it would put an HTTP hop inside a `UserActor` turn — which §8.5 forbids. Implemented as a
  storage-level proxy over better-auth's `user` table; `role`/`disabled`/`emailVerified` are not
  writable through it.
- **`friend_request_status = 'ACCEPTED'` is now written by nothing** (the request is deleted on
  acceptance, matching today's behaviour). §4 still keeps the enum; E1 should decide if it survives.
- **Operational note for E3 and every later agent:** after registering a new actor type, the
  **sidecar** must be restarted, not just the app — otherwise placement returns
  `did not find address for actor '<Type>/<id>'`.

**B5 · Place.** `PlaceActor`, `PlaceCreationActor`, `GooglePlacesActor`, `BudgetActor` (B9 can be
folded in). Accept: two concurrent creations of the same place name at the same location yield one
place; enrichment is one transaction plus file writes via `FileActor`; budget denial is atomic
(concurrent reserves never overspend in a test).

**B5 outcome (2026-09-09). Five corrections, one of them a latent bug:**
- **`Promise.all` does not actually prove concurrency here, and B3's test may be weaker than it
  looked.** B5 measured it: with a naive `Promise.all` the connection pool serialises enough that
  the winner commits before the others start, so **0 collisions in 3 runs** — the test passes
  without ever exercising the contended path. Barrier-releasing the inserts produced the real
  result: 7 of 8 converged via `places_pkey`. **B3b re-proves the brand registry the same way.**
- **The idempotency key must short-circuit *before* the duplicate check, and nothing said so.**
  Real bug: the row committed by attempt 1 sits 0m away at similarity 1.0, so a retried submit is
  refused as a duplicate **of itself**. `createPlace` now returns the existing row first and
  excludes its own `placeId` from the candidate list.
- **The old rate-limit check failed open** — a failed count allowed the creation. Now propagates.
  Failing open on the one check that stops bulk abuse is the wrong default. `BudgetActor` likewise
  **fails closed**: with no `api_budget_config` row every enrichment returns `budget_denied` and
  never calls Google.
- **§2.1's `reserve → allowed/denied` and §8.3's `BudgetExceeded` cannot be the same method.**
  `PlaceActor` needs the union (a denial means "skip the optional photo"); a caller whose entire
  answer was the unaffordable thing needs the throw. Added `reserveOrThrow` rather than changing
  `reserve`.
- **`api_usage_log.entity_id` / `.triggered_by` are `uuid`**, and a non-uuid previously reached
  Postgres as an unmapped 500. Now a `ValidationError`, with a regression test.
- **`google_place_id` has no path from a request at all** — absent from `CreatePlaceInput`,
  `CreateUserPlaceInput` and the GraphQL input. A collision is returned as a *payload* naming the
  incumbent, not an error, because two rows resolving to one Google id means they are duplicates and
  merging is C1's call. The unique indexes stay as the tripwire; a race through them becomes
  `ConflictError`, never a 500.
- **Production needs:** `GOOGLE_PLACES_API_KEY` on the actors container (Places API (New); the
  client sends `X-Goog-Api-Key`, not the old service account), and `api_budget_config` rows for
  `google_places` × `{text_search, place_details, photo}` via `BudgetActor.setBudget`.
- **`Place` cannot be a DataLoader** without editing B7's file (the ref must come from
  `loadableObjectRef`). A per-request memo is used instead; the swap is mechanical and documented.

**B3b outcome (2026-09-09) — the suspicion was wrong, and measuring beat assuming.**
B5 found *its* `Promise.all` shape produced 0 collisions in 3 runs, and the reasonable inference was
that B3's brand test had the same weakness. Instrumented, it did not: B3's original bare
`Promise.all` showed **9 real collisions out of the 10 attempts that reached the INSERT, in every
one of 6 runs.** The difference is pre-work — `BrandRegistryActor.resolve()` does almost nothing
before its INSERT, while `createPlace` does enough that the pool serialises the winner home first.
The barrier was still adopted, because it makes the result deterministic and pool-size-independent
rather than incidental; the test now documents both measurements. Final barriered run: 7 of 8
converged.

**No other test in `services/actors` claims concurrency from a bare `Promise.all`.** Every other use is
parallel setup or reads inside `withTestDb`; `tier-list-actor.test.ts` is explicit that its
"concurrent reorder" cases are sequential turns.

**B6 · Recipe + RecipeGroup.** Accept: voting recomputes the canonical recipe in-turn and the
PL/pgSQL trigger is gone; `recipe_summary` view replaced by `ingredientCount` on the type.

**B6 outcome (2026-09-09). Phase B complete.**
- **The `recipe_reviews` / `recipe_votes` gap (§7) is closed** with B2's `item_reviews` rule
  verbatim: insert = any signed-in user, update/delete = author only, select = any signed-in user.
  Copying an existing decision beat inventing a second one. `recipe_votes` is enforced *by
  construction* — `vote`/`removeVote` address `(recipeId, ctx.viewerId)` and no method accepts a
  user id or vote id, so another user's vote is unnameable. Two tightenings: a vote must be on a
  recipe **in this group** (today any recipe id works), and creator-only writes refuse everyone but
  an admin when `created_by_id` is null.
- **§2.1 lists `addReview` but no `updateReview`/`deleteReview`**, which makes its own acceptance
  criterion unprovable. Both added, plus `RecipeGroupActor.removeVote` (§7's gap is about deleting a
  vote as much as casting one) and `RecipeGroupActor.update`. No `delete` on either actor — flagged,
  not invented.
- **Vote counts are never incremented; the canonical is recomputed from rows**, so redelivery has
  nothing to double.
- **§8.5 gains a sixth synchronous entity→entity edge, deliberately:** `RecipeActor` →
  `ItemActor.createGeneric`. Justified because it is one `INSERT ... ON CONFLICT DO NOTHING` with no
  external call that cannot cycle back, and routing it through the outbox would stop the ingredient
  row committing in the same transaction as its FK target's existence. A static test pins the
  sidecar target list to `{ItemActor, EmbeddingActor}` so a seventh cannot appear silently.
  **Verified 2026-09-18 by the E-series architecture review, with one clarification:** the test is
  real but it is a *bespoke per-actor pin*
  (`services/actors/src/actors/recipe-actor.test.ts`, "reaches exactly ItemActor and EmbeddingActor
  through the sidecar"), not an entry in `no-external-calls.test.ts`'s `GUARDED` list — so grepping
  for `sidecarTargets` will not find it. It guards this actor and only this actor; the general
  whole-graph gap is `e4-decisions.md` decision 9.
  **Ratify or overrule.**
- **Neither actor has a `Visibility:` line**; B3's catalog rule was applied, which matches today's
  Hasura `select` filter `{}` on both tables exactly. Same open ratification as `ItemActor`.
- **For E1:** every recipe table carries a `BEFORE UPDATE ... update_updated_at_column()` trigger
  that rewrites `updated_at` to `now()`, so an `UPDATE` cannot move a timestamp backwards. Decide
  whether these survive alongside `set_current_timestamp_updated_at`.
- The embedding text is a lean port of `functions/generateRecipeVector/_embedding-generator.ts`,
  minus its keyword-expansion tables, which are search tuning and belong to C1.

**B10 outcome (2026-09-09). Two violations found in seventeen actors, both fixed with a
regression test verified to fail without the fix:**
- **`BrandRegistryActor.resolve()` trusted a `brands` row cached at activation, forever** — and
  `brands` is `BrandActor`'s table. A brand created by `BrandActor` after the registry activated was
  invisible to it. Now reloads at the top of `resolve()`.
- **`BarcodeActor` cached its linked-items list**, derived from `wines.barcode_code` and friends,
  which `ItemActor` owns. It backed both `get()` and `linkItem`'s idempotency check. Split into an
  aggregate holding only `barcodes` plus a snapshot that reads linked items fresh every call.
- `ReferenceDataActor`'s blanket caching is confirmed correct — nothing writes those tables at
  runtime (§1.1).
- **One caveat the rule cannot express.** `UserActor` caches the *other side* of `friends` and
  `friend_requests` — rows written by a different actor **key** of the same class, e.g.
  `UserActor(bob)` writing `friends(bob, alice)`. That passes the table-level rule, because
  `UserActor` is the sole writer class, but it is the same staleness shape at instance granularity,
  and `TABLE_WRITERS` has no way to say so. Left as-is and documented in the module; revisit if it
  ever bites.

**B7 · TierList.** Accept: `reorderBand` is one transaction; insights enqueue on content change
only; three-viewer tests.

**B7 outcome (2026-09-09). §2.1 gaps it had to resolve:**
- **No writer split was specified.** Resolved as **creator-only** (confirmed against `policy.ts`'s
  own documentation). Unlike `CellarActor`, tier lists have no co-owner branch at all.
- **`delete` behaviour was unspecified.** Resolved as **CASCADE**, deliberately unlike B1's
  `CellarActor.delete`, which refuses a non-empty cellar: tier-list items are small and curated,
  cellar contents are not.
- **`reorderBand`'s cross-band contract was not spelled out.** Defined as: `orderedIds` is the
  band's *full* membership, and a stale omission raises `ValidationError`.
- **No `updateItem` / `setNotes` method exists** in §2.1. Flagged rather than invented.
- **Items and places share the aggregate.** `TierListEntryRef` widens `ItemRef` with `"PLACE"`.
  In GraphQL, `TierListItem` carries `entryType` plus two nullable siblings (`item: Item`,
  `place: Place`) rather than a union — `Item` is an interface and cannot be a union member.
  **`Place` is a deliberate one-field stub for B5 to extend, not replace.**
- **Outbox: yes.** `addItem`/`removeItem`/`reorderBand` bump `content_updated_at` and enqueue a
  self-targeted `generateInsights` in the same transaction (throttled at 24h / fewer than 3 items);
  `update` does neither, matching the old trigger's scope. The AI call sits behind an injected seam
  that **throws loudly by default** rather than faking success, because `services/actors` has no AI
  provider library yet.
- **Concurrency proof worth reusing:** two turns on one activation renumber cleanly, while two
  *stale* activations produce a duplicate position (`0,0,1`). That is the negative result — it shows
  `reorderBand`'s lock-free design is safe **only** because Dapr's placement guarantee forbids that
  scenario, not because the code defends against it.

**B8 · MenuScan.** Accept: an upload → `create` → `process` → `match` chain completes through
the outbox; retries are idempotent (a re-delivered `process` does not duplicate menu items).

**B8 outcome (2026-09-09). Phase B complete.**
- **§2.1 puts the vector match on `MenuScanActor.match`, which §8.5 forbids** (entity→search), and the
  outbox is one-way so it cannot carry an answer back. A resolver hop was not available either,
  because matching is triggered by extraction completing, not by a request. Resolution: **`match`
  schedules a job.** `MenuMatchJobActor` sits on §8.5's `job → entity / registry / search` edge, so it
  may call `ItemSearchActor`/`RecipeSearchActor` *and* call `MenuScanActor.recordSuggestions` back.
  A parse-based test pins it: `menu-scan-actor.ts` makes zero `invokeActorMethod` calls.
  **§2.1 should say `match` schedules the job, and §8.5's job-edge list should name
  `job → MenuScanActor.recordSuggestions` explicitly.**
- **§2.1 lists no method that can store a match**, so `recordSuggestions` was added (§1.2 makes
  `MenuScanActor` the only writer of `item_match_suggestions`), plus `suggestions(page)`.
- **Scalar-argument methods again — the fifth workstream to hit it.** `create(fileId, placeHint)`,
  `process` and `match` all had to become object-taking.
- **The scanner's item types do not fit the schema.** `place_menu_items.detected_item_type` allows
  only `wine|beer|spirit|coffee|unknown`, but the scanner produces `sake`, `tea` and `cocktail`. B8
  writes `unknown` and carries the real type in `extracted_attributes.scanItemType`. That is a
  lossy workaround for a schema behind its own pipeline — same family as the `item_favorites`
  sake/tea omission. **B8b** widens it. *(Done — §6.0's B8b row.)*
- **An acceptance cannot always be propagated.** `place_menu_items` has FK columns only for
  wine/beer/spirit/coffee, so a `SAKE`, `TEA` or recipe acceptance is recorded on
  `item_match_suggestions` and stops there. `menu_item_recipes` is listed under `PlaceActor` in §2.1
  but **no method writes it** — that is the missing home for an accepted cocktail. **B8b.**
  *(The sake/tea half is closed: `e5d19b69`, migration
  `20260928043553_place_menu_items_sake_tea_matches`, adds `sake_id`/`tea_id`, and
  `PlaceActor.verifyMenuItemMatch` writes whichever of the six the match names. The recipe half is
  B8c, done at `a88a5db3`.)*
- **`verifyMenuItemMatch` is delivered as `system`**, so `place_menu_items.match_verified_by` lands
  null; the real user is on `item_match_suggestions.acted_by`.
- **`create` does not call `FileActor.verify`** — the FK to `public.files` is the only check
  (translated to `NotFound`, not a 500). Add a verify hop if unverified uploads must be refused.
- **§2.1 has no way to set `manual_place_override`, and no `delete`/`reprocess` for a scan.**
  Flagged, not invented.

**§2.1 vs §2.2 on `/discoveries` — SETTLED for C3 (2026-09-09).** §2.1 says a menu scan is
**owner-only**; §2.2 describes `MatchSuggestionsCollectionActor` as serving `/discoveries` from
"places the viewer has interacted with", i.e. **other people's scans**. B8 enforced §2.1.
**C3 follows it: `/discoveries` shows the viewer's own pending suggestions from their own scans.**
The §2.2 wording was mine and it was wrong — surfacing suggestions derived from someone else's scan
is the same class of leak as the cellar-oracle B1 refused and the tier-list filter C1 closed, and
the visit-interaction join does not make it safe. Note `/discoveries` is already broken on the
current stack (`DiscoveryDashboard.tsx` carries a TODO saying its queries do not match the schema),
and D5 was always scoped as a rewrite, so nothing working is being taken away.

**B8b · Widen the menu-item type and home the cocktails.** Two halves: widen
`place_menu_items.detected_item_type`'s CHECK to the types the scanner actually emits, and update
`MenuScanActor` to stop writing `unknown` with the truth hidden in JSONB; then give an accepted
cocktail a real home via `menu_item_recipes` (owned by `PlaceActor`, currently written by nothing).
Accept: a scanned sake, tea and cocktail each round-trip with their real type, and accepting a
cocktail match writes a `menu_item_recipes` row.

**B9 · Budget.** Accept: see B5.

### C — Read side

**C1 · Search actors.** All of §2.3. Accept: identical inputs hit one activation (log assertion);
viewer id changes the key only for the three identity-sensitive actors; `PlaceSearchActor` calls
the SQL function with weights passed as arguments and no weights remain in SQL; idle eviction at
5 minutes observed.

**C1 outcome (2026-09-09). The §7 map gap is closed and phase C's read side has begun.**
- **The gap was proven closed by first reproducing it.** `place-search-sql.test.ts` asserts the
  ported SQL, ungated, has the legacy visibility defect (details withheld until the legacy stack
  is retired), and then that the gate closes it across PRIVATE/FRIENDS/PUBLIC. A static fence keeps
  `search_places_adaptive_cluster` and `search_places_hybrid` named in one module only, **so C2's
  `MapActor` inherits the gate rather than re-opening it.** The visit filter reads the viewer's own
  interactions, never a supplied id.
- **§2.3 and §1.5 contradicted each other on `PlaceSearchActor`.** The §2.3 table says viewer-in-hash
  "no"; §1.5 says map browse *with tier-list or visit filters* is identity-sensitive, and
  `search_places_hybrid` takes `tier_list_ids`. Resolved per §1.5 (conditional) — an unconditional
  "no" would re-open §7 one layer above the SQL.
- **§2.1's "`findDuplicates` will delegate to `DuplicatePlaceSearchActor`" is unimplementable** —
  §8.5 forbids entity→search. Done at the resolver instead. *(Since `291bcb97`
  `PlaceCreationActor` is keyed per creator, so it is no longer a lock across users: the
  cross-user duplicate check runs inside `PlaceActor.create`'s transaction under geocell advisory
  locks — `docs/architecture/actor-keys.md`, Decision 1.)*
- **§2.3's "charges via `BudgetActor`" collides with §1.6.** `reserve` is system/admin-only and a
  search actor may not mint a `system` ctx (`system-ctx.test.ts` caught the first attempt). Added
  `BudgetActor.reserveForSearch`: allow-listed `(service, endpoint)` pairs, **cost taken from the
  list rather than the caller**, `triggeredBy` forced to the viewer.
- **§8.5's per-type idle timeouts are not implementable.** The plan asks for 5m on search actors and
  24h on `GeocodeActor`, but `@dapr/dapr` exposes `actorIdleTimeout` as **one global** (currently
  10m). Left global. **This needs a plan decision** — either accept one timeout for every actor, or
  find a per-type mechanism before relying on the §2.3 eviction behaviour.
- **§8.5 should gain search→`EmbeddingActor`** to its sanctioned list; item, place and recipe search
  all need it. Acyclic and reentrancy-off, so it is safe — just undocumented.
- **Fixture traps for C2/C3/E2:** `places.primary_category` is `GENERATED ALWAYS` and
  `places.search_text` is trigger-filled — a fixture must write neither. Drizzle's `sql` flattens a
  JS array into one parameter each, so every `text[]`/`uuid[]` argument must be a `{...}` literal.
- **What the ranking tests prove, and what they do not.** They pin the *formula*: distance ordering
  is total and deterministically tie-broken (offset cursors depend on it), and the hybrid weights
  the SQL actually applies are the ones `PLACE_SEARCH_WEIGHTS` declares, read back via
  `pg_get_functiondef`. They do **not** show ranking is good at scale — every fixture is 3–5 rows and
  index selection is untested. E2 owes golden flows for map browse at real zoom (clustering
  thresholds never fire on these fixtures), semantic map search against seeded `category_vectors`,
  and the create-place duplicate warning against real Overture data.

**C2 · View actors.** `MapActor`, `RankingsActor`. Accept: map filters honour tier-list
visibility (closes a legacy defect; details withheld until the legacy stack is retired); the map
projection contains no field the map doesn't render; `RankingsActor` with `scope: friends`
matches the old `item_scores` output for a fixture reviewer set, and a client cannot supply an
arbitrary reviewer list.

**C2 outcome (2026-09-09). The `reviewers` gap is closed by making it unrepresentable.**
`RankingsInput` has **no uuid-array field at all** — the client names a `scope`
(`EVERYONE | ME | FRIENDS | ME_AND_FRIENDS`, exactly the four states the two-button UI can be in)
and the actor resolves it from `ctx.viewerId` and the viewer's own `friends` rows. The reasoning
is worth keeping: reviews are **not** secret (`public_item_reviews.yaml` grants role `user`
`filter: {}` with `user_id` selectable and aggregations allowed, so any signed-in user can already
derive an arbitrary reviewer-set average today) — but `public_friends.yaml` gates `friends` to rows
touching the viewer, so **the social graph is not public**, and a client-supplied reviewer array is
a targeted profiling primitive over a graph the viewer cannot read. An enum leaves nothing to
smuggle; a validator would have to be re-derived at every call site, a type cannot be.

**A third facet of §7's rankings gap, which nobody had recorded:** today's client sends `{}` for
"Friends Scores" when you have no friends, and `item_scores`' `cardinality = 0` branch turns that
into **everyone** — a denied filter silently widening the answer, the same trap the map guards.
`FRIENDS` with no friends now returns `[]`.

**Other corrections:**
- **§1.1 and §1.3 contradicted each other for view actors.** §1.1's cache column says "screen-shaped
  projection"; §1.3 says an actor may cache only tables it writes, and a view actor writes nothing.
  Resolved: **the projection is a paging buffer, not a read cache.** A fresh request (`after ===
  null`, or `all()`) always re-queries; the buffer only continues a page-walk the same activation
  started, which is the only thing that makes an offset cursor mean anything. §1.1 should say so.
- **"Keyed by viewer id" never said the caller must *be* that viewer**, and Dapr will happily route
  viewer B's request to `MapActor(A)`. `ViewActorBase` now enforces `ctx.viewerId === this.key`
  every turn. Deliberate narrowing: **an `admin` ctx cannot address another viewer's view actor** —
  §1.6's `bypassesPolicy` is about seeing rows a policy hides, not about becoming someone else, and
  a per-viewer projection addressed under another id would be cached under it. Admin impersonation,
  if ever wanted, needs its own decision.
- **§2.4's map projection list is wrong in both directions.** It omits `categories` (plural — marker
  colour comes from the whole array), `confidence` and `isVerified`, all three inputs to the
  marker-quality score; dropping them would move a *rendering* decision server-side. And "cluster
  flags" over-promises: `viewport_area_km2`, `density_per_km2` and `clustering_applied` reach
  `PlaceResult` and are read by **no component at all**, so a cluster needs only id, count, centre.
  Final projection: nine place fields of the SQL's 27, three for a cluster.
- **§2.4's `RankingsActor` reviewer sets are under-specified** — it says "everyone or viewer +
  friends"; the live UI has four states and an item-type filter §2.4 never mentions. Both implemented.
- **§8.5 never says what a *view* actor may call.** Both of C2's call no other actor — they read
  tables directly per §1.1 — and §8.5 should state that so a later change cannot quietly add an edge.

**C1b · Fix `ClusteredPlaceRow`.** C2 found the type in C1's `place-search-sql.ts` lies:
`ClusteredPlaceRow = HybridPlaceRow & {...}` declares `text_rank`, `trigram_similarity`,
`category_score` and `combined_score`, none of which `search_places_adaptive_cluster` returns, and
omits `postcode`, `country_code`, `phone`, `website`, `email`, `hours` and `cluster_bounds`, which
it does. Harmless today — `MapActor` reads none of the four phantom fields — but the next reader
will trust it. Accept: the type matches `pg_get_functiondef`'s actual return columns, checked by a
test rather than by eye.

**C3 · Collection actors.** All of §2.2. Accept: each declares ids vs projection in its contract;
DataLoader batches id resolution into parallel actor calls (assert call count = page size, not
page size × relations).

**C3 outcome (2026-09-09). Phase C complete. Four corrections, two of them structural:**
- **"Ids" is unimplementable for two of the nine collections.** `check_ins` and
  `item_match_suggestions` have **no actor addressable by their own id** — `CellarActor` is keyed by
  *cellar*, `MenuScanActor` by *scan*. So §1.5's rule needs a third case: **projection when the row
  has no entity actor**, not only when the list is a high-cardinality catalog.
- **§2.2's keyless `RecipeGroupsCollectionActor()` / `BrandsCollectionActor()` contradict §1.5.** A
  keyless collection actor is a true singleton, i.e. **a global serialization point for `/recipes`
  and `/brands`.** Both are keyed by `searchHash(filter)` instead, with a per-turn key/input check.
- **§1.1's cache column for collections is "none".** C2 read §1.1+§1.3 as a paging buffer, but for a
  collection that would be an unbounded read — `/brands` and `/recipes` have no 50–500 SQL cap the
  search actors rely on. C3 uses `keysetPage` (it is `page.ts`'s first caller), so §1.5's
  authorize-before-the-cache rule is satisfied by there being no cache.
- **§2.2's `/cellars` scope is narrower than today's behaviour** — "mine, co-owned, friends' visible"
  omits a stranger's PUBLIC cellar, which `public_cellars.yaml` grants and `/cellars` renders now.
  Implemented as full `canSeeCellar` (a superset); narrowing it is a **D2 product call**, not a
  security one.
- **§8.5 still never says what a *collection* actor may call** — the same gap C2 flagged for view
  actors. All nine call no actor at all; the plan should say so.
- **B4 overlap resolved in C3's favour:** `myFriends`/`myFriendRequests` now go through
  `FriendsCollectionActor`. `UserActor.friends`/`friendRequests` remain on the interface with no
  GraphQL caller — decide whether B4 keeps them.
- **`ItemCheckIn` deliberately drops `cellarItemId`.** Answering by *item* with a cellar-item id
  would hand a friend-of-a-drinker a row id inside a cellar they may not see — B1's oracle, one
  field smaller.

**Performance note for E2/E3 — the one real hot spot.** `UserActor.getProfile` is the only
DataLoader target that is *another person's* actor, and it also serializes that person's writes
(friend requests, favourites, place interactions). A 20-friend page touches 20 actors belonging to
20 different people: one batched round trip, not an N+1, but the one place where rendering a list
can queue behind someone else's mutation. Secondary: a cold `CellarActor` fan-out loads every
`cellar_items` row per cellar on activate, so a first `/cellars` paint is 20 full aggregate loads.

**C4 · Job actors.** All of §2.6. Accept: cancel mid-run stops at the next batch; a crash mid-batch
resumes from the persisted cursor; `RecipePhotoJobActor` creates recipe, items, and brands only
through their actors (single-writer test still green).

### D — Frontend

Each D workstream rewrites one page group against the new schema: queries as gql.tada documents
per page, mutations as domain commands with typed error unions, Relay pagination, no `where` DSL,
no `_aggregate`, no `on_conflict`. Delete the replaced server actions. **Never edit the schema
from a D workstream** — request the field from the owning B/C workstream.

**C4 outcome (2026-09-09). The recipe-photo job's owner-id defect is closed in the new stack, in depth.**
The attack was tested by calling the actor host **directly, past `services/api`**. Four independent
guards, each of which fails if the hole is reintroduced: a runtime refusal at `start`; a second at
delivery (a hand-edited `jobs.payload` is also refused); a behavioural test asserting every writer
call carries `ctx.viewerId === owner`; a parse-based test allowing only `ctx.viewerId` and
`job.createdBy` as property reads; **and a `@ts-expect-error` that breaks `pnpm typecheck` if
`RecipePhotoJobPayload` stops forbidding `userId`.** A job acts as the user who started it.

**Corrected 2026-09-11: "in depth" was true of `userId` and false of the surface.** The same
mutation's *file ids* carried a second defect of the same class, one field over from the hole those
five guards close — and the legacy action this replaces has the same shape, which is why the
specifics are held back here (target-stack.md §7). Found by measurement, not by inference.
`startRecipePhotoJob` now validates every file id it is handed before `super.start`, with the list
capped at ten because each check is a sidecar hop inside a user-facing mutation turn.

**This was the third of four instances of one defect class**, and the class is worth naming because
each instance hid differently. The rule the file design rests on is "never trust the client's
done": a `files` row exists the moment an upload target is minted, and `files.verified_at` is the
only server-side fact that the bytes arrived. Four call sites took a client-supplied file id and
consulted none of them — `createMenuScan`, `attachItemImage`, `startRecipePhotoJob`, and
`ItemOnboardingActor.start`. **Two successive column-based sweeps found only the first two**, because
a recipe-photo file id is never stored in a column at all: it lives in `jobs.payload` as JSON. The
sweep that closed the class crossed four independent axes — every FK into `files.id`, every
file-id-shaped field in `packages/contracts`, every file-id-shaped input in `services/api/src/schema`,
and every `FileActor` call site — and only agreed once all four matched.

**Two things §2.6 got wrong, one of which leaves real work unbuilt:**
- **`refreshPlaces` is not a Google refresh.** It is `DELETE FROM places` followed by a keyset walk
  of a **BigQuery Overture Maps** table, upserted on `places_overture_id_key` — no staleness
  predicate, no Google call, no budget check anywhere. C4 built the job B5 had pre-wired
  (`PlaceActor.refreshFromSource`: staleness-driven, budget-aware, **non-destructive**), which is a
  different thing and a better one. **The Overture bulk reload is unbuilt — C4b.**
- **"Creates recipes, items, and brands through their actors" is half-unimplementable.**
  `wines`/`beers`/`spirits`/`coffees` all have `item_onboarding_id NOT NULL`, so a recipe photo can
  never create a *specific* item, and `generic_items` has no brand column, so a brand row here would
  reference nothing. The port **matches** specific items via `ItemSearchActor` and creates only
  generic items. Strictly better than the old path, which wrote a `wines` row per "2 oz red wine"
  and — because its mutation variables did not match its signatures — silently dropped style,
  variety, country and the brand link anyway.

**Two latent bugs in the old code, fixed on the way across:** the onboarding cursor was
`created_at`-only, which is **not unique**, so rows were silently skipped at batch boundaries (now
`(created_at, id)`, with a test seeding four rows sharing one timestamp); and a `failed` job was
flipped back to `processing`, so a poison row cycled forever (now counted, cursor advances past it).

**`MaintenanceActor` stays a plain `ActorBase`** — §2.6 listing it under job actors is a plan error,
and A5, A8 and C4 all independently agreed. It gained **`reportDeadLetters`**, hourly rather than
daily because §1.4 dead-letters roughly 40 minutes after first failure, and deliberately on a
**separate chain from the 24h reap so a failing reap cannot silence the report that would tell you.**
It reports and never re-drives a dead row.

**C4b · Overture bulk reload.** Needs a BigQuery seam and a bulk-upsert method on `PlaceActor`
(keyset walk, upsert on `places_overture_id_key`). Note the old service factory **fell back to a
Wisconsin JSON mock silently in production** when GCP credentials were absent — the new seam must
throw instead. `functions/refreshPlaces/_services/` is therefore **not** replaced yet and D9 must
not delete it. Accept: a reload runs from a cursor, is non-destructive, and refuses to start
unconfigured.

**C4c · Hoist `derivedUuid`.** The same SHA-256-truncated deterministic-uuid helper now exists in
three actor modules. Actor modules **cannot import each other** without breaking the §1.2
containment test, so shared helpers belong in `services/actors/src/lib/`. C1 flagged the same pattern.

**D1 · Auth + client.** better-auth client, URQL auth exchange fetching JWTs, Next route handlers
proxying `/graphql` and `/api/auth/*` to Loki, `(authenticated)` layout on better-auth sessions.
**Server components** (`makeServerClient`) need a JWT too: exchange the forwarded session cookie
for a token at `/api/auth/token` once per request (React `cache()`), then call GraphQL with it.
`/sign-in`, `/sign-up`; `/~offline` is untouched.
Accept: sign-in, sign-up, OAuth, sign-out, a protected page, and a server-rendered page all work
against compose; no `@nhost/*` import remains in `src/lib`.

**D1 outcome (2026-09-09). Built as a second lane beside the live Nhost one; D9 flips it.**
`src/lib/api/*` + `/api/graphql-next` (Loki) sits beside `src/lib/urql/*` + `/api/graphql`
(Hasura): separate providers, separate gql.tada instances, separate cookies. Only three tracked
files changed — `package.json` (a test script), `tsconfig.json` (`allowImportingTsExtensions`), and
`src/proxy.ts` (matcher only). Verified independently.

**Three things every later D workstream needs:**
- **Next 16 renamed the middleware and its matcher swallows `/api/*`.** `src/middleware.ts` is now
  **`src/proxy.ts`**, it gates on the *Nhost* cookie, and it matches everything — so it would have
  302'd every better-auth request to `/sign-in` before the handler ran. **Any D workstream adding a
  route under `/api/` must add it to that matcher's exclusion list.**
- **The RSC token flow reads the raw `Cookie` header via `headers()`, not `cookies()`**, because the
  better-auth session token is percent-encoded and a decode/re-encode round trip is not guaranteed
  lossless. It calls `GET /api/auth/token` on the actors app **server-to-server**, not through its
  own proxy. `cache()` makes it one exchange per request, and **`cache: "no-store"` is asserted by a
  test**: every viewer requests the same URL and differs only by `Cookie`, so a URL-keyed cache
  would hand one viewer another viewer's token. Do not "optimise" that away.
- **`/sign-in` and `/sign-up` were deliberately not rewritten** — they serve the live Nhost app. The
  client hooks are ready; **D2** does it alongside the provider swap.

**A production landmine for E3, found now rather than at cutover.** A6 sets
`BETTER_AUTH_URL=http://localhost:3002`, so **OAuth callbacks land on the actors app and bypass the
Next proxy entirely.** That works locally only because cookies ignore ports. In production
`BETTER_AUTH_URL` must be the **public Next origin** — **and `services/api`'s
`AUTH_ISSUER`/`AUTH_AUDIENCE`, which default to `http://localhost:3002`, must change to match, or
every token fails verification.** Those three values move together or auth breaks. Also,
better-auth resolves a relative `callbackURL` against its own `baseURL`, so the client sends
absolute ones.

**Note:** `better-auth` is not a root dependency. (This was written while `sharedWorkspaceLockfile` was false; R1 set it to true, so there is now one lockfile at the root.) Adding
it needs a root `pnpm install`. D1 hand-wrote a client shaped exactly like `createAuthClient()`;
swapping in the real one is a single file.

**D8 outcome (2026-09-09). It found a live bug that B10 had predicted and deferred.**
- **`UserActor`'s cached friendship goes permanently stale.** `removeFriend` reads both directions
  and `reload()`s **immediately**, before the outbox has delivered `removeFriendOtherSide` and
  deleted the reverse row — so the actor reloads the row that is about to vanish and keeps
  believing the friendship exists until it reactivates. Reproduced live: with the database at **0
  rows**, `sendFriendRequest` still answered *"you are already friends"* while `myFriends` (served
  by `FriendsCollectionActor`, which queries fresh) correctly showed none. **Two read paths
  disagreeing indefinitely.** This is exactly the instance-granularity case B10 flagged and left:
  §1.3's rule is really about **rows the actor writes**, and the table-level wording was a
  convenient approximation. **B4b** fixes it.
- **Three `ConflictError` cases share one `code`**, so the frontend substring-matches on prose to
  tell "already friends" from "they already sent you a request" — and the latter drives an
  "Accept their request" button. A stable `reason` discriminator is part of **B4b**.
- `FriendRequestConnection.totalCount` returns `null` despite its description claiming it is cheap
  to count.
- **Deviation worth noting:** D8 deleted `src/components/friend/actions.ts` and
  `src/app/actions/users.ts`, and rewrote its components in place, although the brief said the old
  Nhost lane stays until D9. Verified safe — typecheck is at the 32-error baseline and nothing
  imported either file — but D9's deletion list is now smaller than it thinks.
- Subscriptions are replaced by a **15s manual poll** (`reexecuteQuery` with
  `requestPolicy: "network-only"`), which is the pattern the other D workstreams should copy.
- **Left for D2/D9:** `(authenticated)/layout.tsx` still gates on the Nhost session, so a viewer
  with an Nhost session but no better-auth one passes the layout and then gets `me === null`. Both
  D8 pages show a "sign in again" notice rather than crashing.

**B4b · `UserActor` staleness + typed discriminator.** Make `UserActor` read the rows it does not
itself write — the reverse-direction `friends` and `friend_requests` — fresh per call, in the shape
B6 and B10's `BarcodeActor` used. **Preserve the deliberate two-directional read**: `isFriend`
matches either direction on purpose so the UI cannot flicker "not friends" during the outbox
window. Accept: a regression test that fails without the fix, where a change made by another actor
key is visible within one activation; plus a machine-readable `reason` on the friend-request
conflicts so no client parses English.

**D2 outcome (2026-09-09). Cellars and the auth pages are on the new lane.**
- **Two generated-artifact guards were red and nobody had noticed.** `packages/schema`'s
  `graphql-env.d.ts` was stale against `schema.graphql`, so gql.tada typed `myCellars` and `cellar`
  as `unknown` and the package's own `check-generated` guard was failing; and D1's
  `graphcache-keys.ts` predated C3, missing `CellarConnection`, `CellarEdge`, `ItemCheckIn*`,
  `TierList*`, `Brand*`, `MenuScan*` and `RecipeGroup*` — its own test was already red. Both
  regenerated and now green. **A generated file with a guard is only useful if the guard is run.**
- **gql.tada trap for every later D group:** a fragment spread into a union branch returns `never`
  from `readFragment` unless **the fragment itself selects `__typename`**.
- **Provider isolation is per route group.** D2 mounts `ApiUrqlProvider` on `/cellars`, and had to
  add **seven `layout.tsx` shims re-mounting the Hasura `UrqlProvider`** on the subtrees D3 owns —
  otherwise the group provider would send Hasura documents to `services/api`. D9 deletes all eight.
- **Stranger-public cellars: superset kept, page split** into "Your cellars" and "Shared with you".
  Narrowing is not implementable from the frontend — `myCellars` takes only pagination args, so
  client-side filtering would short-page a server connection and make "Load more" lie. A `scope:`
  argument would have to come from C3.
- **B1's check-in rule confirmed end to end:** a co-owner who is *not* a friend reads every
  check-in in the cellar, including the owner's.
- **Gaps in the API surface, for whoever owns them:** `Cellar.items` has **no type filter**, so the
  old page's item-type checkboxes have no successor (dropped rather than faked); `Cellar.checkIns`
  has no root field, so "show more" re-reads the cellar with a wider window; and `CheckIn` carries
  no drinker profile, costing one `user(id:)` per distinct id.
- **Same deviation as D8:** deleted `src/app/actions/cellars.ts` and three components despite the
  brief reserving removals for D9. Verified safe (typecheck at the 32 baseline, no importers).

**X3 · Give the test suites their own database.** The `services/actors` suite runs against the same
`cellar` database that agents smoke-test against live, and **that has now produced false failures
three times.** The auditor saw B8's outbox counts collide; B4b found three tests already red from a
committed `regenerateVector` row and a committed `removeFriendOtherSide` row; and after D2's live
cellar scenario, `reference-data-actor.test.ts` fails on `delete from wine_style` —
*"Key (value)=(RED) is still referenced from table wines"* — while `rankings-actor.test.ts` sees an
extra review row. Each was patched by scoping that particular assertion, which treats the symptom.
Some tests are inherently global (`ReferenceDataActor` legitimately deletes a whole reference
table), so scoping cannot fix them all.
Accept: `ACTORS_TEST_DATABASE_URL` points at a database the suite owns, built by
`packages/db/transform/run.sh`, created and dropped (or truncated) by the test setup; the full
suite is green while another process is actively writing to `cellar`; and CI builds it the same
way. **Do this before trusting any further suite result** — a red suite that everyone assumes is
contamination is how a real regression gets shipped.

**X3 outcome (2026-09-09). Isolated, and proved with a control.** The suites now build
`cellar_test` from a `cellar_test_template` (cloned per run, fingerprint-cached, and refusing any
database name outside `cellar_test*` so `cellar` and `auth_dev` are unreachable from it). The proof
is the control, not the pass: with a writer looping `INSERT ... COMMIT` into `cellar` throughout,
the suite is **662/662 green** against `cellar_test` and **3 failed** against `cellar` — the same
three failures, unchanged. **No assertion was weakened**: `reference-data-actor.test.ts` still
deletes the whole `wine_style` table and `rankings-actor.test.ts` still asserts exact aggregates.
Cold start ~2s, warm clone ~0.5s. `services/api` and the `packages/*` suites open no database at all;
the better-auth tests already owned per-file scratch databases.

**Two findings worth acting on:**
- **`transform/run.sh` alone does not produce a complete database.**
  `02_drop_phantom_result_tables.sql` drops the four search functions, and only the hand-written
  lane migrations put them back — so a dev database built by `run.sh` is missing them unless
  someone applies the lane by hand, which is how `cellar` itself got them
  (`drizzle.__drizzle_migrations` holds only the baseline row). **Fold the lane into `run.sh`.**
- **CI is green but is not running these tests.** `ACTORS_TEST_DB_OPTIONAL: "1"` is still set,
  because CI cannot build the database yet for two concrete reasons: there is no schema dump to
  transform (it needs a cached artifact or a checked-in baseline at `$DUMP`), and `postgres:18` has
  neither postgis nor pgvector (it needs a build of `infra/postgres`). **Until X4 lands, a green CI
  run says nothing about the 38 database-backed tests.**

**X4 · Make CI real.** Fix both reasons above and drop `ACTORS_TEST_DB_OPTIONAL`. Accept: CI builds
`cellar_test` and runs the full `services/actors` suite; `run.sh` alone yields a database with the four
search functions present.

**A7c · Close the API-surface gaps D3 found.** D3 built the item pages against the real schema and
hit a batch of boundary problems it could not fix from the frontend. In rough priority order:

1. **Silent data loss — fix this first.** Four `NOT NULL` columns are invisible at the GraphQL
   boundary and fail *inside the outbox*: `wines.style`, `wines.vintage`, `spirits.type`,
   `coffees.description`. A `confirmItemOnboarding` without them **succeeds**, the item never
   appears, and nobody sees the error — it dead-letters ~17 minutes later where only Grafana looks.
   D3 enforces them client-side, which is not a fix. Validate at the boundary so the caller gets a
   `ValidationError` naming the field.
2. **`FileActor` has no GraphQL surface at all** — no `createUploadTarget`, no `presignRead`, and
   `ItemImage` carries only `fileId`. So images can neither be uploaded nor **displayed**. A8 built
   the actor; nothing exposed it. (Separately, E3 still owes the externally routable endpoint —
   presigned URLs currently point at `http://minio:9000`.)
   **Closed by A7 and D10 (2026-09-10).** A7 gave `FileActor` its surface
   (`createUploadTarget`, `verifyUpload`, `Query.file`, `File.url`, `ItemImage.file`); E3a made the
   endpoint routable; D10 wired the browser path and proved it end to end. **The dangerous part was
   the gap between those.** A7 landed the mutation *after* `src/lib/api/files.ts` had hardcoded
   "services/api exposes no createUploadTarget mutation" into `describeUploadBlockers()`, and
   `ItemImages.tsx` rendered that list **instead of** the upload control — so image upload stayed
   dead in the UI on a premise that had stopped being true two workstreams earlier, with every gate
   green the whole time. The list is now computed from the schema and the build's CSP origins, and
   `src/lib/dev-checks/upload-surface.test.ts` fails if it goes stale again.
   **The general lesson, which cost a feature: a helper that hardcodes "X does not exist yet" is a
   time bomb.** It cannot fail a typecheck, no test covers a string, and the feature it gates
   silently stays off. D10 found four more of these, and the sweep for the rest became X11.
   **A7h (2026-09-10) closed the one that was a real gap rather than a stale comment:**
   `PlacePhoto` exposed `fileId` but no `file` relation, so place photos could not render at all.
   It now has `file: File` — **nullable**, unlike `ItemImage.file`, because a row can carry only a
   Google reference. A7h also settled the question underneath it: Google place photos are
   **mirrored into MinIO at enrichment time** (`PlaceActor.#fetchPhotos` stores the bytes through
   `FileActor` and only then inserts the row), so `googlePhotoName` is the dedupe key and never a
   client-fetched address — no CSP or `remotePatterns` entry for a Google host is needed. The
   pre-migration Nhost lane worked the same way, which `nhost/metadata/`'s `storage_file`
   relationship confirms. `FileActor.#requireReader` really does authorize the
   `place_google_photos` path, so the plan matched the code here and nothing was loosened.
3. **Six fields are writable but not readable:** `Wine.specialDesignation`,
   `Wine.vineyardDesignation`, `Sake.riceVariety`, `Sake.servingTemperature`, `Sake.vintage`,
   `Tea.cultivar` are in `*AttributesInput` and absent from the object type. Selecting one is a hard
   `GRAPHQL_VALIDATION_FAILED`, and **gql.tada types them `unknown` while tsc stays silent.**
4. **`Wine.style` is `String!` while `Beer.style`/`Spirit.style` are `String`** — graphql-js rejects
   the whole document even across mutually exclusive fragments. D3 aliased per type to work around
   it. Make the nullability consistent.
5. **`LinkedBarcodeItem` exposes `item`, not `itemId`/`itemType`** — the same silent-`unknown` trap.
6. **The page-size cap of 100 surfaces badly:** its `ValidationError` arrives as a top-level
   `INTERNAL_SERVER_ERROR` with `data: null` on direct-result fields, so **one over-large alias
   takes the other nine down**. `country` has 197 rows and needs two pages.
7. **No root field lists items of a type** (`itemSearch` needs text or a vector), and there is **no
   "is this favourited" field** — the star's initial state is currently membership in
   `me.favorites(first: 100)`.

Accept: each of the seven is closed or explicitly declined with a reason; the silent-failure path
in (1) has a test proving the caller now sees the error.

**D6 outcome (2026-09-09). Recipes are on the new lane, and the AI-blocked paths degrade well.**
`recipeSearch(semanticQuery:)` fails with "no embedding provider wired", so the panel **re-runs the
same words as a keyword search automatically** and shows a neutral notice — never a blank list.
`/recipes/ai-generator` renders an explicit "not available yet" page naming both blockers rather
than an upload control that cannot succeed. **B6's review rule proved live:** editing or deleting
another user's review returns `ForbiddenError`, a second review returns `ConflictError`.
D6 also **declined to delete** §9's dead components despite confirming zero importers, correctly
reading removals as D9's — note that D2 and D8 both deleted in the same situation.

**A7d · Recipe API gaps and systemic connection defects.** Split from A7c because A7c was already
running. Two of these are **systemic, not recipe-specific**:

1. **`totalCount` returns `null`** on `RecipeGroupConnection` and `FriendRequestConnection` (D8 hit
   it first), despite the field's own description claiming it is cheap to count. Every index page
   therefore shows "N shown" instead of "N of M". Fix it across connections or remove the field.
2. **The undocumented `first` cap of 100 escapes untyped.** A `ValidationError` thrown inside a
   plain connection field arrives as `{"message":"Unexpected error."}` with `data: null` rather
   than as a union member — D3 and D6 both hit it, and D3 found one over-large alias takes the
   other nine down with it. Shared with A7c item (6); whoever gets there first owns it.
3. **`/recipes/ai-generator` has no API surface at all.** §6 says it drives `RecipePhotoJobActor`,
   C4 built that actor, and **nothing exposes it** — no `createRecipeScan`, no job type to poll.
   Independent of X1.
4. **`RecipeVersions` pages every vote row and tallies client-side**, because `netScore` exists only
   on `RecipeVotePayload`. Add `Recipe.netScore` and `Recipe.myVote` (or `RecipeGroup.votes(recipeId:,
   mine:)`). Fine at tens of votes, wrong at thousands.
5. **`RecipeSearchResult.recipe: Recipe`** — C1 flagged this as a two-liner; without it a search hit
   has no score, ingredient count or image.
6. **`Recipe.ingredients` has no defined order** — the API returns primary-key order, so the same
   recipe lists its ingredients differently over time. D6 imposes required-then-alphabetical
   client-side and says so.
7. **No `deleteRecipe` / `deleteRecipeGroup`** (B6 flagged their absence). D6 cleaned its smoke rows
   with psql.
8. **Machine-readable `reason`s for recipe errors** — all currently `null`. Suggested:
   `REVIEW_ALREADY_EXISTS`, `NOT_REVIEW_AUTHOR`, and `RECIPE_NOT_IN_GROUP` once B6's group-scoping
   tightening lands.

Also: a two-version group with zero votes legitimately has `canonicalRecipeId: null` under B6 — the
old page called that "a data issue"; it is normal, and the new page labels the top-ranked version
"Top version" instead of "Community pick".

**A7d outcome (2026-09-17). Two of the eight items were already closed; the systemic one was one
missing argument, in one place.**

- **`totalCount` was `null` on every §2.2 collection, from a single default.** `keysetPage`'s
  fourth parameter defaults to `null` and `CollectionActorBase#paged` omitted it — so all nine
  collection actors returned `null`, and the eight separate reports (D4's `BrandConnection`,
  `me.favorites` and `CellarConnection`; D5's `MenuScanConnection` and `MatchSuggestionConnection`;
  D7's `TierListConnection`; D8's `FriendRequestConnection`; plus `RecipeGroupConnection`) were all
  that one line. `CheckInConnection` was the unreported ninth. `paged()` now takes a **required**
  `PageScope` — the `FROM`/`WHERE` the actor's own page query uses — and counts with it. Two
  properties follow and both are the point: a tenth collection actor **cannot forget**, because
  omitting it is a type error rather than a `null` nobody notices for a workstream; and the count
  **cannot drift from the page**, because one fragment builds both queries. Verified live through
  `:3001`: myCellars 43, recipeGroups 7, myTierLists 6, myMenuScans 5 — and page 2 of myCellars
  still reports 43. A test asserts the count excludes a PRIVATE row a stranger may not see, which
  is the real hazard of counting at all: a count taken over the `FROM` alone would leak the
  existence of rows the page correctly withholds.
- **The `first` cap is now documented once, for all ~60 connection fields.** A7c had already fixed
  how it *reads* (a plain child connection returns `{"code":"VALIDATION","path":[…]}`, confirmed
  live on `Recipe.ingredients`, not "Unexpected error"), so only the "undocumented" half was left.
  `plugin-relay`'s `firstArgOptions`/`lastArgOptions`/`beforeArgOptions`/`afterArgOptions` are the
  one place it can be said once — there is no per-field option to forget, and a connection added
  tomorrow inherits it. **This is why the SDL diff is ~1300 lines:** describing any arg makes
  graphql-js print every arg of that field in block form. Called out rather than slipped in, per
  this file's own rule about schema changes. A guard fails if any connection field's `first` is
  undescribed.
- **`Recipe.ingredients` had no order, not merely the wrong one.** `created_at asc, id asc` looks
  stable; `setIngredients` re-inserts the whole list in one `INSERT` and `now()` is
  transaction-stable, so *every row shared a `created_at`* and the sort fell through to `id asc`
  over a fresh `randomUUID()` per row. The rule is now required-then-alphabetical-then-id, which is
  what D6 was applying client-side. `recipe_ingredients` has **no authored display-order column**,
  so the caller's array order is not recoverable; adding one is a migration, not an API fix, and is
  the honest upgrade path if authored order is ever wanted.
- **`deleteRecipe` is the tier-list shape; `deleteRecipeGroup` is the cellar shape**, and the FKs
  decided which. A recipe's children all cascade, so one statement is bounded. A group's
  `recipes.recipe_group_id` is `ON DELETE SET NULL`, so a permissive delete would *silently orphan
  every version* — refused with a `ConflictError` that says what to do instead. Two pointers needed
  care: `recipes.canonical_recipe_id` is a self-FK with no `ON DELETE`, so `RecipeActor` clears
  siblings in its own transaction (its own table); `recipe_groups.canonical_recipe_id` is the
  group's, so **picking the next winner goes through the outbox** (`recomputeCanonical`), not a
  second synchronous call — §8.5 has no `RecipeActor → RecipeGroupActor` edge and the existing
  static call-graph test still reports exactly two `invokeActorMethod` targets.
- **`Recipe.netScore` / `Recipe.myVote` could not come from `RecipeActor`.** `recipe_votes` is
  `RecipeGroupActor`'s table, and §1.3 lets an actor cache only what it writes, so `RecipeActor`
  deliberately never loads votes. `RecipeGroupActor.voteSummaries(recipeIds)` is batched for the
  reason that matters here: one activation takes one turn at a time, so a per-recipe method would
  have run a twenty-version page in series. `upvotes`/`downvotes` ride along because a net of 0
  cannot distinguish "nobody voted" from "ten each way". An ungrouped recipe (nullable FK, `ON
  DELETE SET NULL`) answers 0/null with **no** sidecar hop.
- **Guarding the union-error defect class directly.** A7e's two silent regressions came from
  fallbacks keyed on `response.error`, which a union error does not set. The equivalent risk here
  is `netScore: Int!` — a throwing loader would null `Recipe` and propagate to the root, losing the
  recipe to save the decoration. It degrades to 0/null instead, and a test drives the *throwing*
  path rather than the happy one.
- **Enum domains asserted against their source, not eyeballed** — X1b's sake-picker follow-on as a
  standing rule. `ActorErrorReason` is asserted equal to `ACTOR_ERROR_REASONS` (item 8's three new
  values are generated into the SDL, so a value in the array but missing from the enum would be
  throwable and unnameable), and `RecipeVoteType` equal to `recipe_votes_vote_type_check`'s domain.
- **Two items needed no code.** Item 3 (`/recipes/ai-generator` has no API surface) was closed by
  A7f/D6b: `recipePhotoJob`, `startRecipePhotoJob` and `cancelRecipePhotoJob` expose all four
  `RecipePhotoJobActor` methods. The plan's suggested `createRecipeScan` would have been a *rename*
  of `startRecipePhotoJob`, not a new capability, so it is deliberately not added. Item 2's
  "escapes untyped" half was A7c's, as that entry claims; only the documentation half was
  outstanding.
- **Operational finding, not an API one: `cellar-stack-actors-1` has no file watcher.** It runs
  `bun src/index.ts` over a bind mount, so it serves whatever the tree held at `docker start` and
  never reloads. A container started mid-refactor served a mix of two states for nine minutes after
  the tree was already consistent, and presented as healthy in `docker ps` and in the logs.
  **Restart it after any `services/actors` change before believing a measurement.**

**A7c outcome (2026-09-09). The silent data-loss path is closed, and a much broader bug came out
with it.**
- **`maskError` never matched a resolver-raised error at all.** graphql-js wraps it and hangs the
  original on `originalError`, so **every** resolver-raised error on the nine paging root fields —
  not just the page cap D3 and D6 noticed — was arriving as `INTERNAL_SERVER_ERROR` /
  "Unexpected error". Now unwrapped: a cap violation reads
  `{"code":"VALIDATION","path":["itemSearch"],"message":"first must be at most 100, got 5000"}`.
- **Three general schema guards replace six point fixes**, which is what makes this durable:
  every `<T>AttributesInput` field must be readable on `<T>` (so a seventh item type is covered the
  day it is added); a field name shared by sibling implementations of an interface must have one
  identical type (graphql-js's `SameResponseShape`, which binds even across mutually exclusive
  fragments); and an end-to-end `validate()` of a document selecting every item attribute unaliased.
  They reported exactly the six writable-not-readable fields and the `Wine.style` skew.
- **`me.favorites(first: 100)` was silently wrong past a viewer's 100th favourite**, and hydrated
  every favourite to draw one star. Replaced by `Item.isFavorite`, batched through a loader.
- **`Wine.style` became nullable** rather than making its siblings non-null — one consistent surface
  beat one extra guarantee; the column stays `NOT NULL`. `sakes.vintage` is exposed as
  **`vintageYear: Int`** on both sides, because `vintage: Int` beside five `vintage: Date` siblings
  would have been a fresh instance of the same trap.
- **`FileActor` now has a GraphQL surface**, and reading is deliberately **wider than writing**: a
  non-uploader may read a file referenced by a *public* `item_image` or a `place_google_photos`
  row. That rule is derived by a fresh read of tables `FileActor` does not write (§1.3-compliant)
  rather than a `files.public` flag, so **nothing needs backfilling at cutover**. `verify` and
  `delete` stay uploader-only. E3 still owes the routable endpoint: both URLs are signed against
  `http://minio:9000` and **the signature covers the host**, so it cannot be rewritten in transit.
- **Declined, with reasons:** a root field listing all items of a type needs a collection actor §2
  does not have (collection actors are viewer-scoped, search actors need a vector). That is a
  C-workstream aggregate decision, not an API-surface gap.

**D3b · Re-point D3's `referenceData` documents.** A7c gave `Query.referenceData` an error union so
the ten-alias form degrades per alias instead of one bad alias taking the other nine down. That
broke D3's pages, which were written against the old shape: **root typecheck is at 37, five above
the 32 baseline**, all in `useReferenceOptions.ts`. Wrap each of the eleven selection sets in
`... on ReferenceRowConnection { ... }` with `__typename`, and narrow before reading
`pageInfo`/`edges`. Sequencing mistake on my part — A7c should have run before D3, not after.

**A7e · Error unions on the eight remaining paging root fields.** A7c fixed `referenceData` and
left the other eight deliberately: reshaping eight fields while D workstreams were mid-flight is
worse than doing them in one pass. Same latent hazard — one over-large alias takes its siblings
down. Accept: every paging root field degrades per alias, and the frontend groups are updated in
the same change.

**D5 outcome (2026-09-09). Six of seven frontend groups are on the new lane.**
It proved C1's map gate live and from both sides: a PRIVATE tier list returns `NotFoundError` to a
stranger through `Query.tierList`, and `placeSearch(tierListIds:)` returns `totalCount: 0` for that
stranger while the owner's identical call reaches the embedding error — i.e. **the gate
short-circuits before the embedding**, so the fix is provable even with X1 unwired. It also
confirmed B5's idempotency: two `CreatePlaceMutation` calls with the same client-minted `placeId`
return the same place.

**A systemic gap, now named: actors were built with nothing exposing them.** A7 wrote the API
skeleton *before* most B and C actors existed, and nothing went back to wire the later ones in.
Three instances so far — `FileActor` (A8 built it, A7c exposed it), `RecipePhotoJobActor` (C4 built
it, still unexposed), and now **`MapActor`, which has no GraphQL surface at all**: no
`Query.mapBrowse`, no `MapPlace`, no `MapCluster`. C2 built that actor precisely for viewport
browse, so **the map has no unfiltered browse and no clusters** — `placeSearch` is the only viewport
field and its `query: String!` is required. `RankingsActor` is in the same state and D7 will hit it.
**A7f** closes them and audits for the rest.

**Corrected: D5's `PlaceActor` staleness report is a false positive.** It reproduced a stale
`menuItems` list by inserting a `place_menu_items` row with **raw SQL** against a warm actor. But
`TABLE_WRITERS` records `place_menu_items: "PlaceActor"` and the containment test passes, so no
module outside `PlaceActor` writes it — menu lines arrive through `PlaceActor.addMenuFromScan`,
which writes and reloads. Caching an owned table is exactly what §1.3 permits, and a raw-SQL insert
is the case it assumes away. **Not a fourth §1.3 violation.** Worth remembering that the rule's
guarantee is only as good as the no-raw-writes assumption — E1's transform and any admin script are
the places that could break it.

**Other gaps found:** `duplicatePlaces` has undocumented caps of `radiusMeters ∈ (0, 5000]` and
`limit ∈ [1, 5]` — both raise proper typed errors, but a search capped at five rows is not a
search, and it is why the map's name layer is capped there. `totalCount` is `null` on
`MenuScanConnection` and `MatchSuggestionConnection` too — the fourth and fifth instances of A7d
item 1. No batched `places(ids:)`, so a page of saved places costs an eight-way alias document.

**`graphcache-keys.test.ts` went quietly red for the third time**, from A7c's mid-run schema change.
D5 regenerated it (115 keyless types) and also repaired D3's `referenceData` documents — so D5, not
D3b, was the agent that fixed my sequencing mistake.

**X5 · Wire the Photon geocoder.** `GeocodeActor` throws `ConflictError` ("no geocoder wired …
inject a PhotonClient"), so address search on the map and in the create-place form is dead. This is
**not** X1 — Photon is a plain HTTP geocoder at `photon.komoot.io`, no AI involved. Accept: address
search returns results; the seam still throws loudly when unconfigured; no test hits the live
service.

**A7f outcome (2026-09-09). All 46 actors audited: 34 exposed, 12 not — 3 real gaps, 9 correct.**
`Query.mapBrowse` (a `MapPlace | MapCluster` union over C2's exact nine + three field projection,
with **no `place:` link** — a 500-feature layer must not trigger 500 entity loads),
`Query.rankings(scope:, types:)` with **no reviewer input of any kind**, and start/poll/cancel for
the recipe-photo job. Both view resolvers key on `ctx.viewerId` alone; there is no argument a
viewer could be taken from. Verified: `MapActor(A)` called by B is `FORBIDDEN` **including as
`admin`**, and `userId` in the job input is rejected at GraphQL validation.

**The durable part is the recurrence guard**, `services/api/src/schema/actor-surface.test.ts`: it parses
`registerActor(X)` out of the actors entrypoint **via the TS AST**, resolves each to its contracts
descriptor, AST-scans the schema modules, and subtracts a `NO_SURFACE` allow-list — so a doc
comment naming an actor does not count as exposing it. Three meta-guards keep the allow-list
honest: no stale entries, no entries for unregistered actors, and no reason string under 40
characters. Proven to fail by removing `EmbeddingActor` from the list.

**Two of the nine "correctly unexposed" verdicts are worth remembering:** `EmbeddingActor` must stay
unexposed because a public embed endpoint reopens §7's `create_search_vector` hole; and
**`PlaceRefreshJobActor` is correct only *for now*** — it is admin-only and **nothing starts it
today**. It wants an operator console, not a user-facing field. `ProbeJobActor` (A5's smoke probe)
is now deletable.

**Three frontend follow-ups, all additive — no existing field changed shape:**
- **D5b** `/map`: swap `searchPlacesAdaptiveCluster` for `Query.mapBrowse`, drop the `userId`
  variable entirely (the server takes it from the session), and branch `transformToGeoJSON` on
  `__typename` rather than an `is_cluster` boolean. The drawer fetches the 18 dropped columns by id.
- **D6b** `/recipes/ai-generator`: replace D6's "not available" page with upload →
  `startRecipePhotoJob` → poll `recipePhotoJob(jobId:)`. Mint the `jobId` client-side so retries are
  provably idempotent; stop on `COMPLETED`/`FAILED`/`CANCELLED` and render `lastError`.
- **D7** consumes `Query.rankings` directly — see its own row.

**X1 outcome (2026-09-09). All five blocked seams now resolve; semantic search works end to end.**
Local default is **Ollama** — `ollama serve`, `ollama pull nomic-embed-text` (768-dim, exactly the
`halfvec` width) and `ollama pull gemma3:4b` (multimodal, covers all three vision seams). Compose
already defaults to it. Production wants `AI_PROVIDER=vertex-ai` with a service-account key
(`roles/aiplatform.user`), keeping `GOOGLE_GCP_LOCATION=global` for Gemini but
`VERTEX_AI_EMBEDDING_LOCATION=us-central1`, because `:predict` has no global endpoint.
**Superseded 2026-09-28:** the embedding model is now `gemini-embedding-2`, which Vertex serves
*only* at `global` through `:embedContent`, so `VERTEX_AI_EMBEDDING_LOCATION` is left **empty** and
the model picks its endpoint (`embeddingLocation`, `services/actors/src/lib/ai/vertex-ai.ts`); a
region there 404s every embedding. `deploy-loki.md` §2.7.

Ranked results, through the API: *"a bitter herbal aperitif"* returns Negroni, Americano, Affogato
in that order; *"cold steeped green leaves"* returns Sencha Cold Brew first; *"a roasted coffee"*
ranks a coffee above a tea. The eight dead `regenerateVector` rows were reset and drained,
writing real `halfvec(768)` vectors.

**The no-silent-fallback guard is the durable part, and it targets the exact prior bug.** C4 found
the old `functions/refreshPlaces/_services/factory.ts` fell back to a Wisconsin JSON mock **silently
in production** when credentials were absent. `no-silent-fallback.test.ts` (24 tests) parses
`src/lib/ai/` and asserts **every `catch` rethrows and none returns**, that nothing imports a
`.json` fixture or a `mock`/`fixture`/`stub` module, and that **nothing reads `NODE_ENV`** — the
three things that old factory does. Beyond that: an unset `AI_PROVIDER` installs nothing and every
seam keeps its author's throwing default, and a set-but-incomplete config **throws at boot so the
host never serves** (verified live).

**Honest about quality:** extraction on a local 4B model missed prices and got a vintage wrong. The
*wiring* is proven; hosted providers are the production answer.

**Deliberately not ported, with reasons:** the `admin_credentials` database credential lane (that
table is not in the transformed schema, and secrets belong in the environment); Ollama's
`ensureModelAvailable` auto-pull (a multi-GB download inside an actor turn, replaced by an error
naming the exact `ollama pull`); prompt/response `console.log` (**that is user content**); and the
vendor SDKs — `services/actors` runs off source with no build step, so all three providers are plain
`fetch` and Vertex's RFC 7523 flow is about forty lines of `node:crypto`.

**X1b · Restore the enum-constrained item-defaults schema.** The Nhost version built the AI's output
schema at runtime from the ten reference tables, so the model could only return real enum values.
Doing that here would mean a second sidecar hop **inside `ItemOnboardingActor.start`'s turn**, which
§8.5 forbids — so required attributes now come from `REQUIRED_ITEM_ATTRIBUTES` and the rest is free
text. That is a real quality regression: the model can now invent a wine style that no reference row
contains. Accept: a cached `ReferenceDataActor` read at boot rebuilds the constrained schema with no
per-request hop.

**B7b · Widen `InsightsGenerator`'s input.** B7's seam passes entry **type and id only** — no names,
no database handle — so the ported prompt works from the list's name, description, band
distribution, entry-type mix and user notes. The old prompt had place names, cities, categories and
public ratings. Accept: the seam receives enough to match the old prompt's substance, without an
external call inside an entity actor's turn.

**D7 outcome (2026-09-09). The rankings authorization gap is closed at the client too.**
`$reviewers` and its uuid-array builder are gone; the only variable is `scope`. Proved live across
all four scopes, and the reorder contract holds: a cross-band drag issues two calls, each carrying
the band's **full** membership, and a stale omission raises
*"orderedIds is missing 1 item(s) currently in band 0"*.

**The "Friends Scores" behaviour change is surfaced as two distinct facts**, which is better than I
asked for: *friends exist but none reviewed* reads differently from *no friends yet*, and the second
says explicitly that it does **not** fall back to everyone's scores. Both branches were proved live
by parking the two `friends` rows in a temp table and restoring them.

**A pre-existing bug the migration quietly fixes:** the old `/rankings` had no Sake or Tea fragments
at all, so **a top-rated sake never appeared**. The new board has one row type discriminated by
`entryType`, so items and places — and all six item types — render together.

**Two things for D5b:** `mapBrowse` is **viewport-shaped, not a global picker** — a ±180/±85 box
returns `totalCount: 0` while a city-sized box finds the place, because the adaptive-cluster SQL is
built for a viewport. The place picker should use `placeSearch` with `bounds` omitted.
And `TierListConnection.totalCount` is `null` — the **seventh** instance of A7d item 1.

**X6 · Fold `graphcache-keys` generation into schema codegen.** `src/lib/api/graphcache-keys.ts`
has now gone **quietly red four times** (D2 found it stale from C3, D5 from A7c, D7 from A7f, and
once before that). The guard works; the problem is that it is a *separate* step, so every schema
change silently invalidates a frontend file that nothing regenerates. Make it fall out of
`packages/schema`'s codegen so the two cannot drift, or have the schema guard fail when the keys
file is stale. Accept: changing the schema and regenerating leaves both artifacts correct with no
second command to remember.

**D4 outcome (2026-09-09). All seven frontend groups are on the new lane.** Semantic item search
returns ranked results with `isFavorite` inline, and B3's catalog rule holds from both sides —
anonymous gets `ForbiddenError: sign in to read this list`.

**THREE FEATURE LOSSES that need a product decision, not just code.** Recording them here rather
than in §9 because each was working on Nhost and is not working now:

1. **Image search has no successor and cannot be built from the frontend.** The old `/search`
   accepted an image. `itemSearch(vector:)` needs an embedding **the client would have to hold**,
   and A7f correctly keeps `EmbeddingActor` unexposed (a public embed endpoint reopens §7's
   `create_search_vector` hole). The fix is a server-side endpoint that takes an *image* and does
   the embedding itself — a real piece of work, not a wiring gap. Old `?image_results=` links
   currently land and explain themselves.
2. **`/search`'s discovery feed has no successor.** It read recent `item_reviews` and
   `tier_list_items` filtered by `user_id IN (viewer + friends)`. **There is no cross-user activity
   root field anywhere in the schema**, and building one needs a collection actor §2.2 never
   specified. D4 dropped the feed rather than invent the aggregate — correct, but the feature is
   gone until someone decides it should exist.
3. **`Brand` has no reverse edges at all** — no `items`, no `places`, no `parentBrand`, no
   `childBrands`. The Hasura `/brands/[id]` page rendered all four. The new page resolves the parent
   with a second `brand(id:)` and links out to `/search` with a note; **children are unreachable**
   (it needs `brands(parentBrandId:)`). This one is a plain gap — **A7g**.

**Also:** `itemSearch`'s `limit` is capped at `[1, 50]` and nothing documents it (same class as
D5's `duplicatePlaces` caps); `Query.brand(id:)` is **the only `Query.x(id:)` that is not a result
union**, so a missing id is a top-level error with `data: null` and there is nothing for
`unwrapResult` to narrow; and `totalCount` is `null` on `BrandConnection`, `me.favorites`'
`ItemConnection` and `CellarConnection` — instances **6, 7 and 8** of A7d item 1.

**D3c:** D3's `src/components/item-api/viewerAndFavorite.ts` still diffs `me.favorites(first: 100)`
on every item page, carrying a doc comment asserting `Item.isFavorite` does not exist. A7c added it
hours later. That diff is the exact pattern A7c removed because it was **silently wrong past a
viewer's 100th favourite**.

**X2 outcome (2026-09-09). One database. `auth` is dropped and `auth_dev` no longer exists.**

**CORRECTION, and it was mine to make: the "188 foreign keys" figure was wrong.** It is **31
constraints across 28 tables** that reference the user table. 188 was
`count(*) FROM pg_constraint WHERE contype='f'` over the **whole Nhost database**, including the
`auth` and `storage` schemas — A3 had the correct number in `transform/README.md` all along, and I
repeated the wrong one from A6's checklist into this plan and into several briefs. Verified
independently after the merge: 33 FKs into `"user"` across 30 tables, and 157 total FKs in
`public`. **No casts** — A6b's `uuid` conversion did its job.

**Two things A6's checklist got wrong beyond the count:** the 31 constraints must be **renamed** as
they move (`..._users_id_fkey` → `..._user_id_fkey`, because Drizzle derives names from the referenced
table), and `07_align_constraint_names.sql` cannot do it because it runs seven steps earlier.

**X3's `run.sh` gap is fixed here:** `run.sh` now applies the hand-written SQL lane itself and
`test-db.sh` no longer does, so both build paths end at the same schema.

**A third exemption verb.** better-auth's five tables are `infrastructure:better-auth` — exempt
because **a non-actor writes them and no actor may**, which is neither `outbox`'s "every actor
writes it" nor `migrations`' "nobody writes it". `auth/` is no longer skipped by the containment
scan, and the writer set is confined to `auth/` plus B4's `lib/profile-store.ts`.

**A sixth hand-edit, previously undocumented:** `outbox.seq` must be `bigserial({ mode: "bigint" })`
— `pull` writes `mode: 'number'`, and A7b's bigint comparison then fails to typecheck. Now in
`packages/db/README.md`. The baseline was retaken (it named `usersInAuth` and would have thrown at
import), and **`schemaFilter: ["public"]` is now correct and proven**.

**For E1 — the transform is no longer a straight run.** Steps `13`–`15` are one logical step with a
script in the middle: run `01`–`13`, then `migrate-users.ts`, then `14`–`15`. `run.sh` runs all fifteen
straight through, which is right for a schema-only dump and **wrong for data**: `14` aborts if any
`public.*` row references a user id not yet in `"user"`, and `15` aborts if any `auth.users` row has
no `"user"` row — both name the script. E1 no longer drops `auth` itself, must add before/after row
counts for `"user"`/`account`, and must confirm the `account_provider_account_key` collision
behaviour against real OAuth rows. Note `db:seed` and `migrate-users.ts` both claim
`test@test.com` — the ids agree now, but **a production cutover should run neither seed step**.

Root `pnpm typecheck` is now at **0 errors**: the 32-error `@/images/*.png` baseline was cleared by
the concurrent frontend work.

**E2 outcome (2026-09-09). The browser pass found what nothing else could.** 85 checks in 13
specs: **67 pass, 14 fail, 4 skip**, stable across three runs. Sign-in, the two-account friend flow
(two real browsers), place creation and idempotent re-create, tier-list band moves surviving a
reload, PRIVATE refusals, and semantic search against live Ollama all pass end to end.

**Two cross-group defects, which is the reason this workstream exists:**
- **Sign-out never signs you out (security).** `SideNavigationBar.tsx` imports `signOut` from
  `src/lib/auth/actions.ts`, which calls **Nhost**, not better-auth. Proven in-browser: the cookie
  is unchanged and `/search` still renders the signed-in page afterwards. The better-auth endpoint
  is correct — it deletes the session row and rejects the old token. **Only the UI control is
  wrong.** Sign-in was migrated; sign-out was left behind, and no single group's tests could see
  both halves. **E2a.**
- **Groups C and D independently made the same RSC boundary mistake.** Nine server pages import
  non-component *values* (page-size constants, helpers) from `"use client"` modules and receive a
  stub, so `/cellars`, `/cellars/[id]`, `/recipes` and `/recipes/groups/[id]/versions` all **500**.
  Unit tests pass; **only the RSC bundler shows it**. **E2b.**

**Two behavioural defects worth their own row:**
- **Onboarding fabricates an entire item from no image**, at confidence 0.9–1.0 and differently each
  run — e.g. a Château d'Yquem with a vintage and a region. **Then the wizard overwrites what you
  already typed with the fabrication** and refuses to save ("Vintage is required") over a field you
  can see is filled. X1b's missing enum constraint is part of this; the confident invention from
  *no input at all* is worse. **E2c.**
- **`removeFriend` violates read-your-own-writes** — it returns success while the row is still
  committed, converging about a second later through the outbox. Measured, and it was the source of
  cross-run flakiness. And **`createMenuScan` accepts a never-uploaded file**: `verifyUpload`,
  `files.verified_at` and `files_unverified_idx` all exist and **none is consulted**, so A8's
  "never trust the client's done" protocol is not actually enforced at that call site. **E2d.**

**Two things E2 caught that had nothing to do with the flows:** `packages/e2e/artifacts/` was neither
gitignored nor biome-excluded and **holds live session tokens** (fixed); and CI's
`pnpm install --frozen-lockfile` **would have failed**, because `@playwright/test` was in
`package.json` and absent from the lockfile (fixed — the only lockfile change).

**Correction to my own brief:** menu-scan creation is **not** blocked by E3. `createUploadTarget`
mints the `files` row before any bytes move, so the flow around the upload is testable, and now is.

**CI recommendation:** add a non-blocking `e2e` job now; **do not gate merges** until E2a and E2b
land, or 14 real failures red-wall every PR. Note `biome check apps packages` covers neither
`packages/e2e/` nor the frontend’s `src/`. X4's `ACTORS_TEST_DB_OPTIONAL` is orthogonal — the browser suite runs
against the compose stack.

**Cleanup batch outcome (2026-09-09). C1b, C4c, D3c, B8b all landed.**

**The `derivedUuid` copies were not identical, and that mattered.** Two used a **NUL-byte**
separator; `menu-scan-actor.ts` used a **plain space**. The agent kept the NUL version — two of
three agreed, and it is what B2's load-bearing `itemId`/`cellarItemId` derivation uses — then
checked that the divergent copy only ever produced a **Dapr actor id, not a persisted row id**, so
repointing it is behaviour-preserving for anything already committed. Had it silently picked the
space variant, B2's deterministic ids would have shifted and a redelivered `confirm` would have
created duplicates instead of converging. This is exactly the case where "three copies, just pick
one" would have been wrong.

**B8b widened `detected_item_type` to `wine, beer, spirit, coffee, sake, tea, cocktail, unknown`**
and `MenuScanActor` now passes the scanned type through instead of collapsing to `unknown`. But the
**FK columns did not widen**, so a new `MatchableMenuItemType` (wine/beer/spirit/coffee) was needed
for the match target — the same underlying fact as B8's "an acceptance cannot always be
propagated". **B8c** is the remaining half: `menu_item_recipes` is `PlaceActor`'s table, nothing
writes it, and it is where an accepted cocktail should land.

`ClusteredPlaceRow` is now checked against `pg_get_functiondef` by a test rather than by eye, so it
fails if either the type or the SQL drifts.

**E2a/E2b outcome (2026-09-09). 67 pass / 14 fail → 77 pass / 6 fail, and nothing that passed
before regressed.** Eight of the fourteen went green; two of the four skips started running and
both pass. All six remaining failures are from E2's original list.

**The sign-out fix needed two halves, and the second is the interesting one.** The control now
calls `authClient.signOut()` as a browser `fetch` — it cannot be a server action, because the cookie
is cleared by `Set-Cookie` on the response *the browser itself* receives. But that alone was not
enough: `getOptionalServerUser()` reads **Nhost first**, so anyone still holding a pre-migration
`nhostSession` cookie would remain signed in after better-auth had forgotten them — the same defect
with a narrower population. A server-side `completeSignOut` deletes that legacy httpOnly cookie.
D9 removes that half.

**All nine boundary violations were constants or one pure helper**, now in plain modules with no
re-exports left behind, so the shape cannot return through the old path.

**A new defect the fix made visible — a different class from E2b.** `/recipes/groups/[id]/versions`
used to 500 on `$recipeFirst`; it now renders and throws *"Functions cannot be passed directly to
Client Components"*. Three server pages pass `next/link` **as a prop value** into Joy client
components (10 sites). Only one spec asserts `pageErrors`, so **the other two throw silently**.
`src/components/common/Link.tsx` is already exactly the right wrapper, but swapping it in changes
link styling — a UI call, which is why E2ab left it. **E2e.**

**Two infrastructure gaps worth acting on:**
- **The client-boundary scan is in the most expensive place it could be.** It needs no browser, no
  Docker, no dev server and no database — but under Playwright it only runs behind `stack:up`, a dev
  server and ~90s of setup. Worse, it lives under `packages/e2e/artifacts/`, which is **gitignored because it
  holds live session tokens**, so it can never be committed as it stands. It is a compile-time
  invariant and belongs beside `typecheck` and `lint`. **X7.**
- **The root Next app has no CI workflow at all.** `stack-ci.yaml` is scoped to
  `services/**`/`packages/**`/`infra/**` and explicitly excludes the root, so **nothing in `src/` runs on
  a PR** — not typecheck, not biome, not the 153 unit tests. Six frontend groups' work is uncovered.
  **X8.**

**Good diagnosis worth repeating:** run 2 of 3 looked worse (10 failures) and E2ab correctly
attributed it to the environment rather than its own change — the compose `api` container logged
`SIGTERM received, stopping` at the exact second that run started, because a concurrent agent's
edits restart it. Runs 1 and 3 bracket it identically.

**E1 outcome (2026-09-09). `scripts/cutover/` runs twelve timed phases, rehearsed three times
unattended. And it corrected a verification claim this plan has carried since A3.**

**The baseline check never checked the database.** A3's acceptance criterion — "`drizzle-kit
generate` produces an empty diff **against the restored database**" — is not what those commands do:
`check` and `generate` **never open a connection**, they compare schema files to the snapshot. So
that criterion was passing without ever confirming the transformed database matched the baseline.
E1 replaced it with a real check: `drizzle-kit pull` into a work area, diffed against `tables.ts`
through a `normalize-schema.sed` that erases exactly the four documented hand-edits. **That empty
diff is the only actual proof.**

**There are two split points in the transform, not one.** X2 found `13 → migrate-users → 14`. E1
found the second by rehearsal: `09`, `10` and `12` `ADD CONSTRAINT` against `public.files`, which
**validates**, so **`migrate-files.ts` must run between `08` and `09`**. Proven rather than argued —
planting one `item_image` row makes `09` abort with *"1 referenced file id(s) are missing from
public.files"*. **Local data can never surface this**, because `storage.files` is empty here.

**The file phase is what sets the outage length.** It is linear in *object count*, strictly
sequential, roughly four S3 round-trips each: measured **1500 objects in 5.9s on loopback**, which
at a realistic 30–60ms RTT is **4–8 objects/sec** — so 10k files is 20–40 minutes and 100k is 4–7 hours,
**nearly independent of total bytes**. Get the count from preflight §6 and budget from that. It is
idempotent, so most of it can run *before* the freeze.

**A bug in my own transform step.** `08_item_favorites_missing_uniques.sql` was not re-runnable —
`ADD CONSTRAINT` has no `IF NOT EXISTS` — so `--from transform-a` died, contradicting the lane's own
no-op contract. Now guarded on `pg_constraint`.

**Three decisions, each argued from cost rather than taste:**
- **`friend_request_status.ACCEPTED` survives.** Postgres has no `DROP VALUE`; retiring one
  unreachable label means recreating the type and rewriting the table **mid-outage**, and is
  impossible at all if a historical row holds it.
- **`item_reviews.text` stays `json` and `item_onboardings.status` stays unconstrained — recorded,
  not tightened.** Both are introspected into `tables.ts`, so tightening moves the baseline, and E1
  should not both change the schema and be the workstream validating it. Preflight now produces
  exactly the evidence B2 needs.
- **All `updated_at` triggers survive.** There are **eight** such functions, all byte-identical, all
  `BEFORE UPDATE`, and **no table carries more than one** — eight names for one behaviour, so there is
  no double-write and no ordering question. Consolidating means recreating 32 triggers in the outage
  window to change nothing Drizzle models.

**Two plan corrections:** the enum split touches **13 columns, not 14** (§4's `permission_type`
covers two), and `lc_monetary` is **`C`** locally, not the `en_US.utf8` the transform README asserts
(0 priced rows here, so the `money` → `numeric` cast is unexercised).

**Fixed while reviewing:** B8b widened the `place_menu_items` CHECK in `tables.ts` and the transform
but never re-recorded the snapshot, so `generate` proposed a migration and the cutover needed
`ALLOW_SNAPSHOT_DRIFT=1`. Migration generated; `generate` and `check` are both clean again.

**What a rehearsal against thin local data cannot prove, stated plainly — this list is E1's real
output:** volume (2 users, 1 item, 0 places, 0 files, 0 priced rows — `04`'s enum retypes, `08`'s
index builds, `14`'s 31 validations and `05`'s cast have all run on **empty tables**); social login
migration (0 provider rows); the real object-store pair (loopback MinIO→MinIO only); price fidelity;
enum drift and `08`'s abort as *outcomes* rather than code paths; and the Nhost-cloud dump itself —
version skew, roles, interruption — where a completion-marker check is the only guard.

**Addendum (2026-09-28): the production backup answered most of that list, and changed four
things** (`scripts/cutover/README.md` has each in full). Volume: 20 users, 7.17M `places` rows
(~99% of the data), 2,331 files. (1) **`SKIP_FILES=1` could not run on real data** — `09`/`10`/`12`
validate 2,313 file references and abort on an empty `public.files`; it is now refused, and
`FILES_MODE=rows-only` writes the rows without the objects (`migrate-files.ts --rows-only`). (2)
**The file-phase budget above is a count estimate and production's objects are ~2 MB each**:
budget **10–15 minutes** for 2,331 objects / 4.32 GiB, and copy them *before* the freeze (E4
(0f)). (3) **`restore` is the long pole of the database path** (248 s of ~280 s) and is now a
custom-format archive restored by `pg_restore -j 8` — 190→131 s and 252→114 s in alternating runs
under the same load — with the archive read end to end *before* the target is reset, which
replaces the completion marker. (4) **`admin.credentials` is not empty in production**: it holds a
live GCP service-account private key. Migration `20260928194604_drop_admin_credentials` drops it
during `migrate`; `smoke` §12 fails if it survives. The key must be rotated regardless. Full
rehearsal of this tree (`f398f8fd`, clean) into a fresh database: every phase passed, **212 s**
end to end (restore 154 s), `files` rows-only 2,331 rows / 4,639,679,178 bytes, 19 migrations
applied and 6 adopted.

**E2e / X7 / X8 outcome (2026-09-10). All green: 1150 tests, typecheck 0, biome clean.**

**The `next typegen` discovery explains a problem that dogged this entire migration.** The
32-error `@/images/*.png` "pre-existing baseline" every workstream was told to ignore was not
pre-existing at all — `next-env.d.ts` is **gitignored**, and CLAUDE.md forbids `pnpm dev`/`build`,
which are the usual ways it gets generated. **`next typegen` generates it without either**, and CI
now runs it first. Every agent this session judged itself against a 32-error baseline that a single
command dissolves.

**E2e was four files, not three.** `recipes/ai-generator/page.tsx` was a fourth server page passing
`component={NextLink}`, **throwing silently** because no spec asserted its page errors.
The visual analysis is worth keeping: the old `<Typography component={NextLink}>` set **no colour
and no decoration**, so those anchors were rendering with **browser UA styles** — nothing in Joy or
CssBaseline resets `a`. Joy's `Link` colours from the theme, so **colour is the only unavoidable
change** (`underline="always"` preserves the rest). Note that preserving the old look **diverges
from the app's own convention** (`ItemDetail` uses `underline="hover"`) — worth normalising
deliberately later rather than by accident now. `08-recipes` went from 2 pass / 1 fail / 2 not-run
to **5 pass**, upvote test included.

**X7 extended the scan to the prop class and stated its limits.** Rule 2 flags a bare identifier
prop that is certainly a function; verified against a reconstructed pre-fix tree it found **exactly
the 10 sites with zero false positives across 110 server modules**. It **cannot** see inline arrows,
member/call expressions or spreads — said plainly in the module doc rather than implied, which is
the difference between a guard and a false sense of one. One copy of the logic now, in
`src/lib/dev-checks/`, running in ~3ms inside a 0.4s `test:unit`.

**X8 closed the root CI gap** (→ `app-ci.yaml`: filtered frozen-lockfile install, `next typegen`,
typecheck, `biome check src e2e`, `test:unit`; no browser leg). It also had to fix **31 pre-existing
biome errors in `src/`** that nothing had ever run over. Confirmed D2's 66 document tests **skip
rather than fail** with no stack listening, so CI stays green without one.

**Second good environmental diagnosis in a row:** an early full run showed **42 failures**; the
agent traced it to `cellar-stack-api-1` taking three `SIGTERM`s while `cellar` briefly had no
better-auth `user` table — the concurrent cutover rehearsal — and discarded the run instead of
chasing ghosts.

**X9:** `src/lib/__tests__/`, `src/hooks/__tests__/` and `src/components/recipe/__tests__/` hold
three **Jest-syntax** tests with no Jest in the repo. They have never run and cannot run;
`test:unit` carries a `!(__tests__)` exclusion solely because of them.

**D9 outcome (2026-09-10). The Nhost lane is gone: ~445 files, ~92.4k lines.** The deletion set was
computed by **reachability from real Next entrypoints**, not by hand. `test:e2e` went **up**:
76 pass / 5 fail / 3 not-run → **80 pass / 4 fail / 0 not-run**, with every other gate unchanged.

**It fixed a cross-group cache bug the parallel structure created.** Each frontend group mounted its
own `ApiUrqlProvider` on its own route group — which meant **a separate urql client and graphcache
per group**, so a mutation in one group could not update an entity another had cached. D9 hoisted
the provider to `(authenticated)/layout.tsx` and deleted 16 group layouts. No single group could
have seen this; it is a direct artifact of building seven groups in parallel.

**Four things that were load-bearing and should not have been:**
- **`functions/_packages/typescript-config` was the root `tsconfig.json`'s `extends` target.**
  Deleting `functions/` blind breaks every root typecheck. (Its gql.tada plugin also pointed at
  `local.graphql.nhost.run` with `x-hasura-admin-secret: nhost-admin-secret` — checked: that is the
  **well-known Nhost local default** against a localhost-only host, matching `.secrets`. Not a
  production exposure.)
- **A never-run Jest test kept a whole chain alive.** `RecipeVoteButtons.test.tsx` was the only
  importer of `RecipeVoteButtons.tsx` → `app/actions/recipes.ts`. Three such `__tests__` dirs existed
  and **none can run** (no Jest in the repo) — X9's subject, now deleted with the lane.
- **`next typegen` rewrites root `tsconfig.json`**, setting `"jsx": "react-jsx"` over `"preserve"`
  on every run, now that the options are local rather than inherited. Next's choice, not ours.
- **X7's boundary guard has sanity floors** (`files > 200`, `clientModules > 100`) that a deletion
  this large trips. Lowered to 150/50/50 — only the "did the walk find anything" floor moved, no
  assertion weakened.

**D5c — a silent regression nobody noticed.** `/map` and `/map/create-place` read a geolocation
cookie whose **only writer was the old lane's `useGeolocation.ts`**. D5's `PlaceExplorer` never asks
for position, so **`initialCenter` has been `null` for every viewer since D5 landed** — the map has
simply been opening at its default centre. D9 kept `geo-cookie/client.ts` unimported, with a comment.

**`nhost/` stays until after E4, and D9 is right about why:** `transform/run.sh` `pg_dump`s the live
local Nhost container for the schema **every dev and test database is built from**, `test-db.sh`
fingerprints `nhost/migrations` for X3's template, `cutover.sh` uses the same container as its dump
source, and E4's rollback *is* "point Vercel back at Nhost". Remove it after E4's 24h watch **and**
after X4 lands a checked-in `$DUMP` baseline — together with `biome.json`'s `!nhost`,
`.vercelignore`'s `/nhost`, `.claude/launch.json`'s Nhost entry, and the `nhost-hasura-admin` agent.

**X10 — CLAUDE.md now actively misdirects.** It still instructs agents to run `nhost up --apply-seeds`,
calls the linter ESLint/Prettier (the repo uses Biome), points Playwright at `localhost:3000` via a
Docker hostname, names the Postgres container `cellar-assistant-postgres-1` (wrong in any worktree),
and routes all database work through the `nhost-hasura-admin` agent. Every one of those is now false.
D9 left it alone as out of scope, correctly — but it is the first thing a future agent reads.

**X11 — the onboarding wizard throws away a typed barcode. DONE.** The Barcode `Input` was bound to
state that went nowhere: `start` is always called with `barcode: null`, and
`ConfirmItemOnboardingMutation`'s input has no barcode field at all. Someone typing a barcode got no
error and no effect, under helper text claiming it had been "registered through `BarcodeActor` when
the session was opened".

This row was parked as a product question — *lookup key against an external catalog, or stored
attribute?* — and **that framing was wrong**. It is a wiring bug, and the repository had already
answered the question twice over:

- `services/actors/src/lib/item-defaults.ts`, refusing an extraction with no photograph, says in
  prose that *"a barcode is a lookup key, not something a vision model can read a vintage off.
  `BarcodeActor.ensure` is the path that turns one into a product, and `ItemOnboardingActor.confirm`
  already calls it."* There is no external catalog anywhere in this system and none was proposed;
  the lookup is the internal registry.
- `ensureBarcode`, `linkBarcodeItem` and `barcode(code:)` have been in the SDL since B2, `/search`
  has used the reverse lookup since D4 — and `services/client/src/lib/api/items.ts` has carried
  documents for all three, **with no callers**, which is why nothing noticed. Same shape as the
  stale-capability class below: the capability landed, nothing connected it, every gate stayed green.

Fixed by calling the path that existed. `attachBarcode` runs `ensureBarcode(code)` then
`linkBarcodeItem(code, itemId, itemType)` once the poll sees the item row — after, not before,
because `linkItem` reads the item's `created_by_id` to authorise the caller and 404s on a row the
outbox has not written. Proven end to end against the running stack: item created without a barcode,
linked, `Item.barcode` reads back, `barcode(code:)` finds it. **Authorisation re-checked rather than
assumed**, given E2f's neighbouring finding that `start` trusted caller-supplied `files.id`s — as the
second seeded account against the first's item, `linkBarcodeItem` answers *"only the creator of sake
… may link a barcode to it"*, and an anonymous `ensureBarcode` answers *"sign in to register a
barcode"*.

**No barcode *type* is sent, deliberately.** `barcodes.type` is plain `text` with no check
constraint and no enum in the SDL, so there is no domain to enumerate — and §2.1's "only on creation
or admin" makes any guess actively harmful: measured, `ensureBarcode(code: "859996000750", type:
"EAN_13")` is `ForbiddenError "already exists with type UPC_A; only an admin may change it"`, while
the same call with `type: null` returns the row. Two of the five rows in the dev database carry
`type = null`, so a picker or a length-derived guess would turn a good code into a hard failure the
moment somebody else registered it first. A symbology is a property of the *scan*; this form has no
scanner. (The client's legacy four-member `BarcodeType` enum in `src/constants/index.tsx` is not the
column's domain and still has no callers.)

Guarded by `services/client/src/lib/items/barcode.test.ts` (24 tests): the client's copy of
`BarcodeActor`'s `CODE_PATTERN` is compared against the actor read off disk, `barcodes.type` is
asserted to still be free text — so adding an enum fails the suite and forces the picker decision to
be redone, X1b's lesson — and the wizard is asserted to still reference the mutations. Both fences
were verified to bite by reintroducing the defect. Note for anyone reading `barcodes`: the legacy
scanner wrote codes the pattern now rejects, including one whose code is `"ANNO\n1822"` and one that
is the empty string.

*A note on how X1b and E2c closed.* Both were marked `todo` here while their work had in fact landed
in `10c7a0ff`. Verifying that turned up a fourth member of the structured-output defect family, and
one that **X1b's own completion created**: the sake serving-temperature picker offered seven of the
column's nine labels, so once the model was correctly constrained to the column's real vocabulary it
could propose a value the form had no control for — a field the wizard believed was filled, backed by
an `Autocomplete` through which nobody could re-pick it. `SakeAttributesInput.servingTemperature` is
typed `String` in the SDL rather than the `SakeServingTemperature` enum the same SDL defines, so the
picker was the only thing standing there. Fixed in `4aa3191e`, along with a filesystem fence that
holds all six static option lists to `packages/db`'s `pgEnum` declarations in both directions. The
general lesson is worth keeping: **tightening a producer can break a consumer that was only ever
correct by accident.**

**X1 · Wire an AI provider into `services/actors`.** **Five workstreams have now blocked on this**
and each left an injectable seam that throws loudly by default: B7 (`generateInsights`), B8 (menu
extraction and match verification), C1 (`EmbeddingActor`), C4 (recipe-photo vision), and now D2 —
whose `semanticQuery` control ships and 500s with *"EmbeddingActor has no embedding provider
wired"*. The old `functions/_utils` factory (Vertex AI / Google AI / Ollama, with quality tiers)
is the thing to port. Accept: every seam resolves against one configured provider; `semanticQuery`
returns ranked results; nothing falls back to a mock silently (see C4b).

**X2 · Merge `auth_dev` into the main database.** A6 was deliberately built in its own `auth_dev`
database so it could run in parallel with A3, and that debt is now **blocking fixtures**:
`cellars.created_by_id` FKs `auth.users`, better-auth's users live in `auth_dev`, and `auth.users`
in the stack database was empty — so every `create` 500'd until D2 hand-inserted the two test
users into `cellar.auth.users` and left them there for D3–D7. A6b already made the FK re-point
type-clean (both sides `uuid`). Accept: one database, better-auth's tables beside the domain
tables, the ~31 FKs re-pointed to `user(id)`, `auth` dropped, and `pnpm db:seed` producing a
usable environment with no hand-inserted rows.

**D2–D8.** Page groups per the §6.0 table, covering these routes:
- D2: `/cellars`, `/cellars/add`, `/cellars/[id]`, `/cellars/[id]/edit`, `/cellars/[id]/items`,
  `/cellars/[id]/items/add`, `/cellars/[id]/{type}/add`, `/cellars/[id]/{type}/[itemId]`,
  `/cellars/[id]/{type}/[itemId]/edit`. The six per-type add/detail/edit trees *may* collapse to
  a parameterised set over the `Item` interface where the UI is shared; type-specific forms stay
  type-specific. That's a UI call for the D2 agent, not a requirement.
- D3: `/{type}/[itemId]`, `/add`, `/add/[itemType]`, onboarding wizard (`ItemOnboardingActor`),
  image upload via presigned PUT + `attachImage`.
- D4: `/search`, `/brands`, `/brands/[id]`, `/favorites`.
- D5: `/map`, `/map/create-place`, `/map/scans`, `/map/scans/[id]`, `/places/[id]`,
  `/discoveries` (the existing dashboard is already broken against the schema; rewrite it).
- D6: `/recipes`, `/recipes/[id]`, `/recipes/ai-generator` (drives `RecipePhotoJobActor`),
  `/recipes/groups/[id]`, `/…/versions`.
- D7: `/tier-lists`, `/tier-lists/add`, `/tier-lists/[id]`, `/tier-lists/[id]/edit`,
  `/rankings` (`RankingsActor`).
- D8: `/friends` (polling replaces the subscription), `/users/edit`.
Accept per group: every route renders against compose with the test accounts; no remaining import
from `@nhost/*` in the group; the group's server actions are deleted; Quick Visual Check (CLAUDE.md)
evidence attached.

**D9 · Remove the old stack.** Delete `functions/`, `nhost/`, `@nhost/*` deps, `src/lib/urql`
Nhost wiring, both subscriptions, `src/lib/cache` admin workaround. Accept: `pnpm typecheck`
clean; grep for `hasura`, `nhost`, `X-Hasura` returns only docs.

### E — Cutover

**E1 · Transform + rehearsal.** Finalize `scripts/cutover/`: (1) restore Nhost dump into PG18;
(2) A6 user migration; (3) A8 file migration; (4) schema transform (§3 removals, §4 enums,
new tables); (5) drizzle baseline check; (6) smoke queries. Rehearse end-to-end on a fresh dump
at least twice; time it.
**The `auth_dev` → main-database merge is type-clean as of A6b.** Nhost's `auth.users.id` is `uuid` and
**about 31 foreign keys across 28 tables point at it** (see the X2 correction below). better-auth originally used `text` primary keys,
which would have forced a cast or a column-type change on every one of them during the cutover
window (**31 constraints across 28 tables** — not the 188 this plan said before X2 measured it). A6b
converted better-auth's seven id and id-FK columns to real `uuid` (leaving `session.token`,
`account.account_id`, `account.provider_id`, `verification.identifier` and `verification.value` as
`text`), verified against a live sign-in, JWKS check and the full 45-test suite. The FK re-point is
now a plain repoint with no casting.

**Pre-cutover checks against production** (both surfaced by A6). **Both were closed on 2026-09-18
without the production numbers** — `e4-decisions.md` decisions 2 and 3 carry the measurements.
Run them anyway; they record facts and gate nothing:
- **Count users with `email_verified = false`.** A6 kept `requireLocalEmailVerified: true` with no
  trusted providers — the right call, since relaxing either enables pre-registration account
  hijacking — so those users cannot OAuth-link after cutover. **They gain password sign-in, which
  Nhost denies them today** (`AUTH_EMAIL_SIGNIN_EMAIL_VERIFIED_REQUIRED=true`, set in every
  revision of `nhost.toml`), so the cutover can only help this population and there is no policy
  to decide at any count.
- **Inventory `auth.user_providers` provider ids.** The local table has **zero rows**, so social
  migration is proven only against a synthetic source. Production cannot hold an id better-auth
  does not ship: `nhost.toml` has enabled exactly `google`/`facebook`/`discord` in all 34 of its
  revisions, and better-auth ships those same three. `windowslive` and `azuread` are
  `enabled = false` in every version of the file that has ever existed.

Accept: rehearsal completes unattended; row counts per table match the dump except for
intentionally dropped tables; every migrated file key resolves; runbook has timings; both
pre-cutover counts above are recorded in the runbook.

**E2 · Golden flows.** Playwright against compose with the test accounts: sign-in; create cellar;
onboard a wine with a label image; add to cellar; check in; friend request + accept from the second
account; friend sees FRIENDS cellar, stranger does not; map browse + semantic search; create a
place; menu scan; tier list reorder; recipe vote.
Accept: green on compose; runs in CI.

**E3 · Loki infra.** Port forward + public DNS, Caddy TLS, the compose stack, Grafana reachable
on the LAN only, secrets in `.env` (not committed). **Deploy pipeline:** GitHub Actions builds
`services/api` and `services/actors` images on merge to `main`; the existing self-hosted runner on Loki
pulls and `docker compose up -d`. **Backups:** nightly `pg_dump` and a MinIO bucket mirror to a second disk or
off-box target; a restore drill is part of acceptance.
Accept: `https://<host>/graphql` answers from outside the LAN; a merge to `main` redeploys
without manual steps; a Dapr trace for one actor call is visible in Grafana; a Postgres backup
and a MinIO backup both restore.

**E3 outcome (2026-09-10).** Run as two agents split by file ownership (edge/identity, then
pipeline/backups); both halves' claims re-verified independently before this note was written.
Ports read back out of the rendered compose config: **only Caddy is bound to `0.0.0.0`** (80/443),
Grafana sits on the LAN address, Postgres/MinIO/api on loopback, and the actors service publishes
**nothing** — port 3002 is the unauthenticated Dapr actor host, so exposing it would hand out
`/actors/*` to anyone who can reach the port. Six corrections, four of them to this document:

- **The alert query in `target-stack.md` was wrong twice over** and would have matched nothing,
  silently, forever — the precise failure the bullet exists to prevent. `event_name` is an OTLP
  log-record attribute, so it is Loki *structured metadata* filtered after a pipe, never a stream
  selector; and the method attribute is emitted as `outbox.method` (→ `outbox_method`), so the
  bare `method` label never existed. Corrected in place, and measured: the old form returned 0
  rows against live Loki, the new one 11. §7 of that same document had described this trap
  correctly 55 lines further down — the two passages had contradicted each other since A2.
- **There is no self-hosted runner for this repository.** The plan assumed one existed; none is
  registered, so the deploy job queues forever until someone registers a runner with the `loki`
  label (or the deploy moves off a self-hosted runner — `deploy-loki.md` §2.6).
- **Compose appends port lists rather than merging them by container port.** The first prod overlay
  looked correct and still left MinIO's console published on `0.0.0.0`; `!override` is required.
- **The Grafana provisioning bind mount shadows the image's own**, so declaring it without copying
  `grafana/otel-lgtm`'s upstream datasources across yields a Grafana with no datasources at all —
  which reads as a broken collector rather than a config mistake.
- **MinIO needs its own subdomain, not a path prefix**: SigV4 covers the `Host` header *and* the
  URI path, and the presigner signs path-style `/<bucket>/<key>`.
- **`headers()` is evaluated at build time**, so `PUBLIC_FILES_HOST` must also be a Vercel
  build-time variable, not merely an `infra/.env.prod` entry.

Restore drill executed against the live stack into throwaway targets: Postgres dumped and restored
with **62 tables and 9,313 rows matching exactly**; the bucket is empty in this environment, so the
drill seeded a 15-object corpus and round-tripped it to a zero-difference `mc diff`. Both throwaways
dropped; `cellar`, `cellar_test` and the real bucket confirmed untouched afterwards.

**Not verifiable from here, and E4 must treat these as unproven:** ACME issuance, the presigned
round trip over the public edge, MinIO's CORS preflight through Caddy (measured direct, inferred
through the proxy), and whether Grafana's `remote_ip private_ranges` guard sees real client IPs on
Loki — the LAN-interface port binding is the enforcement that actually holds. The nightly backup
schedule is **documented, not installed**: this machine is not Loki. Alert rules currently have no
delivery channel; the Discord webhook already used by `release-discord.yaml` is the natural target.

**X11 outcome (2026-09-10) — the stale-capability sweep, and the worst systemic defect in this
migration.** Sixteen prose claims across the frontend were checked against the SDL and the running
API. **Twelve were stale**, and they were not comments: each one gated a feature off. Four whole
features were dark with every gate green — `/map`'s viewport browse, `/recipes/ai-generator`,
`/map/scans`, and the scanned-menu image in `MenuScanDetail`. This closes **D5b** and **D6b**,
which were still listed as todo while the code they describe had been unreachable rather than
unwritten.

The mechanism deserves stating plainly, because it defeated every check this project has. A module
hardcodes *"backend capability X does not exist yet"* and gates its feature on that sentence. The
capability lands in a later workstream. **Nothing updates the sentence**: no typecheck fails on a
string, no test covers a comment, no reviewer re-reads a paragraph that was true when written. The
feature stays off, indefinitely, while tests, types and CI all stay green. Image upload was dead
this way for two workstreams (see the `FileActor` note above); the AI features were dead from X1's
landing until now. **Parallel agents make this failure mode systemic rather than occasional** —
each agent honestly recorded what was missing at its moment, and no agent owned the moment it
stopped being missing.

The fix is structural, not editorial: `src/lib/dev-checks/capability-claims.test.ts` (27 tests)
cross-checks prose against the SDL, the filesystem, and the live API in both directions, so a claim
that a field is absent fails when the field exists. Its exemption list is designed to expire —
an entry asserts its claim is *still* stale, so fixing the claim makes the entry wrong and fails
the suite demanding its own deletion. The one entry it held (a `mapBrowse` denial parked while A7h
had the file open) was retired the same day. Proof the guard bites: three retired strings
reintroduced, five tests failed, each naming file, line and the refuting schema element.

Three claims were verified **true** and deliberately kept — `UpdateTierListInput` really has no
`listType`, no root field lists items of one type, and `user.ts` deliberately hides an internal
`outboxRowId`. Precision was the point; the goal was never to delete gates.

**E4 · Runbook.** Revised 2026-09-18 — steps 0, 5 and 7 changed; see
`docs/architecture/e4-decisions.md` decisions 13 and 14 for what was wrong with the old wording.
Revised again 2026-09-27 — step (0a) was unsafe as written (decision 15), and steps (0b), (2), (6)
and the rollback paragraph changed with it.

**Before the freeze is announced**, on no deadline:

- **(0a) Gate, then merge this branch to `main`, then wait for `deploy-loki.yaml`'s `build` job.**
  **A merge to `main` is not inert.** Nhost Cloud deploys *production* from `main` — this branch
  would ship two Hasura migrations, a breaking action change and the deletion of every function
  to the live backend and rollback target — and release-please fast-forwards `production`
  (Vercel Production) whenever a release PR is merged, which the merge will immediately open.
  Evidence and reasoning: `e4-decisions.md` decision 15. In this order, each step confirmed
  before the next:
  1. **Nhost stops deploying from `main`.** In the Nhost dashboard's Git settings, point the
     deployment branch at a new `nhost-legacy` branch created at the deployed commit
     (`git push origin 82450ad1:refs/heads/nhost-legacy`), or disconnect the repository.
     **Confirm with a canary:** land one `chore:` commit on `main` touching nothing under
     `nhost/` or `functions/`, wait three minutes, and check that
     `gh api repos/MrMint/cellar-assistant/commits/<canary-sha>/check-runs --jq '[.check_runs[] | select(.app.slug=="nhost")] | length'`
     prints `0`. (The canary sits on `82450ad1`, so a gate that failed ships only what production
     already runs.) **This gate stays until Nhost is deleted**, not just until the cutover.
  2. **No Production frontend deploy until step 6.** Remove the release GitHub App from the
     `production` ruleset's bypass list (keep the admin role), confirm the list reads
     `["RepositoryRole"]` (the command is in decision 15), and do not merge release-please PRs
     until step 6.
  3. **Merge**, then confirm the merge commit has no `nhost` check-run and `production` is still
     `82450ad1` (`gh api repos/MrMint/cellar-assistant/branches/production --jq .commit.sha`).
  4. **Wait for the `build` job.** It publishes `ghcr.io/mrmint/cellar-api` and `…/cellar-actors`
     at `sha-<7>`, which is what step 4 pulls. That job fires only on `push: branches: [main]`, so
     **until the merge lands there is no image to deploy** and step 4 cannot run. It builds on
     `ubuntu-latest` and needs no self-hosted runner.
- **(0b) `scripts/cutover/cutover.sh preflight`**, read-only against production. Name the source
  with `SRC_DSN=…`: there is no default source any more, and the script refuses to guess (the old
  default was a local worktree container name that silently won over `SRC_DSN`). Record §1's
  unverified-email count and §2's provider inventory in this file — E1's acceptance asks for both,
  and neither gates anything (decisions 2 and 3). Preflight also checks this host's Node against
  `.nvmrc` and logs in to the target over TCP; a target that does not answer is only a warning
  here, so **run preflight once more on the cutover host, with the production `DST_PASSWORD`,
  before the freeze is announced** — it must end with no "NOT CHECKED" line.
- **(0c) Rehearse.** Run the full E1 sequence and the **complete E2 Playwright suite** against the
  rehearsal database — `E2E_BASE_URL` points the suite wherever that stack serves. This is the
  only place E2 runs; see step 5.
- **(0d)** Provision the Grafana Discord contact point (`DISCORD_WEBHOOK_URL` is already a
  repository secret) and install the nightly `pg_dump` + MinIO mirror from
  `docs/architecture/backup-restore.md`. The contact point itself is provisioned from the repo
  since `ace0d2fd`; what this step still needs is the webhook value in `infra/.env.prod` on Loki.
  `infra/.env.prod.example` lists it, and since 2026-09-28 the production overlay requires it
  (`:?`) and the deploy refuses the `discord.invalid` placeholder, so a blank value stops the
  deploy instead of silently routing every alert nowhere.
- **(0e) Set `AUTH_PROXY_SECRET` — one value, two places — before the first deploy that carries
  it.** A user action; nothing in this repository can set either. Generate it once
  (`openssl rand -hex 32`) and put the same string in `infra/.env.prod` on Loki **and** in the
  Vercel project's server-side environment (Production, and Preview if previews sign in), per
  `deploy-loki.md` §2.5. The actor host refuses to start in production without it (or with the
  base file's dev default, or shorter than 32 characters), and the prod overlay's `:?` stops the
  compose render first. Only a request carrying it has its `x-cellar-client-ip` believed, so a
  Vercel side that lacks it — or holds a different value — does not break sign-in, but puts every
  user back in one rate-limit bucket (W4 security F3). Check it before step 6: sign in through
  the Vercel origin from a machine whose public address you know, then on Loki
  `docker exec <postgres> psql -U cellar -d cellar -Atc "select ip_address from session order by created_at desc limit 1"`
  — better-auth records the address its limiter keyed on. It must be yours; an AWS address is
  Vercel's egress, which means the two values differ.
- **(0f) Copy the objects before the freeze** (added 2026-09-28). On the cutover host, with the
  production target, `SOURCE_MODE=storage-api` and the default `FILES_MODE=full`:
  `cutover.sh preflight dump restore transform-a files`. This moves production's 2,331 objects /
  4.3 GiB into the production bucket — budget 10–15 minutes — while the site is still live. Its
  database rows are scratch (step 3's `restore` resets them); the objects stay, so step 3's
  `files` re-verifies each one locally against Nhost's MD5 and copies only the delta.
  `scripts/cutover/README.md`, "Files: two modes, and the two-step cutover", has the fallback
  (`FILES_MODE=rows-only` in the window, then a `files` run before step 6) and what a rows-only
  row does not promise. **And rotate the GCP service-account key** stored in production's
  `admin.credentials` (e4-decisions.md decision 4's "empty" was measured locally only): the
  cutover drops the table, but the key is in every Nhost backup and in the cutover's own dump.

**The cutover:** (1) announce freeze; (2) final Nhost dump (`cutover.sh preflight dump`, with
`SRC_DSN` set — preflight again so that the row-count snapshot `smoke` diffs against is taken
during the freeze, from the same source as the dump, rather than days earlier); (3) E1 transform on
Loki (`cutover.sh restore transform-a files transform-b users transform-c migrate baseline`;
`migrate` was `lane`, and the old name still works). **This is where production's migration
ledger is seeded:** `migrate` runs `db:migrate` against the freshly transformed database, which
adopts it (baseline recorded, the five idempotent migrations re-applied, the five the frozen
transform produces probed and recorded as `adopted`) and applies every migration after the
horizon, so `cellar_meta.schema_migrations` leaves the cutover with one row per directory in
`packages/db/migrations` at the deployed commit. `baseline` then proves the result is
`tables.ts`, and `smoke` (step 5) fails unless `db:migrate --status` reports nothing pending.
Nothing seeds the ledger by hand, and `restore` drops `cellar_meta` with the schemas it resets, so
a re-run from `restore` re-seeds it. **Every schema change after E4** reaches production through
`deploy-loki.yaml`, which runs `db:migrate` from the new actors image before any new container
starts and stops the deploy if it fails (`deploy-loki.md` §4.1 has the manual form; see
`e4-decisions.md` decision 16);
(4) deploy `services/*` per `docs/architecture/deploy-loki.md §4` — a manual
`docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d`,
which is the path a first deploy takes whether or not a self-hosted runner exists;
(4b) **re-embed every migrated vector** — `deploy-loki.md` §4.2, added 2026-09-28. Legacy embedded
with `gemini-embedding-2-preview` and this stack with `gemini-embedding-2`, so every migrated
`item_vectors` / `recipe_vectors` row (all with `embedding_model` NULL) is in the wrong space until
`VectorReembedJobActor` re-embeds it. Count them first (the query is in §4.2), check the count
against the `embedding` seam's monthly budget, then run a canary and the rest:
`docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec actors bun scripts/operator.ts reembed --max-vectors 10`,
then the same without `--max-vectors`. Exit codes: **0** done — the job completed with no budget
stop and no failed rows, and done still means §4.2's stale-count query reads **zero**, which is
what to finish on; **3** stopped on the embedding budget — raise the budget and rerun; **4**
completed but rows failed to re-embed — check the job's failures (`vector_reembed.row_failed`),
fix the cause and rerun (1 is a failed/cancelled job or a lost watch, 2 usage; table in §4.2).
Every rerun is plain `reembed`, not `--job-id`: a fresh job selects only the rows still not on
the configured model. It creates no vector for an item that has none and does not touch
`place_vectors` / `category_vectors`;
(5) **verify — not E2.** `cutover.sh smoke` (read-only structural assertions), then
`deploy-loki.md §5`'s off-LAN checks, then one manual sign-in and read **as a real account**. The
E2 suite must **not** be pointed at production: it signs in as `test@test.com`/`test2@test.com`
with password `123456789` and writes cellars, items and friend requests. Those accounts do not
exist in production and seeding them there is a live credential hole
(`scripts/cutover/README.md:48-53`); (6) flip Vercel env to Loki + deploy the new frontend — this
is where (0a)'s second gate is lifted: restore the release app's bypass on the `production`
ruleset (or fast-forward `production` by hand), and only then merge the pending release PR;
(7) watch for 24h — alerts land in the Discord contact point from step 0d, and in Grafana's own
Alerting page regardless. Start the day-30 checklist (decision 11) here. Once the watch is over,
delete the cutover's `$WORK` directory: its dump holds every production row, `admin.credentials`'
private key included.

**Rollback:** redeploy the pre-cutover frontend commit against Nhost; data written to Loki in
between is abandoned. ~~Production Nhost is unaffected by anything in this repository.~~
**Corrected 2026-09-27:** production Nhost is unaffected by this runbook's scripts — they only
read it — but not by the repository: Nhost Cloud deploys it from a branch of this repository, so it
stays a valid rollback target only while (0a)'s first gate holds, and that gate must hold until
Nhost is deleted (`e4-decisions.md` decision 15). Note the
rollback of record is the **`82450ad1` checkout**, not the `nhost/` directory on this branch:
`functions/` was deleted at `51881a0c`, so `nhost up` here brings up nine of ten containers and
the functions container crash-loops. Nhost stays up read-only for 30 days, then is deleted.

---

## 7. Definition of done (baseline for every PR)

- `bun run typecheck` and biome clean. (Was `pnpm typecheck`; see the toolchain note at the
  top of this file — every `pnpm` command in this document is now `bun run`.)
- Vitest: new actors have tests through the Dapr-less harness; every viewer-dependent method has
  owner / friend / stranger cases.
- Single-writer test green.
- Schema snapshot updated **only** in B/C/A7 workstreams, with the diff called out in the PR.
- Anything touching a search actor, the outbox, or a job actor has an integration test on compose.
- Anything touching a page has Quick Visual Check evidence.
- §6.0 status table updated in the same PR.

---

## 8. Conventions

### 8.1 Repo layout

```
services/client      the Next app. Moved out of the repo root by R1; the root is
                     no longer a workspace package at all.
services/api         graphql-yoga + Pothos; no database access
services/actors      Dapr actor host + better-auth; the only process with a Postgres connection
packages/db          Drizzle schema, migrations (generated + hand-written lane), single-writer test
packages/contracts   Ctx, actor interfaces, category tags, shared DTOs
packages/policy      visibility rules; imported by services/actors only
packages/schema      Holds the printed schema.graphql and the gql.tada env generated from it.
packages/e2e         the Playwright browser suite and its fixtures.
```

**R1 settled the A2 open question** left in the line above ("moved from root, or
left at root"): the app is `services/client`, and the repo root is orchestration
only — no `src/`, no Next dependencies, and no `"/"` entry in the workspace
globs (then `pnpm-workspace.yaml`; under bun, the root `package.json`'s
`workspaces.packages`). Deploying the frontend therefore needs the Vercel
project's **Root Directory set to `services/client`**; that is a dashboard
setting, not a file in this repo, and nothing here can change it.

**Corrected 2026-09-08.** There is no `packages/shared` at the repo root. `@cellar-assistant/shared`
resolves to **`functions/_packages/shared`**, and `@cellar-assistant/typescript-config` to
`functions/_packages/typescript-config`; both reach the root only through `node_modules` symlinks.
`functions/` is a separate pnpm context pinned to pnpm 10 that must stay standalone-installable, so
the printed schema must not go there — and D9 deletes `functions/` outright. Hence `packages/schema`.
There is also a root `shared/gql/graphql-env.d.ts`, which is generated output, not a package.

### 8.2 `ctx`

```ts
type Ctx = {
  viewerId: string | null;
  kind: 'user' | 'admin' | 'system';
  requestId: string;
};
```
First argument of every actor method. `system` is constructed only by `OutboxActor` and job
actors. `admin` comes from a better-auth role claim. Resolvers never decide visibility; they pass
`ctx` through.

### 8.3 Naming

**Relay `Node` and global ids: deliberately NOT adopted (decided 2026-09-08).**
A7 raised this because half-adopting it for `Item` alone would bind every later aggregate and push
the D workstreams off raw uuids. Checked against the actual client: `src/lib/urql/client.ts`
configures `@urql/exchange-graphcache`, which normalises on `__typename` + `id` and uses explicit
`keys` overrides for id-less types. It has no dependence on Relay `Node`. So global object
identification buys the cache nothing here, and raw uuids stay in the frontend. **Relay
*connections* are still required on every list field (§1.5) — that is pagination shape, not `Node`.**
If this is ever revisited, it must be decided once for all aggregates, not per type.

**Two conventions A4 established that are load-bearing, not stylistic:**

- **Actor file path is derived from the class name.** `CellarActor` → `services/actors/src/actors/cellar-actor.ts`
  (or a `cellar-actor/` directory). The single-writer containment test resolves ownership through
  this derivation; an actor at any other path fails it.
- **Import Drizzle operators from `@cellar-assistant/db/orm`, never from `drizzle-orm`.**
  `sharedWorkspaceLockfile: false` (as it was before R1 flipped it to true), plus better-auth pulling its own `zod`, gave `services/actors` a
  physically distinct `drizzle-orm` install from `packages/db`. Passing a table from one to an
  operator from the other produces a screen-long structural type error that looks like a schema bug
  and is not. `packages/db/src/orm.ts` re-exports the single correct copy.

- Actors: `<Thing>Actor`, categories as a static `category` field. Registry actors end in
  `RegistryActor` or `CreationActor`.
- GraphQL: queries are nouns (`cellar`, `myCellars`, `itemSearch`), mutations are imperative
  commands (`addItemToCellar`, `checkIn`, `acceptFriendRequest`). No `insert_`, `update_`,
  `delete_` prefixes, no `_by_pk`, no `_aggregate`.
- Every list field is a Relay connection: `first/after`, `pageInfo`, `totalCount` where cheap.
- Mutations return `<Command>Result` unions via `plugin-errors`: the payload or a typed error
  (`NotFound`, `Forbidden`, `Conflict`, `Validation`, `BudgetExceeded`).

### 8.4 Idempotency

Any method reachable from the outbox takes an idempotency key (the outbox row id by default) or is
naturally idempotent on a unique constraint. Document which in the method's JSDoc.

### 8.5 Actor call graph and long operations

- **Reentrancy is off.** Dapr will deadlock an actor that is called back within its own turn.
  The allowed call direction is: resolver → any actor; job → entity / registry / search; registry
  → entity; entity → `FileActor`, `BudgetActor`, `EmbeddingActor`, `BrandRegistryActor`,
  `BarcodeActor`, and other entity actors **only via the outbox**. Entity actors never call
  collection, view, or search actors synchronously except `CellarActor` → `EmbeddingActor`.
  **This sentence was false and is corrected here.** `no-external-calls.test.ts`'s `GUARDED`
  list covers **3 of 47 actor modules**, so the test asserts the import graph of a twentieth of
  the host, not of `services/actors`. The real edge set is also wider than the five listed: the
  four search actors reach `EmbeddingActor` through `lib/embeddings.ts`, search reaches
  `BudgetActor`, and `lib/ai/images.ts` reaches `FileActor` — roughly nine edges, not five plus a
  disputed sixth. Whether to widen `GUARDED` to all 47 or to accept the narrower guard is now
  decision 9 in [`e4-decisions.md`](./e4-decisions.md).

  **Re-measured 2026-09-18 by the E-series architecture review. "3 of 47" is the wrong denominator
  twice over, and it makes the remaining task look far larger than it is.**

  - **Wrong denominator.** 47 is every actor module, but only **18 modules in `services/actors/src`
    call `invokeActorMethod` at all** (13 actor modules + 5 in `lib/`, 27 call sites). The other 29
    have no edge to guard. `OutboxActor` is the 18th and is dynamic by design (`row.targetActor`),
    so it is unguardable and correctly excluded — leaving **17 modules that can be pinned**.
  - **Wrong coverage.** `GUARDED` is not the only fence: four bespoke per-actor pins exist in test
    files and are invisible to a grep for `sidecarTargets` or `GUARDED`. Counting them, **8 of those
    17 are pinned** (`item-actor.ts`, `lib/file-verification.ts`, `recipe-actor.ts`,
    `menu-match-job-actor.ts`, `lib/menu-matching.ts`, `place-refresh-job-actor.ts`,
    `onboarding-reprocess-job-actor.ts`, `lib/recipe-photo-matching.ts`), and three more modules are
    pinned as having *no* edge (`user-actor.ts`, `menu-scan-actor.ts`, `recipe-photo-job-actor.ts`),
    which is equally load-bearing.
  - **The actual gap is nine named modules**, not forty-four: `brand-registry-actor.ts`,
    `cellar-actor.ts`, `google-places-actor.ts`, `item-onboarding-actor.ts`,
    `overture-reload-job-actor.ts`, `place-actor.ts`, `place-creation-actor.ts`, `lib/ai/images.ts`,
    `lib/embeddings.ts`.

  The structural point stands and is the one worth acting on: **this repo already solved exactly
  this problem once, for writes.** `packages/db/src/writers.ts` + `writers-scan.ts` declare a total
  table→writer map and scan the whole tree against it, so a new write anywhere fails a test *and*
  typecheck. Edges have no equivalent — they have an allow-list plus four hand-written pins, which
  is why the count above had to be re-derived by hand. The proportionate fix is a single
  `ACTOR_EDGES` table scanned the same way, not widening `GUARDED` file by file.
- **Anything over a few seconds is outbox-driven, not request-driven.** The exceptions are
  `ItemOnboardingActor.start` and `PlaceCreationActor` (the user is waiting on an AI result);
  set the API's actor-invocation timeout to 120s for those calls and accept the wait.
- Actor idle timeout: 10 minutes for entity actors, 5 for search, 24h for `GeocodeActor`.
  Configure in the actors app's Dapr actor runtime options, not per actor.

### 8.6 Hand-written SQL lane

`drizzle-kit generate --custom --name=<thing>`. Used for: the four search functions, pgvector
distance helpers, `geography` columns, column-level grants, and anything Drizzle can't express.
~~Every hand-written migration has a matching `down`.~~

**Corrected 2026-09-27: migrations are forward-only, and none has a `down`** — not one of the ten
post-baseline migrations ever did, and the sentence above was never true. That is now the
decision rather than an omission:

- **Nothing would run a `down`.** drizzle-kit has no down migrations, and `db:migrate` (below)
  only moves forward. A `down` file would be SQL that no build, test or rehearsal ever executes —
  the one kind of migration guaranteed to be wrong the day it is needed.
- **E4's rollback is not a schema rollback.** It is "point Vercel back at Nhost"; the Loki
  database is abandoned, not unwound (§E4, "Rollback"). Post-E4, undoing a change is a new
  forward migration, reviewed like any other, or a restore from the nightly `pg_dump`
  (`backup-restore.md`) for anything destructive.
- **Immutability is enforced.** The ledger records each migration's sha256, and `db:migrate`
  refuses a migration whose file changed after any database applied it, so "edit the migration"
  is not a rollback path either. Several lane files keep their inverse as a commented
  `-- DROP FUNCTION …` block; that is documentation, not a `down`.

**How a migration is applied — one path, with a ledger (2026-09-27).** `bun run db:migrate --url …`
(`packages/db/src/migrate/`) applies every migration under `packages/db/migrations` that the
database's `cellar_meta.schema_migrations` does not record, in name order, each in its own
transaction with its ledger row, under a per-database advisory lock. It refuses a changed file
(checksum), a pending migration older than the newest recorded one (out of order), and anything
that cannot run inside a transaction (`CONCURRENTLY`, top-level `BEGIN;`/`COMMIT;`). It is the
single apply path: `transform/run.sh` (and so `test-db.sh` and CI), `cutover.sh`'s `migrate`
phase (formerly `lane`), and the dev lane's `bootstrap` / `dev:migrate`; `dev:doctor` reports
pending migrations. CI's `db:drift` step fails if `drizzle-kit generate` would write a migration.

- **The transform is frozen at the ledger's horizon**, `20260927215215_budget_attribution_and_reservation_index`
  (`TRANSFORM_HORIZON` in `ledger.ts`; `transform-freeze.test.ts` pins every numbered file and the
  checked-in dump). A schema change is a new migration, applied to every database — fresh,
  long-lived and production — by `db:migrate`, and is **never** mirrored into `transform/` any
  more. The "every post-baseline migration needs a transform mirror" rule and the lane marker are
  both retired. A transform edit that changes only how Nhost *data* is converted (a guard, an enum
  value production turns out to hold) is still allowed: update the pin in the same commit and show
  the `baseline` phase still passes.
- **Adoption.** A database built before the ledger (every transform-built one, `cellar-stack`,
  worktree clones of it) is adopted the first time `db:migrate` sees it: the baseline is recorded,
  the five idempotent ex-lane migrations are re-applied, and the five the transform mirrors are
  probed — present → recorded as `adopted`, absent → applied and re-probed, half present →
  refused. All in one transaction, and only on a database that looks transform-built (no `auth`,
  no `hdb_catalog`, and `outbox`/`files`/`"user"` present). After the horizon there is no probing.

---

## 9. Deferred with intent

| Item | Why deferred | Trigger to revisit |
|---|---|---|
| Item-table consolidation (`items(type)` + detail tables) | design problem, not mechanical; safe behind the `Item` interface | after cutover, as its own workstream. **Re-measured at `be70bccf` (after Wave 3a, `a8757dc4..be70bccf`):** two non-test modules under `services/actors/src` import the per-type tables — `actors/item-actor.ts` (its create/update switches name each table, because the single-writer scan resolves a write only through a named import) and `lib/item-bindings.ts`, whose `ITEM_TABLES` is what `barcode-actor`, `item-onboarding-actor`, `item-search-actor`, `recipe-actor`, `user-actor`, `lib/tier-list-entries` and `lib/search-testing` now index instead. The per-type item FKs go through `itemArc`/`ARCS` (`lib/item-arcs.ts`, `4e6d40bd`, `6cf331af`), and `lib/item-arcs.test.ts` forbids hand-written arc maps and `_id` names in `sql.raw`. The grep below matches 16 non-test modules at `be70bccf` (22 at `a8757dc4^`), but only four on a non-comment line: `item-actor.ts`, `item-bindings.ts`, `search-testing.ts` (a per-type seed insert) and `lib/ai/prompts.ts` (the place-review prompt's prose). Re-measure with `grep -lE '\b(beers\|wines\|spirits\|coffees\|sakes\|teas)\b\|\b(beer\|wine\|spirit\|coffee\|sake\|tea)(Id\|_id)\b'` before scoping it. What adding a type costs today, as opposed to consolidating: §9.1 |
| Dapr Workflows for the pipelines | reliability of the JS SDK unvalidated | steps are already idempotent actor calls; adopt per pipeline when validated |
| Deleting the 8 uncalled functions' logic | "full migration" was chosen; confirm no out-of-band callers | 30 days post-cutover, check Grafana for zero invocations, delete |
| Rewriting the two big search SQL functions in TypeScript | correctness first; SQL bodies kept, weights moved | when a ranking change is needed |
| `friends` as one row per pair | not required by any rule | if two-actor acceptance proves noisy |
| `admin.credentials` | resolved: held a live GCP service-account key in production, found in the 2026-09-28 rehearsal | dropped at cutover by migration `20260928194604_drop_admin_credentials` (e4-decisions.md decision 4); rotate the key in GCP by hand |
| Taste profile feature | specified in memory, never built; no route exists | separate feature work after cutover, on `RankingsActor`-style view actors |
| `RecipeSearch` / `RecipeDashboard` advanced search UI | never mounted | delete in D6 unless wanted |

### 9.1 Adding a seventh item type — measured, not estimated

**Measured 2026-09-28 at `be70bccf`**, clean tree, in a throwaway worktree: a `MEAD` type was added
to `ITEM_TYPES`, then each root edit below was made in turn, and after each step
`turbo run typecheck --force` and the unit suites that need no Postgres were run (contracts, db,
api's `item.test.ts` / `item-spec-parity.test.ts` / `patch-policy.test.ts`, the client's
`src/lib/dev-checks/item-spec.test.ts`, actors' `lib/item-arcs.test.ts` / `lib/item-bindings.test.ts`).
The Postgres-backed actor suites were **not** run, so "a DB-backed test tells you" below is read off
the test source, not observed.

**39 files** for a type that brings no new Postgres enum, reference table or brand type: 25 that
nothing flags if you forget them, 8 the toolchain flags, and 6 tests that pin the six and fail. Wave
3a (`a8757dc4..be70bccf`) is what made the middle column possible — before it, one attribute fact
was hand-written in up to nine places (`packages/contracts/src/item-types.ts`, module doc).

**Must edit — nothing fails if you forget (25):**

| Path | Why |
|---|---|
| `packages/contracts/src/items.ts` | `ITEM_TYPES`, the root; everything in the next table follows from it. The same file's `GENERIC_ITEM_KINDS` and `ITEM_ATTRIBUTE_KEY` are flagged (contracts test, typecheck) |
| `packages/db/migrations/<ts>_<name>/migration.sql` + `snapshot.json` (2 new) | the table, the `item_type` label, and a `<type>_id` FK + index on each of the ten arc tables, their `num_nonnulls` checks, the generated `type` `CASE` on `cellar_items` / `item_favorites` / `tier_list_items`, and the `generic_items` and `place_menu_items.detected_item_type` checks — the shape of `e73bab89`, `c2573ef5`, `e5d19b69` |
| `packages/db/src/schema/tables.ts` | mirror of the migration, verified against `drizzle-kit pull` (`packages/db/README.md`). A missing arc column is loud — `itemArc` throws at import (`services/actors/src/lib/item-arcs.ts`) — and a stale `num_nonnulls` fails `item-arcs.test.ts`; the generated `type` `CASE` and the `generic_items` check were caught by nothing DB-free (`services/actors/src/lib/item-spec-schema.test.ts` holds `GENERIC_ITEM_KINDS` to the live check) |
| `packages/db/src/schema/relations.ts` | the new table's relations; typecheck and the db tests passed without them |
| `packages/contracts/src/menu-scans.ts` | `SCANNED_ITEM_TYPES` is its own list; nothing holds it to `ITEM_TYPES` |
| `services/actors/src/lib/menu-matching.ts` | `ITEM_TYPE_OF` is a `Partial`; an unmapped scanned type searches every type instead of its own (`itemTypes: null`) |
| `services/actors/src/actors/item-actor.ts` | `create`'s insert switch and `#updateRow` name each table and have no exhaustive default, so typecheck passed with a seventh type and both silently write nothing for it. The DB-backed round trip in `item-actor.test.ts` (`220db173`) is what would catch it |
| `services/api/src/schema/item.ts` | `Bags` / `bags()` drop an unlisted bag with no error. The Pothos object and input types and the `Create`/`UpdateItemInput` fields are flagged by `item-spec-parity.test.ts`, `TYPE_NAMES` by typecheck |
| `services/client/src/components/cellar-api/itemTypes.ts` | the client's own `ITEM_TYPES`, route segment and label; the client does not import contracts, so a new GraphQL `ItemType` value type-checks without it |
| `services/client/src/lib/api/tier-lists.ts` | `TierListEntryType`, `ITEM_ENTRY_TYPES`, `LIST_TYPE_LABELS` — a separate list |
| `services/client/src/lib/api/{items,brands,favorites,search}.ts` (4) | each fragment's `... on <Type> { … }` selection |
| `services/client/src/components/item-api/ItemAttributes.tsx`, `brand-api/BrandItemList.tsx`, `favorites-api/FavoritesList.tsx`, `search-api/ItemHitCard.tsx` (4) | a `__typename` branch each, falling through to nothing |
| `services/client/src/app/(authenticated)/<type>s/{page,[itemId]/page,[itemId]/edit/page}.tsx` and `cellars/[cellarId]/<type>s/{add/page,[itemId]/page,[itemId]/edit/page}.tsx` (6 new) | the per-type routes; `/add/[itemType]` is already generic |

**Must edit — the toolchain tells you (8):**

| Path | What flags it |
|---|---|
| `packages/contracts/src/item-types.ts` | typecheck — `ITEM_TYPE_SPECS` `satisfies Record<ItemType, ItemTypeSpec>` |
| `services/actors/src/lib/item-bindings.ts` | typecheck — `ITEM_TABLES` and `ITEM_BINDINGS`; until both exist, every module that indexes `ITEM_TABLES` or `ITEM_ATTRIBUTE_KEY` errors too (50 errors in 18 files after adding only the `ITEM_TYPES` entry and the spec), so the error list looks far bigger than the edit |
| `packages/db/src/schema/index.ts` | `packages/db/src/writers.test.ts` ("can see the actor sources and resolve schema exports": 64 exports, 63 in `tables`) |
| `packages/db/src/writers.ts` | typecheck, once `index.ts` lists the table — `TABLE_WRITERS` `satisfies Record<TableName, Writer>` |
| `packages/schema/schema.graphql` | `services/api/src/schema/schema.test.ts` snapshot; regenerate with `bun run --filter @cellar-assistant/api schema:print` (the build then regenerates `graphql-env.d.ts` and the client's `graphcache-schema.generated.ts`; not counted) |
| `services/client/src/components/item-api/itemTypes.ts` | typecheck, once `cellar-api/itemTypes.ts` has the type |
| `services/client/src/components/item-api/itemFormRules.ts` | typecheck, and `src/lib/dev-checks/item-spec.test.ts` ("covers exactly the spec's item types") |
| `services/client/src/components/item-api/AddItemChooser.tsx` | typecheck — `BLURB: Record<ApiItemType, string>` |

**Tests that pin the six and fail (6):** `packages/contracts/src/item-types.test.ts` (golden bags —
typecheck — and the `REQUIRED_ITEM_ATTRIBUTES` / `ITEM_ATTRIBUTE_KEY` / `GENERIC_ITEM_KINDS`
cases), `packages/db/src/schema/item-country-fk.test.ts`, `services/actors/src/lib/item-bindings.test.ts`,
`services/actors/src/lib/item-arcs.test.ts` (two fragment cases written for six),
`services/actors/src/lib/tier-list-entries.test.ts` and `services/actors/src/actors/item-actor.test.ts`
(both typecheck, on `Record<ItemType, …>` fixtures).

**Only if the type brings them:** a Postgres enum adds `packages/contracts/src/enums.ts`,
`services/api/src/schema/enums.ts` and a row in `services/client/src/lib/dev-checks/static-options.test.ts`;
a reference table adds `packages/contracts/src/reference.ts`, `services/actors/src/lib/ai/vocabulary.ts`,
`services/actors/src/lib/reference-rows.ts`, `services/api/src/schema/reference-data.ts`,
`services/actors/scripts/seed.ts` and `services/actors/scripts/reference-data.json` (plus its writer in
`packages/db/src/writers.ts`); a brand type adds the `brand_types` label (migration + `tables.ts`),
`packages/contracts/src/enums.ts` and `services/client/src/components/brand-api/BrandsIndex.tsx`. A test
that seeds the new type through `services/actors/src/lib/search-testing.ts` needs its switch arm.
