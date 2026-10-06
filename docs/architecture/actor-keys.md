# Actor keys: what each key serialises, and whether it should

Written in Wave 6 of the pre-cutover hardening (2026-09-28), against `291bcb97` and `e5daa1cc`.
Two things live here:

- the two decisions that wave made: re-keying `PlaceCreationActor`, and keeping `BudgetActor` a
  singleton with a database lock added behind it;
- an audit of every actor type in `services/actors/src/actors/registry.ts`, with a verdict for
  each.

## What a key buys, and what it costs

Dapr runs **one turn at a time per actor id**. That is the whole of what a key gives you: every
call addressed to the same id waits for the one in front of it. Everything else follows from it.

- **A key is a lock, and it is held for the whole turn.** An external call made inside a turn
  holds the lock for as long as the call takes. That includes a model call, a Google or Photon
  request, a synchronous hop to another actor, and a `BudgetActor` hop. So a key's cost is:
  (how many callers share it) × (the longest thing a turn does).
- **There is no reentrancy.** It is off (`services/actors/src/index.ts:113-115`). An actor that
  calls back into itself, directly or through another actor, deadlocks until the call times out.
  Nothing may therefore hold two actor keys and wait on a third that wants the first.
- **A key only holds while Dapr's placement agrees who owns it.** During a rolling deploy or a
  placement-table update, two hosts can briefly both run turns for one id. A correctness property
  that rests *only* on the key is advisory for that window. Where that matters, the database has
  to hold the invariant too: a unique index as the tripwire, or an advisory lock.
- **The in-process test harness has no sidecar.** `src/lib/testing.ts` builds plain classes, so no
  key-based serialisation can be proved there. A database lock can be: genuinely concurrent
  transactions block on it in the harness exactly as they do in production.

The rule used below is §1.5's: a key should serialise **exactly the things that must not
interleave, and nothing else**. Where "the things that must not interleave" has no exact key
(a fuzzy predicate, or a set of kinds), that serialisation belongs in the database, not in a wider
actor key.

## Decision 1: `PlaceCreationActor` is keyed by the creator

### What was wrong

`PlaceCreationActor` was one global activation (`PLACE_CREATION_ACTOR_ID = "singleton"`). Its
turn does four things in order:

1. the rate limit (25 places per user per 24 hours);
2. the duplicate check (`find_duplicate_places`);
3. an AI review, run in-turn with a 120s budget (§8.5 allows this);
4. `PlaceActor(newId).create`.

So every user's creation queued behind every other user's AI review. The API gives `createPlace`
120s (`PlaceCreationActorDescriptor`). The third concurrent creator anywhere in the system could
therefore wait longer than that, be told its request failed, and still have its place created
when its turn finally ran. (Finding HIGH-1 of the Dapr calling review.)

### What the singleton was actually serialising

Two different things, with different right answers:

| Invariant | Who contends | Exact key? | Where it lives now |
|---|---|---|---|
| The per-user rate limit (count, then insert) | one user's own submissions | yes: the user | `PlaceCreationActor(viewerId)` |
| "No two near-duplicate places" | any two users near the same spot | no: a fuzzy predicate over name and distance | advisory locks in `PlaceActor.create` |

### The design

**The key is the viewer id** (`placeCreationActorId(viewerId)` in
`packages/contracts/src/places.ts`).

- One user's submissions still run one at a time. So the rate-limit count and the insert it
  guards cannot interleave with that user's next submission, and the limit stays exact.
- An AI review only ever blocks the user who asked for it.
- Different users run in parallel.

**The key is an address, not a credential.** `createPlace` refuses any ctx whose viewer is not the
actor's key, *before* reading the rate limit (`#requireOwnKey`). Without that check a caller could
spend, or be refused from, another user's bucket, or queue behind another user's review.

- An `admin` is held to the check too. §1.6's bypass is about seeing rows, not about becoming
  somebody else. An admin creates under their own key, where the rate limit does not apply to
  them.
- An anonymous caller is refused by the API resolver before anything is addressed
  (`services/api/src/schema/place.ts`), with the words the actor would use. Who could call
  `createPlace` before this change: signed-in users only. The actor refused `viewerId === null`
  and the `system` ctx. Both refusals are unchanged.
- `findDuplicates`, the read-only live check, still only requires a signed-in viewer. It touches
  no bucket and no production caller reaches it: the API uses `DuplicatePlaceSearchActor`.

**The cross-user duplicate race moved into `PlaceActor.create`'s transaction**
(`place-actor.ts`, `#insert`):

1. `pg_advisory_xact_lock` on every geocell the duplicate block distance can reach
   (`lockPlaceGeocells` → `lib/geocell.ts`), taken in one sorted order.
2. The same `find_duplicate_places` check again, under those locks, excluding the creation's own
   §8.4 id.
3. The insert.

The locks are held until the insert commits: milliseconds, never the AI review.

- Of two near-duplicate creations, the second waits on a shared cell for the first to commit, and
  then sees its row.
- The refusal is the same `ConflictError` with the same wording (`duplicatePlaceConflict`), so what
  a user sees is unchanged.
- `PlaceCreationActor` still runs the check early, before the review, so an obvious duplicate is
  refused without paying for one. It is no longer what makes the rule sound.

**§8.4 idempotency is unchanged.** A replayed `placeId` returns the existing row, and N concurrent
calls carrying one `placeId` converge on `places_pkey` through `#createOrConverge`. The geocell
recheck excludes the creation's own id, so a sibling of the same creation never looks like a
duplicate of it. The existing acceptance test (8 simultaneous calls, one `placeId`) still passes:
7 converged via `places_pkey`, 1 settled.

**No data had to move.** `PlaceCreationActor` keeps nothing in Dapr actor state
(`lib/no-actor-state.test.ts` holds that for every actor). It registers no timer or reminder, and
its only instance fields are its two injected seams. A deploy that changes the key orphans
nothing: the old `"singleton"` activation idles out after 10 minutes.

### The grid, and how the cell size was derived

`find_duplicate_places(name, lat, lng, 200, 0.3, 5)` returns active places within 200m whose
trigram similarity is at least 0.3, the top 5 by similarity. The **blocking** rule, preserved from
`createUserPlaceAction`, refuses a candidate only when it is **> 0.7 similar and < 50m away**
(`DUPLICATE_BLOCK_SIMILARITY`, `DUPLICATE_BLOCK_DISTANCE_METERS`). The 200m near-misses are
informational: they come back in `nearbyDuplicates` and block nothing. So two creations can only
race *each other* when they are under 50m apart, and **the radius the locks must cover is 50m,
not 200m**.

**The property the locks rest on.** `geocellsWithin(A, r)` contains `geocellOf(B)` for every B
within r of A. Both creators lock their own full set, and B's set always contains B's own cell. So
any two creators within r of each other share at least one lock. Cell size never enters this
argument: it only changes how many locks a creation takes and how much unrelated contention there
is.

The grid (`services/actors/src/lib/geocell.ts`):

- **Rows** are fixed at 200m of latitude (`GEOCELL_ROW_DEGREES`). There are 100,188 of them.
- **Columns** are per row. Each row is split into as many columns as keep a column at least 200m
  wide *at the row's poleward edge*. That is 200,375 columns at the equator, and exactly 1 in each
  row touching a pole.
- **The bounding box is conservative.**
  - Latitude uses the shortest meridional degree (110,574m).
  - Longitude uses `111,319 · cos φ`, where φ is the box's most poleward latitude, which gives the
    shortest parallel degree in the box.
  - The radius is multiplied by 1.5 to absorb the difference between this flat-box reasoning and
    PostGIS's spheroidal `ST_Distance`.
  - With that factor the box is 150m across. **A 200m cell is the smallest round size wider than
    the box**, so the box spans at most two rows and two columns.
- **Rows and columns are found by monotone functions**, and every index between the box's edges
  is enumerated. It never takes "the 3×3 neighbours", which is an approximation of the same thing.
- **The antimeridian.** The box's longitude interval is split at ±180° and each piece is walked
  separately. ±180 fall in one cell, and a creation at 179.99999° also locks column 0.
- **The poles.** A box that touches a pole, or whose longitude half-width reaches 180°, takes
  every column of every row it touches. Near a pole that is a handful of cells, because the polar
  rows have very few columns.

**Measured** (`geocell.test.ts`, plus a sweep every ~40m of latitude, with the antimeridian
included):

- 1 to 4 locks away from the poles, 5 at worst beside one. The test enforces `GEOCELL_MAX_LOCKS = 8`.
- A brute-force check over 4,009 origins × 12 random points under 50m away (random, antimeridian
  and polar origins) finds every point's cell in its origin's set.

**Lock keys** use the two-`int4` form of `pg_advisory_xact_lock`
(`ADVISORY_LOCK_NAMESPACE.placeGeocell`: namespace in the high bits of key 1, the row in its low
20 bits, the column in key 2). See "Advisory lock namespaces" below.

**Deadlock.**

- Every geocell taker sorts its keys the same way (`lockAll`) and takes one lock per statement.
  Postgres does not promise to evaluate a volatile target-list function in `ORDER BY` order, so a
  single `unnest … order by` statement would not guarantee the order.
- No transaction takes a geocell lock together with any other advisory lock.
- The locks are taken inside `PlaceActor(newId)`'s own turn, which holds no other actor's key.

### Rejected: a geohash-keyed `PlaceCreationActor`

This is §2.1's original escape hatch ("key by geohash cell instead"). It is wrong for two reasons.

- **Boundary misses.** Two near-duplicates a metre apart on either side of a cell edge land in two
  different activations, and nothing serialises them. That is exactly the race the singleton
  existed to close. The only fix is for one creation to hold its *neighbours'* locks too. An actor
  key cannot do that, because a turn holds exactly one key.
- **Holding neighbour keys means nested calls, and there is no reentrancy.** Actor A holding its
  cell and calling actors B and C for theirs, while B holds its own and calls A, is a deadlock
  that lasts until the invocation timeout. A consistent order does not rescue it: an actor cannot
  release its own key mid-turn, so it cannot wait on a lower-ordered neighbour without already
  holding a higher one. Postgres advisory locks can be taken as a sorted set inside one
  transaction and released together at commit. Actor keys cannot.

The geohash actor would also still serialise every creation in a busy cell behind one AI review.
The per-creator key never does.

### Tests (`place-creation-actor.test.ts`, `lib/geocell.test.ts`)

| Test | What it proves | Negative control |
|---|---|---|
| Two different users create the same place at once. Different activations, real concurrent transactions, released together into `PlaceActor.create` and held open before commit. | Exactly one row. The other user gets `ConflictError` "a very similar place … it is place `<id>`". | Lock removed: `expected [2 rows] to have a length of 1`. Held open before commit, the unlocked version made 2 rows in 4 of 4 runs. |
| The same race with two points about 1m apart in different geocells. | The boundary is caught. | Locking only the creator's own cell: this test fails and the same-point test still passes. |
| B's creation completes while A's AI review is hung. A's own second submission waits. Dapr's per-id turn order is reproduced in process. | Fan-out across users, and serialisation within one user. B took 8 to 12ms while A was blocked. | — |
| A ctx whose viewer is not the key, including an admin. | Refused before the review or the rate limit. | Key check removed: "promise resolved … instead of rejecting". |
| The 25th place in 24h, then another user. | The 26th is refused. The bucket is per user. | — |
| The API resolver. | Addresses `PlaceCreationActor(viewer.id)` and refuses anonymous. | Resolver reverted to `"singleton"`: 2 API tests fail. |

## Decision 2: `BudgetActor` stays a singleton, and gains a per-kind database lock

### What it serialises, and who waits on it

`BudgetActor("singleton")` owns `api_budget_config` and `api_usage_log`. Every paid external call
reserves through it synchronously, from inside the caller's own turn. There are three doors:

| Door | Callers | Turns per external call |
|---|---|---|
| `reserve` (`lib/budget-reservers.ts:35`) | `PlaceActor` Google enrichment and refresh (system turns) | 1 per Google request: one details request and one per photo |
| `reserveForSearch` (`:45`) | `GooglePlacesActor` autocomplete and nearby | 1 per uncached query |
| `reserveForModel` + `settleForModel` (`lib/ai/budget.ts:185-191`, bound once per seam by `meteredProviderFor`) | every model call from all 7 seams | 2 per `generateContent`, 1 per embedding (no settlement) |

The caps (`budget-actor.ts`) are:

- the replay lookup;
- the per-user hourly and daily windows (`USER_CAPS`, added in `72560e38`);
- the monthly request cap (models only);
- the monthly money cap, with its nanocent carry.

**Every one of them is scoped to a single `(service, endpoint)`.** There is no cap across kinds.
I checked `#reserve`, `#userCapRefusal` and `#monthToDate`: each filters on `service` and
`endpoint`. That fact decides what may be re-keyed safely.

### Measurements

In-process harness, real Postgres, every call its own top-level transaction. Load average about 7
on 14 cores; the sidecar hop is not included. The benchmark was a throwaway harness file and is not committed; rerun it the same way before re-deciding.

| | p50 | p95 | p99 | mean |
|---|---|---|---|---|
| `reserve` (Google, system, per-user cap evaluated), before | 1.43ms | 3.71ms | 6.98ms | 1.91ms |
| `reserveForModel` (`menu_match`), before | 2.35ms | 4.64ms | 10.13ms | 2.74ms |
| `settleForModel`, before | 1.91ms | 3.51ms | 11.79ms | 2.25ms |
| `reserve`, with the per-kind lock | 2.13ms | 4.15ms | 13.22ms | 2.75ms |
| `reserveForModel`, with the lock | 3.04ms | 5.46ms | 14.47ms | 3.64ms |
| `settleForModel`, with the lock | 2.51ms | 4.76ms | 10.77ms | 2.87ms |

Eight activations of the one id reserving concurrently on one kind (40 each):

- **Without the lock**: 2,283 reserves/s. That is the placement-split race running unchecked.
- **With the lock**: 690 reserves/s on one kind, serialised as intended.

**What that means for the singleton.** A turn costs about 2 to 3ms of database time, plus a local
sidecar hop, so the singleton can take a few hundred reserve turns per second across all kinds.
The largest monthly request cap is 200,000 embeddings, an average of 0.08 per second. The largest
per-user hourly cap is 400 `menu_match` calls, about 0.1 per second per user. A menu-match batch
of 25 items makes at most about 75 budget turns spread over the batch's model calls, which take
seconds each. **Queueing on this actor is not a pre-cutover risk.** The actor's time per call is
two orders of magnitude below the model call it gates.

### The one real defect, fixed now

The caps were exact **only because of the key**. At READ COMMITTED the reserve transaction does
not serialise anything, so a placement split let two activations both count the same rows and
both be allowed. The module doc used to say so, and deferred the fix. Now the first statement of
every `#reserve` and `settleForModel` transaction is `pg_advisory_xact_lock` on its
`(service, endpoint)` (`lockBudgetKind`).

- Because every cap is per kind, that one lock covers all of them.
- Under the singleton it never waits, so the normal path is unchanged except for one round-trip
  (about +0.7ms p50, in the table above).
- Tests (`budget-actor.test.ts`, "per-kind lock under a placement split"): two activations in real
  concurrent transactions race the last free-tier slot, and separately the last per-user slot.
  Each race grants exactly one.
- **Negative control:** with the lock removed, both tests get `[true, true]`.

### Verdict: (a) keep the singleton key for cutover. (b) and (c) are post-cutover.

- **(b) Key per seam, as `BudgetActor("<service>/<endpoint>")`.** This is now *safe*: the lock
  makes each kind's caps exact whatever the key, and no cap spans kinds. But it is not *needed*,
  as the numbers above show. It would also be more than a routing change:
  - `setBudget` would have to address the kind's own activation, or that activation's config
    cache goes stale until it idles out;
  - `usage` and `config` read across kinds and would need a home;
  - the three doors would need a key function.

  Do it if Dapr's actor metrics ever show calls queueing on this id, and add a test
  asserting that no cap spans kinds before you do. A future cross-kind cap, such as a total monthly
  AI spend, would break per-kind keying silently. It would need a lock over the whole set,
  `lockAll` over every kind it spans, in sorted order.
- **(c) Replace the hop with a lock-guarded function called in the caller's turn.** This is the
  better end state: one hop fewer per model call (two for `generateContent`), and no activation
  whose slowness stalls every AI feature. The lock already makes the decision correct without the
  actor. But it moves writes to `api_usage_log` out of its owning actor. That breaks §1.2's
  single-writer rule and needs its enforcement test re-argued. It also moves the config cache and
  the env-derived policy (`readModelBudgetPolicy`) into a module. That is a design change, not a
  fix, and it does not belong in the week before cutover.

## Advisory lock namespaces

All locks taken in `services/actors` go through `lib/advisory-locks.ts`.

They use the **two-`int4`** form of `pg_advisory_xact_lock`. Postgres keeps that separate from the
single-`int8` form, and the single-`int8` form is used by the migrator
(`packages/db/src/migrate/cli.ts`, `hashtext`) and the test-template builder
(`packages/db/transform/test-db.sh`). So neither of those can collide with these.

Each family's first key carries `namespace << 20`. Add a family to `ADVISORY_LOCK_NAMESPACE`; never
pick a number inline.

| Namespace | Family | Key 1 low bits | Key 2 | Taken by |
|---|---|---|---|---|
| 1 | `placeGeocell` | geocell row (< 2²⁰) | geocell column | `PlaceActor.create` (`lockPlaceGeocells`) |
| 2 | `budgetKind` | 0 | FNV-1a of `service/endpoint` (a collision only adds serialisation) | `BudgetActor.#reserve`, `settleForModel` (`lockBudgetKind`) |

## Audit: every registered actor type

These columns describe each actor:

- **Serialises**: what the key forces to run one at a time.
- **Turn**: the longest in-turn external work, and its declared timeout. The default timeout is
  15s (`contracts/src/actors.ts`).
- **Contention**: who calls it, and how often.

Every model call also makes one or two `BudgetActor` hops inside the caller's turn. An image read
also makes a `FileActor.presignReadInternal` hop. These are not repeated per row.

Verdicts:

- **fine**: the key serialises what must be serialised and turns are short.
- **accepted**: a long in-turn call holds the key, but the only callers who wait are the ones who
  asked.
- **post-cutover**: worth changing, not worth the risk now.
- **flag**: a defect or smell to act on.

### Singletons and fixed keys

| Actor | Key | Serialises | Turn | Contention | Verdict |
|---|---|---|---|---|---|
| `BudgetActor` | `"singleton"` | every reservation and settlement | about 2–3ms of SQL, no external calls | every paid call (above) | **fine for cutover.** It now also holds per-kind DB locks. See Decision 2. |
| `OutboxActor` | `"singleton"` | all outbox delivery, globally serial | one `drain` claims up to 100 rows and delivers them one at a time until a 15s deadline. The deadline is checked *before* each delivery, so a turn is about 15s plus one delivery timeout: at least 125s for a model-backed target, up to 300s (Overture `runBatch`) | its own 2s keep-alive reminder | **post-cutover: worker pool.** Every model-backed follow-up waits behind the one in front of it, and one hung provider holds the whole queue for about 125s per attempt. Row claims already use `FOR UPDATE SKIP LOCKED`, so N drainers keyed `outbox-<n>` is mostly a keying change. It is out of scope before cutover. |
| `MaintenanceActor` | `"singleton"` | maintenance scheduling | the reminder only arms two outbox chains. The work (`reapOrphanFiles`, `reportDeadLetters`) runs as outbox deliveries, inside `OutboxActor`'s turn. | hourly reminder | **fine.** Note that the orphan scan has no `LIMIT`, and it runs inside the outbox's serial turn. |
| `CategoryVectorsActor` | `"singleton"` (`exactKey`) | `seed` and `all` | none | **no caller** in `services/api` or `services/actors`. `PlaceSearchActor` reads `category_vectors` by SQL. | **flag: unused.** Harmless as a singleton. Either wire it in or remove it. |
| `ReferenceDataActor` | the table kind, 10 fixed ids (`isReferenceKind`) | reads of one catalog (read-only, fully cached) | none | every dropdown | **fine.** Not a singleton; one activation per catalog. |
| `PingActor` | `"smoke"` for users, any id for admins | pings | none | smoke tests | **fine** |
| `PlaceActor("overture-bulk")` | reserved `PLACE_BULK_ACTOR_ID` | all Overture bulk upserts | one SQL statement per batch of up to 500 rows (120s) | `OvertureReloadJobActor` | **fine.** Bulk reloads should serialise. |

### Entity and registry actors (keyed by row, or by a natural key)

| Actor | Key | Serialises | Turn | Contention | Verdict |
|---|---|---|---|---|---|
| `PlaceCreationActor` | **viewer id** (was `"singleton"`) | one user's submissions | AI review, up to 120s, in-turn (§8.5) | `createPlace` | **re-keyed in this wave.** See Decision 1. |
| `PlaceActor` | place uuid | writes to one place | system `enrichFromGoogle` / `refreshFromSource`: up to 8 Google requests plus a `FileActor` upload and verify per photo, 90s. `create`: milliseconds, including the geocell locks. | per-place reads from field resolvers; outbox; `PlaceRefreshJobActor` | **accepted.** Reads of a place queue behind its own enrichment, up to 90s. Post-cutover: move the photo loop out of the turn. |
| `BrandRegistryActor` | `normalizeBrandName` = `trim().toLowerCase()` (`textKey`) | find-or-create of one normalised name | sync hop to `BrandActor(newId).create` | `resolveBrand`; `ItemOnboardingActor.confirm` | **fine.** Dedupe is exact, below. |
| `BrandActor` | brand uuid | one brand's writes | none | registry, and brand edits | **fine** |
| `BarcodeActor` | the canonical code: `barcodeActorId(code, symbology)` (`contracts/src/barcodes.ts`), within `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/` | `ensure` and `linkItem` for one **product** | none | barcode resolvers; onboarding `confirm` | **fixed: canonical key** (below) |
| `ItemActor` | `<type>:<uuid>` / `generic:<uuid>` | all writes to one item | `regenerateVector` → sync `EmbeddingActor.embedDocument`, model call plus image reads, 100s | item resolvers; outbox; `VectorReembedJobActor` | **accepted, post-cutover.** A user's edit to an item queues behind that item's re-embed, up to about 100s. The embed could run outside the turn and write its result back. |
| `ItemOnboardingActor` | onboarding uuid | one onboarding session | `start`: model call, 120s (§8.5's other exception). `confirm`: sync `BarcodeActor` → `BrandRegistryActor` → `BrandActor`, three keys deep, none of which calls back. | the onboarding user only | **fine.** It blocks only its own user. |
| `CellarActor` | cellar uuid | all writes to one cellar | `items` with `semanticQuery` → `EmbeddingActor.embed` (model call). The method declares `modelBacked`; the embed may take 30s. | cellar resolvers | **accepted.** A semantic search in a cellar blocks that cellar's writes for the length of one embedding. It is usually cached by `EmbeddingActor`. |
| `UserActor` | user uuid | one user's profile, friend, favorite and interaction writes | none (friendship mirroring goes through the outbox) | user resolvers | **fine** |
| `TierListActor` | list uuid | edits to one list | `generateInsights`: model call in-turn, throttled to one per 24h | list resolvers; outbox | **accepted, post-cutover.** The list's own edits queue behind the insight call while it runs. |
| `RecipeActor` | recipe uuid | edits to one recipe | `setIngredients`: sync `ItemActor("generic:…").createGeneric` per new item. `regenerateVector`: sync embed (model call), 100s. | recipe resolvers; `RecipePhotoJobActor`; outbox | **accepted.** It has the same re-embed shape as `ItemActor`. Generic-item dedupe is exact on `(name, category)` via `idx_generic_items_name_category` plus `ConflictError` convergence, with no registry actor. |
| `RecipeGroupActor` | group uuid | votes and the canonical recipe | none | recipe resolvers | **fine** |
| `FileActor` | file uuid | one file's lifecycle | storage presign, stat and delete (30s) | every image-reading model call, and uploads | **fine** |
| `MenuScanActor` | scan uuid | one scan's state | `process` (outbox): menu-extraction vision call | the scanning user; outbox | **fine.** Per scan. |

### Search, view and collection actors

Search actors are keyed by `searchHash` of their normalised input (`contracts/src/search.ts`), and
include the viewer only where visibility depends on it. Each actor recomputes the hash and refuses
a mismatch on every turn (`lib/search-actor-base.ts`). Identical queries share one activation and
its cached result. Different queries never contend.

| Actor | Key includes viewer? | In-turn external call | Verdict |
|---|---|---|---|
| `EmbeddingActor` | no: sha256 of the text (or of the document plus image ids) | the model call (30s query; 90s document) | **fine.** Deduplicates concurrent embeds of one phrase. |
| `ItemSearchActor` | no | `EmbeddingActor.embed` | fine |
| `CellarItemSearchActor` | **yes** | `EmbeddingActor.embed` | fine |
| `RecipeSearchActor` | no | embed, only with `semanticQuery` | fine |
| `PlaceSearchActor` | only with a tier-list or visit filter | embed | fine |
| `BrandSearchActor` | no | none (`ilike`) | fine |
| `UserSearchActor` | **yes** | none | fine |
| `DuplicatePlaceSearchActor` | no (coordinates rounded to 6 dp) | none (trigram SQL) | fine |
| `GooglePlacesActor` | no (coordinates rounded to 6 dp) | budget hop plus Google HTTP, per uncached keystroke | fine. A denial is not cached. |
| `GeocodeActor` | no (5 dp) | Photon HTTP with a 3s timeout | fine |
| `MapActor`, `RankingsActor` | key **is** the viewer (`#requireViewerKey`) | none | fine |
| Cellars / CheckIns / TierLists / Favorites / Friends / MenuScans / MatchSuggestions collections | key **is** the viewer (`viewerCollectionActorId`) | none | fine |
| `RecipeGroupsCollectionActor`, `BrandsCollectionActor`, `BrandLinksCollectionActor` | no: a hash of the filter | none | **fine.** The unfiltered `/recipes` and `/brands` views are each one activation shared by all viewers. Their turns are SQL only. |

### Job actors (keyed by job id)

`MenuMatchJobActor` (derived from the scan id), `PlaceRefreshJobActor`,
`OnboardingReprocessJobActor`, `RecipePhotoJobActor`, `OvertureReloadJobActor`,
`VectorReembedJobActor` and `ProbeJobActor` are all keyed by their job's uuid. Each `runBatch` is
one outbox-delivered turn, bounded by `createBatchBudget`. Several make model calls in-turn:

- `MenuMatchJobActor`: up to 25 searches and verification calls per batch, with no declared
  timeout, so the outbox's roughly 125s floor applies;
- `RecipePhotoJobActor`: the `extract` stage is a vision call.

The others reach a model through one sync hop (`ItemOnboardingActor.reprocess`,
`regenerateVector`). **Fine as keys**: a job serialises only its own batches. What they share is
`OutboxActor`'s serial drain (above), and that is where their length costs anyone else.

### Flags raised by the audit

- **`BarcodeActor` canonicalises its key (fixed; it used to key on the raw code).**
  `012345678905` (UPC-A) and `0012345678905` (its EAN-13 form) used to be two activations and two
  `barcodes` rows for one product, and so were `abc123` and `ABC123`. Now:
  - **One key function**, `canonicalBarcodeCode` / `barcodeActorId` in
    `packages/contracts/src/barcodes.ts`, whose doc comment carries the rules. An 8, 12, 13 or
    14-digit code with a valid GS1 check digit becomes its zero-padded **GTIN-14**. GS1 specifies
    that form for storage, it holds an ITF-14 case code with a non-zero indicator, and it is
    unambiguous across GTIN-8/12/13. An 8-digit code is read as UPC-E (expanded to its UPC-A) or
    EAN-8 by check digit. When both readings validate, the `symbology` hint decides and the default
    is UPC-E. Any other all-digit code is **kept as typed (opaque)**, not refused: a bad check digit
    or a non-GTIN length is never merged into another code. A code containing a non-digit is
    ASCII-trimmed and ASCII-upper-cased. Every scanner the app has shipped read only
    EAN-13/EAN-8/UPC-A/UPC-E, so text codes are typed by hand and their case is a typing artefact.
  - **Every entry point uses it.** The three API fields key `BarcodeActor(barcodeActorId(code))`,
    and `ensureBarcode` passes its `type` as the hint. `ItemOnboardingActor.confirm` canonicalises
    the scanned code with its `barcode_type`. `ItemActor.create` and `setBarcode` store the
    canonical spelling.
  - **The actor refuses a non-canonical key.** `keyShape` treats it as absent, and `ensure` names
    the canonical key when called directly.
  - **Postgres enforces it.** `barcodes_code_canonical` is
    `CHECK (code = canonical_barcode_code(code, NULL))`, and the SQL function mirrors the TypeScript
    one (`services/actors/src/lib/barcode-canonical-migration.test.ts` holds the two equal). With
    that check, the primary key *is* the unique index on the canonical code.
  - **Existing rows were merged by migration** `20260928185314_canonical_barcode_codes`, which
    reports its counts through `db:migrate` as a `NOTICE`. The row that survives a merge takes the
    type of the most-linked spelling. The migration repoints the six item FKs and the undelivered
    outbox payloads, and deletes the old spellings.
  - **A second symbology of one GTIN is not a re-type.** Once every rendering reaches one row, a
    plain user's `ensure` naming another GTIN symbology (`EAN_13` on a row typed `UPC_A`) returns
    the row unchanged instead of `ForbiddenError`. The refusal would otherwise fail onboarding for
    the second scanner. Text codes keep the refusal.
- **Brand dedupe is exact, never fuzzy.** It is exact on the normalised name.
  - The key is `name.trim().toLowerCase()` (`contracts/src/brand.ts:86`).
  - The lookup is `lower(trim(name)) = key` (`brand-registry-actor.ts:150`).
  - The tripwire is `brands_unique_lower_name` on `lower(name)`.
  - Nothing matches brands fuzzily: no `similarity(`, `%`, `levenshtein` or embedding anywhere on
    the dedupe path. `idx_brands_name_trgm` serves only `BrandSearchActor`'s `ilike` autocomplete.

  Consequences of exactness worth knowing, none of them a race:

  - inner whitespace is not collapsed, so `Stone  Brewing` and `Stone Brewing` are two brands;
  - there is no Unicode normalisation, so a composed and a decomposed `é` are two brands;
  - JavaScript `toLowerCase` and Postgres `lower()` can disagree for a few locales;
  - the unique index is on `lower(name)` while the lookup trims. The stored name is already
    trimmed (`brand-actor.ts:139`), so the two agree in practice.
- **`CategoryVectorsActor` has no callers.** See the singletons table.
- **Docs that still describe `PlaceCreationActor` as a singleton**:
  `docs/architecture/migration-plan.md` §2.1 (`**PlaceCreationActor()** — singleton registry`,
  including the geohash escape hatch), and `docs/architecture/target-stack.md` Q19 ("singleton,
  fuzzy dedupe"). Neither file was in this wave's scope. This document supersedes both on this
  point.
