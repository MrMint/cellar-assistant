# Target stack — post-Nhost, post-Hasura

**Status:** technology decisions locked 2026-09-07; design questions settled 2026-09-08.
**Migration built — 74 of 75 workstreams closed as of 2026-09-18; only `E4` (cutover execution)
remains.** This header said "Migration not started" until 2026-09-19, which was false for weeks:
the stack described below is the one that runs. See [`migration-plan.md`](./migration-plan.md) for
what was built.
**Audience:** anyone (human or agent) working on this stack. §§1–6 describe what runs today, §7 the
runtime traps that bite while you do, §8 the things already rejected — check §8 before proposing.

This records *what was decided and why*, so decisions don't get relitigated. If you disagree with a
locked decision, raise it — don't quietly build something else.

---

## 1. The stack

| Layer | Choice | Version / notes |
|---|---|---|
| Frontend | Next.js on Vercel | Unchanged. Proxies `/graphql` and `/api/auth/*` to Loki. |
| GraphQL server | graphql-yoga + Pothos | `services/api` on Loki. **Holds no database credentials.** |
| Domain | **Dapr actors**, TypeScript SDK (`@dapr/dapr`) | `services/actors` on Loki. The only process that touches Postgres. |
| Data access | `drizzle-orm@1.0.0-rc.4` + **RQB v2** | Deliberate RC. See §2. |
| Migrations | `drizzle-kit` (matching RC build) | Plus a permanent hand-written SQL lane. See §5. |
| Database | PostgreSQL 18 | postgis, pgvector, pg_trgm, pgcrypto. **No RLS.** |
| Auth | **better-auth** | Mounted in `services/actors`; `jwt` plugin; API verifies via JWKS. |
| Dapr hosting | Docker Compose on Loki | Sidecars + placement + scheduler. An in-memory actor state store (required to host actors at all); no pub/sub. |
| File storage | Dapr binding → MinIO | Presigned URLs; swappable to GCS via component config. See §4. |
| Exposure | Port forward + public DNS + Caddy TLS | Cloudflare Tunnel was considered; not needed. |
| Observability | Dapr OTLP → Grafana all-in-one (`otel-lgtm`) | Same compose file. Secrets from `.env`. Pinned to `0.32.1`, data on the `otel-lgtm-data` volume with 30/30/14-day retention, login required in prod, Dapr runtime metrics scraped — `deploy-loki.md` §9. |
| Client types | gql.tada | Fed by `printSchema` to a checked-in `schema.graphql`. |

**Gone:** Nhost (all services), Hasura GraphQL Engine, `hasura-auth`, `hasura-storage`, Hasura
Actions, Event Triggers, metadata, permissions, native queries, GraphQL subscriptions (replaced by
polling), Postgres RLS (never adopted; see §6.2).

`hasura-auth` and `hasura-storage` are *Hasura clients* — they manage `auth.users` and
`storage.files` through Hasura's API. They cannot survive leaving Hasura, which is why auth and
storage both had to be re-decided rather than carried over.

---

## 2. Why the Drizzle release candidate

`drizzle-orm@1.0.0` has been in prerelease since 2025-03-13 — 318 prerelease publishes, and
`dist-tags.latest` is still `0.45.2`. Running an RC in production is a deliberate, eyes-open choice
made for RQB v2, which the actor layer uses to load aggregates.

Practical notes:

- **Corrected 2026-09-08:** `drizzle-kit` publishes a clean `1.0.0-rc.4` too — it is an official
  joint release, published 628ms after the orm. Pin `drizzle-orm@1.0.0-rc.4` +
  `drizzle-kit@1.0.0-rc.4`. A hash-suffixed `1.0.0-rc.4-5d5b77c` also sits under the `rc4`
  dist-tag but is an older interim build predating the real rc.4 by a month; do not use it.
- Breakage between RCs is live, not theoretical. Pin exactly; upgrade deliberately.
- The v1 `drizzle-kit` fixes two things the 0.31 kit gets wrong and that this schema needs:
  `halfvec` introspection, and `pull --init` for baselining an existing database.

**Known Drizzle gaps that need the hand-written SQL lane** (verified 2026-09-07 against 0.45.2 /
0.31.10; re-verify on the RC):

- No `CREATE FUNCTION`.
- No `geography` support at all; `geometry` silently discards `srid`/`type` config on the stable line.
  **Confirmed on the RC:** `geography`, `geometry`, `tsvector` and `money` all introspect to untyped
  `customType(...)` placeholders and need hand-written typed wrappers. `halfvec` and its HNSW
  indexes, by contrast, round-trip natively — this was the main reason for taking the v1 kit.
- `drizzle-kit pull` truncates composite foreign keys to their first column. **Moot here:** this
  schema has 188 foreign keys and not one of them is composite, so the bug is unreachable.
- `pull --init`'s generated RQB v2 relations invent bogus `.through()` many-to-many links on
  ordinary two-FK tables, and must be scoped `schemaFilter: ["public","auth","storage"]` or the
  generated file throws at import. The output is a starting point to audit, not to trust.
- **`pull --init` is not read-only.** It writes a `drizzle.__drizzle_migrations` tracking table
  into the database it is pointed at. The rest of the `pull` family is read-only and the name
  invites the assumption that this one is too; it is not. Point it at a scratch database, or
  expect to revert.
- (RLS-related gaps — no `FORCE ROW LEVEL SECURITY`, opaque policy bodies — are moot; RLS is not used.)

---

## 3. The Dapr model (summary — the plan is authoritative)

- **Actors are the only thing that touches application tables.** Reads and writes both.
  `onActivate` loads the aggregate through Drizzle; the in-memory copy is a cache, Postgres is
  the truth. Writes are write-through and synchronous inside the turn.
- **Six actor categories:** entity, collection, search, view, reference, job. The category fixes
  what an actor may read and write. See `migration-plan.md` §1.1.
- **Single writer:** every application table has exactly one writing actor class, enforced by a
  test. Cross-aggregate operations are sequences of idempotent calls to the owning actors.
- **Outbox:** side effects and cross-actor retries are `outbox` rows committed with the domain
  write and drained by a reminder-kept-alive `OutboxActor`. Reminders carry no domain intent.
  Delivery runs with policy off, so it is fenced: a `(target_actor, method)` pair not declared in
  `OUTBOX_TARGETS` (`services/actors/src/lib/outbox-targets.ts`; in `packages/db` at `63f6042c`)
  is refused and dead-letters on its first attempt, so a hand-inserted row naming one does
  nothing but raise the alarm. Enqueue sites name typed handles from that list, so an undeclared
  pair or a wrong payload shape is a compile error there.
- **Reads:** entity `get` returns the header; child lists are paged from the owner; collection
  actors return ids or projections per method; search actors are keyed by an input hash; view
  actors (`MapActor`, `RankingsActor`) return screen-shaped projections. Search hashes exclude
  pagination. All reads are paged.
- **Authorization** is in actors, via `packages/policy`, with owner/friend/stranger tests per
  viewer-dependent method. `ctx` is the first argument of every actor method. Caller gates are
  `services/actors/src/lib/guards.ts` (one name per rule: signed-in, viewer, privileged,
  system, admin); hiding a row is `EntityActorBase.refuseAsAbsent`/`requireVisible`, one
  spelling for "absent" and "not yours to see".
- **Wire boundary.** Dapr's JS host dispatches a method route to *any* function-valued property
  of the actor, so the actor host refuses every name its descriptor does not declare — each
  descriptor's `methods`/`internalMethods` tables are exhaustive by type — and wraps every
  declared method so a malformed `ctx` is refused before the body
  (`services/actors/src/lib/actor-method-allowlist.ts`). Methods only another actor calls live
  on the descriptor's *internal* interface, which `services/api`'s client cannot name.
- **Why callers bypass `@dapr/dapr`'s client, and what the host hardening compensates for** — each SDK gap with source, repro and upstream status: [`dapr-sdk-gaps.md`](./dapr-sdk-gaps.md).

Named entity actors: `User`, `ItemOnboarding`, `Cellar`, `Item` (one actor, seven physical
tables), `Barcode`, `Brand` (+ `BrandRegistry`), `Place` (+ `PlaceCreation`), `Recipe`,
`RecipeGroup`, `TierList`, `MenuScan`, `File`, `Budget`, `CategoryVectors`. View actors: `Map`,
`Rankings`. Reference actors are keyed by table, not a singleton. Full catalog with owned tables and methods:
`migration-plan.md` §2–3.

### 3.1 Dapr API tokens

Everything the actor host serves trusts the `ctx` it is handed, `kind: "system"` included, so
whatever can reach the actors app port or a sidecar's API can act as the outbox. Two Dapr
features close that, and both apps and both sidecars carry both (Dapr 1.18 docs:
*operations/security/api-token* and *app-api-token*; the exemption list is from daprd's
`pkg/api/http` middleware):

| variable | set on | what it does |
|---|---|---|
| `DAPR_API_TOKEN` | both sidecars, both apps | daprd refuses any call to its HTTP/gRPC API without `dapr-api-token: <value>` — `401 invalid api token`. Only `GET /v1.0/healthz` and `/v1.0/healthz/outbound` are exempt. The apps present it on every call: `invokeActorOverSidecar` (`packages/contracts`, `apiToken`), `services/actors/src/lib/sidecar.ts`'s reminder calls, and `@dapr/dapr`'s own client, which reads the same variable. |
| `APP_API_TOKEN` | both sidecars, the actors app | daprd presents it to its app as `dapr-api-token` on every call. daprd verifies nothing on the app's behalf; the actors app refuses every path except better-auth's `/api/auth/*` and `GET`/`HEAD /healthz` without it — deny-by-default, so no spelling of an actor route (`/ACTORS/…`, a trailing slash) gets past it; the host also routes case-sensitively and strictly (`services/actors/src/lib/dapr-app-token.ts`, `host-app.ts`, constant-time, `401 {"code":"UNAUTHENTICATED"}` + `actor.app_token_refused`; every spelling in `actor-host-bypass.test.ts`). |

- **Development** (`infra/docker-compose.yml`, `bun run dev:up`): both default to published
  values (`cellar-dev-dapr-api-token`, `cellar-dev-app-api-token`), so every local lane enforces
  tokens exactly as production does. Override in `infra/.env`.
- **Production** (`infra/docker-compose.prod.yml`): both are **required** (`:?`); compose refuses
  to render without them. Generate each with `openssl rand -hex 32` into `infra/.env.prod`.
  Rotation restarts the apps *and* the sidecars — a sidecar and its app with different values
  refuse each other.
- An unset `APP_API_TOKEN` disables the app-side check and logs `dapr.app_token_unset` (WARN) at
  boot; an unset `DAPR_API_TOKEN` means the sidecar demands nothing and the apps send nothing.
- The method allow-list (§3, "Wire boundary") still holds if a token leaks: a token holder can
  call declared methods with a forged `ctx`, not `tx` or a timer callback.

---

## 4. Storage

Dapr output binding, S3-compatible. MinIO on Loki now; swap to GCS later by changing the component,
not the code — **true for reads, not for uploads; see the correction below.**

Verified 2026-09-07: the AWS S3 binding supports a `presign` operation with `presignTTL`, and the
GCP bucket binding supports `sign` with `signTTL` for v4 signed URLs.

**Corrected 2026-09-08 by A8, which built it. The binding presigns reads only.** Reading
`dapr/components-contrib` directly: `bindings.aws.s3` implements `PresignGetObject` and has **no
PUT-presign operation at all**. So `FileActor.createUploadTarget` signs uploads itself with the
`minio` npm client (`services/actors/src/lib/s3-presign.ts`), against the same endpoint.
**This weakens the swap-to-GCS claim below:** reads stay a component change, but the upload path is
now provider-specific code and would need a GCS signer. Budget for that rather than discovering it. **Browsers upload and fetch
directly via signed URLs — image bytes never pass through the sidecar or the API.** For MinIO set
`disableSSL` (plain http) or `insecureSSL` (self-signed certs).

**Upload protocol:** `FileActor.createUploadTarget` → client PUTs → owning actor's `attachX(fileId)`
verifies the object exists via the binding before writing the reference. Never trust a client's
"done". Unverified targets are reaped after 24h.

**The bootstrap gap this section used to describe is closed — do not hand-insert an outbox row.**
On 2026-09-18 `MaintenanceActor.reapOrphanFiles` had never run: each cycle was kept alive by the
previous one, nothing inserted the first row, and this section asked for a manual
`INSERT INTO outbox …` to start it. That instruction is now actively harmful. `armMaintenanceReminder()`
(`services/actors/src/actors/maintenance-actor.ts`) registers a Dapr reminder and is called
unconditionally from `services/actors/src/index.ts`, and `armCycle` guards on `WHERE NOT EXISTS`.
A hand-inserted row goes around that guard and forks a second maintenance chain. It converges back
on its own, but there is no reason to cause it.

Measured on the shared stack (`cellar-stack-postgres-1`, 2026-09-19), replacing the 2026-09-18
numbers above: `outbox where target_actor='MaintenanceActor'` → **28 rows**, not 0.
`reapOrphanFiles` has delivered twice, 24h apart, with the next armed for 2026-09-20;
`reportDeadLetters` has delivered hourly for a day. Both chains are pending, scheduled ahead.

**One thing that measurement does *not* mean**, because the old text conflated it: `files where
verified_at is null` → **38 rows, 13 older than 24h, oldest 2026-09-10** — and that is not the
orphan count and never was. `findOrphans` selects unverified rows that **no referencing column
points at**; a row that is unverified but still attached is deliberately left alone, which is the
fix for a defect where the reaper deleted attached files. So a non-zero unverified count is not
evidence the reaper is failing, and this section previously read it as though it were.

**Migration constraint:** file IDs are foreign keys throughout the schema. Object keys must be
preserved exactly, or images 404 in a way that looks like an application bug.

---

## 5. Migrations

`drizzle-kit` is the migration authority. Baseline the transformed database with the v1 kit's
`pull --init`, then move forward with generated migrations.

**A hand-written SQL lane is permanent, not exceptional.** Use
`drizzle-kit generate --custom --name=<thing>` — it emits an empty versioned migration for raw SQL
that sits alongside the generated ones. It is required for:

- The four `SETOF` search functions (`search_places_hybrid`, `search_places_adaptive_cluster`,
  `search_category_vectors`, `find_duplicate_places`) — kept as SQL at cutover, weights passed
  from TypeScript
- The pgvector distance helpers (`STABLE` functions taking `(row, halfvec)`)
- `geography` columns
- Column-level `GRANT`s

**Cutover scope:** the cutover transforms everything that is mechanical — better-auth and `files`
tables, the enum split (`migration-plan.md` §4), removal of every Hasura artifact, trigger logic
moved into actors, `*_jobs` tables replaced by `jobs` + `outbox`. The one deliberate exception is
the item-table consolidation, deferred behind the `Item` interface.

---

## 6. Decisions from the design review (2026-09-08)

Each was put as a question with a recommendation; the answer here is what was chosen. Numbers are
the review's question ids, kept so transcripts can be cross-referenced.

### 6.1 API and reads
- **Q1 — Redesign the API** as a domain API derived from actor interfaces. No `where` DSL, no
  `_aggregate`, no `on_conflict`, no `insert_/update_/delete_` roots. Relay connections (Q24),
  typed error unions via `@pothos/plugin-errors` (Q25).
- **Q3 — Everything reads through actors**, including catalog data. (Recommended splitting
  catalog reads to a query path; overridden as a best-practice preference.)
- **Q4 — Collection actors return ids; Pothos dataloads entity actors.** Amended by Q14: a
  collection or view actor may return a full projection when the list is high-cardinality.
- **Q14 — Read ownership:** rows are *written* only by their entity actor; collection, search,
  view, and reference actors may *read* any table directly. View actors are a named category;
  `MapActor(viewerId)` is the first.
- **Q5 — Search actors keyed by a hash of all inputs**, cached for a short idle window
  (Q21: 5 minutes; viewer in the hash only for in-cellar search, map filters, user search; SQL
  bodies kept, weights moved to TypeScript).
- **Q11 — All subscriptions removed**, replaced by polling. No pub/sub component.

### 6.2 Authorization
- **Q2 — No RLS.** All database reads go through actors, which enforce visibility. Rationale:
  the in-memory cache already forced per-viewer filtering into code, so RLS could never be
  authoritative on the actor path. Consequence: every viewer-dependent method carries
  owner/friend/stranger tests, since there is no longer a mechanical coverage proof.
- **Q7 / Q23 — `ctx = { viewerId, kind: user|admin|system, requestId }`** is the first argument
  of every actor method; `system` is only ever constructed by the outbox and job actors.
  **Amended 2026-09-27: `requestId` is correlation only.** A delivery's identity is
  `ctx.delivery = { outboxId, attempt, final }`, minted by `OutboxActor`'s `deliveryArgs` alone
  and stripped by the actor host's typed client on every onward call, so a delivery that calls
  another actor lends it nothing; `ctx.causedBy` (the row a turn descends from) travels instead,
  for spend attribution only. Keys that must survive redelivery come from
  `idempotencyKey(ctx, purpose, ...scope)` (`services/actors/src/lib/delivery.ts`), and a callee
  that needs one is handed it explicitly. The wire boundary accepts `delivery`/`causedBy` on
  `system` ctx only; a scan fails if an actor module reads `.requestId`.

### 6.3 Actor boundaries
- **Q15 — Item model stays physically polymorphic** (six tables, six-column FK) behind one
  `ItemActor` and one `Item` GraphQL interface. Consolidation is deferred (plan §9).
  As built since Wave 3a (`a8757dc4..be70bccf`), the polymorphism is stated once rather than
  per module: `ITEM_TYPE_SPECS` (`packages/contracts/src/item-types.ts`) says what each type's
  attributes are; `ITEM_BINDINGS` / `ITEM_TABLES` (`services/actors/src/lib/item-bindings.ts`)
  bind them to Drizzle; `itemArc` / `ARCS` (`services/actors/src/lib/item-arcs.ts`) derive every
  six-column FK fragment from the table's own columns, held to the schema by `item-arcs.test.ts`;
  and the hand-written Pothos types and the client's form rules are held to the spec by parity
  tests (`services/api/src/schema/item-spec-parity.test.ts`,
  `services/client/src/lib/dev-checks/item-spec.test.ts`). What a seventh type still costs: plan
  §9.1.
- **Q16 — Enum split:** compile-time enums become `pgEnum`; catalog lists stay tables behind a
  singleton `ReferenceDataActor`. Classification in plan §4.
- **Q17 — `UserActor` owns friends and requests**; acceptance is a two-actor operation.
  (A `FriendshipActor` keyed by the pair was recommended and rejected.)
- **Q18 — `CellarActor` owns `check_ins`**, so bulk check-in on behalf of friends is one actor.
- **Q19 — Registry actors as locks, unique constraints as tripwires:** `BrandRegistryActor`,
  `BarcodeActor` (natural key, in its canonical spelling — GTIN-14 for a GTIN). **Not
  `PlaceCreationActor` any more**: it was a singleton guarding fuzzy dedupe, and since `291bcb97`
  it is keyed per creator (the per-user rate limit) while the cross-user duplicate rule is held by
  geocell advisory locks inside `PlaceActor.create` — a fuzzy predicate has no key an actor could
  lock. The geohash-keyed alternative was rejected for boundary misses.
  `docs/architecture/actor-keys.md`, "Decision 1".
- **Q36 — Single-writer rule**, verbatim in plan §1.2, enforced by test.

### 6.4 Async and durability
- **Q8 — Job actors, not Dapr Workflows**, until the JS SDK's workflow reliability is validated.
- **Q20 / Q34 — Transactional outbox** is the single durability primitive: side effects,
  peer notifications, cross-actor retries, scheduled work. `OutboxActor` is kept alive by a
  reminder; reminders are trusted but carry no domain intent.
- **Q28 — Cross-aggregate writes are idempotent calls to owning actors** with outbox retry. The
  "one transaction across aggregates because Postgres is shared" shortcut was considered and
  rejected: it breaks single-writer and stales peer caches.
- **Q30 — No Dapr state store for domain data or internals.** The outbox is correct regardless of
  whether reminders need one.
  **Amended 2026-09-08 by A2, which disproved the literal form of this answer.** daprd 1.18.3
  refuses to *host* actors unless some component is marked `actorStateStore: "true"` — it logs
  `Actor state store not configured - actor hosting disabled`, registers zero actor types with
  placement, and every invocation fails with `did not find address for actor`. Hosting is gated on
  the component existing, not on any actor using it. A declared state store is therefore
  non-negotiable. We declare the emptiest one possible: `state.in-memory`, in
  `infra/dapr/components/actor-state.yaml`. Actors still keep no Dapr state, Postgres is still the
  only truth, and reminder durability is unaffected because reminders live in the Scheduler's etcd
  volume since Dapr 1.15 (`Using Scheduler service for reminders.` confirmed at startup).
  The intent of Q30 is preserved by a test, not by the absence of a component: A4 forbids
  `getState`/`setState`/`removeState` in actor code, so nothing can come to depend on it.
- **Dead letters tell their owner (2026-09-27).** A pair in `OUTBOX_TARGETS` may declare
  `onDead`: a method on the same actor and id that the drainer enqueues **in the same statement**
  that sets the row `dead` — in `#fail` and in `#reclaimStale`, which is the path no target could
  ever see (the host died mid-delivery on the last attempt). Every `JobActor.runBatch` declares
  `markFailed`, and `MenuScanActor.process` declares `markFailed`; compensations are declared
  pairs no module may enqueue and may not declare their own `onDead`. The payload is a
  `DeadDeliveryNotice`; the insert is idempotent on `deadOutboxId`.
  **Backfill**, for rows that died before this existed (jobs still `running`, scans still
  `processing`): the drainer's insert, over the existing dead rows, with the declared pairs
  written out. Safe to repeat (`NOT EXISTS` on `deadOutboxId`); run it before requeueing any of
  those rows by hand, since `markFailed` fails a job still waiting on the dead batch:
  ```sql
  insert into public.outbox (target_actor, target_id, method, payload, attributed_to)
  select d.target_actor, d.target_id, 'markFailed',
         jsonb_build_object('deadOutboxId', d.id, 'deadMethod', d.method,
           'reason', case when d.last_error like 'reclaimed:%' then 'reclaim'
                          when d.attempts >= 10 then 'attempts' else 'permanent' end,
           'deadPayload', d.payload),
         d.attributed_to
  from public.outbox d
  where d.status = 'dead'
    and (d.method = 'runBatch' and d.target_actor in ('MenuMatchJobActor',
           'OnboardingReprocessJobActor', 'OvertureReloadJobActor', 'PlaceRefreshJobActor',
           'ProbeJobActor', 'RecipePhotoJobActor', 'VectorReembedJobActor')
         or d.target_actor = 'MenuScanActor' and d.method = 'process')
    and not exists (select 1 from public.outbox o
                    where o.target_actor = d.target_actor and o.target_id = d.target_id
                      and o.method = 'markFailed' and o.payload->>'deadOutboxId' = d.id::text);
  ```
  The pair list is `outboxCompensations()` in `services/actors/src/lib/outbox-targets.ts`
  (`packages/db` as of this change); `outbox-actor.test.ts` ("is idempotent on deadOutboxId") runs the drainer's own form
  of the statement twice.
- **Drain liveness (2026-09-27).** The drain reminder emits `outbox.heartbeat` — pending, due,
  oldest due age (database clock), delivering — at most once a minute and only after a drain
  returns. `infra/grafana/provisioning/alerting/outbox-liveness-alerts.yaml` pages on five minutes
  of silence (`outbox-drain-silent`) and on due work waiting over 15 minutes
  (`outbox-backlog-stuck`). Before this, a stopped drainer was noticed only by the dead-letter
  reporter's 150-minute switch, and that reporter is itself delivered by the outbox.
- **Event names are a catalog.** `services/actors/src/lib/events.ts` and
  `services/api/src/events-catalog.ts` list every event with its severities and attributes;
  `emit` accepts only catalogued names, and `events.test.ts` holds every alert rule's
  `event_name` and label filters to the catalog (dots as underscores) — the check that would
  have caught the `method`/`outbox_method` rule below before it shipped.

### 6.5 Topology, auth, ops
- **Q6 — Two Dapr apps:** `services/api` (no DB) and `services/actors` (all DB).
- **Q22 / Q29 — better-auth runs in `services/actors`**; its tables are the one non-actor writer.
  The API authenticates with the `jwt` plugin (15-minute tokens) against a JWKS endpoint, so it
  needs no database and no per-request auth hop.
- **Q9 — Port forward + public DNS**, Caddy TLS.
- **Q10 — Migrate existing users, keep bcrypt hashes** via a custom `password.verify`. OAuth
  (Google, Facebook, Discord) relinks by email; new callback URLs must be registered.
- **Q33 — Grafana all-in-one for OTLP; secrets from compose `.env`.**
- **Q26 — Presigned upload with attach-and-verify** (§4).
- **Q27 — Repo layout** in plan §8.1; actor interfaces in `packages/contracts`.

### 6.6 Scope and cutover
- **Q13 — Full migration;** the eight functions with no caller are ported as unexposed actor
  methods tagged for post-cutover deletion.
- **Q31 — Not a minimal cutover.** Transform everything mechanical at cutover (§5); iterate on
  design problems after.
- **Q32 — Rollback** is redeploying the pre-cutover frontend against Nhost; data written to
  Loki in between is abandoned. Nhost stays up read-only for 30 days.
- **Q12 — Verification baseline** in plan §7.

---

## 7. Runtime traps

Empirically established, each by hitting it. Do not discover these again. Every one is a
property of the **current** stack — Dapr, the actor host, Loki — and every one fails *silently*
if you get it wrong, which is why they are written down rather than left to a test.

**This section used to also carry a register of live authorization defects in the legacy
Nhost stack.** It was removed on 2026-09-19 and does not live in this repository: the
repository is public, `nhost/metadata/` is already published on `origin/main` in raw form,
and a triaged register over public raw data is a sharper instrument than either the raw data
or nothing. The register is with the maintainer. Do not re-derive it here.

- **Only one Dapr state store can serve all actors**, and actor state should always carry
  `ttlInSeconds`. The declared store is `state.in-memory` and no actor writes to it (A4 enforces
  this by test), so the constraint is inert — but it binds the moment anyone swaps in a real store.
- **A dead-lettered `removeFriendOtherSide` fails open, and needs an alert rather than a
  dashboard.** B4's analysis: friendship is written one row per side, and `isFriend` matches
  either direction (deliberately — see the plan's B4 notes). So a dead-lettered *confirm* fails
  safe: both parties already read as friends and the residue is a stale outgoing request. The
  mirror case does not. If `removeFriendOtherSide` dead-letters, the surviving row keeps
  `isFriend` true, so **an unfriended person retains FRIENDS-visible access**. `removeFriend`'s
  guard reads both directions so a repeat call re-enqueues, but E3 must alert on that specific
  dead letter, not merely expose it in Grafana.
  **Mechanism corrected 2026-09-18 by the E-series architecture review — the conclusion stands,
  the cause and the duration do not.** E2d changed `removeFriend` to delete **both** direction rows
  in its own transaction (`services/actors/src/actors/user-actor.ts`), so after a dead letter there
  is no surviving row: the database is already consistent, and `removeFriendOtherSide` was demoted
  in the same change to "backstop and cache invalidation", whose real job is the peer's `reload()`.
  What now fails open is the **cache, not the table**. `UserActor(bob).#friendRows()` returns the
  cached `ownFriends` (which still holds the deleted `friends(bob, alice)` row) unioned with a fresh
  reverse read, and `#requireSelfOrFriend` authorizes off that union — so a removed friend keeps
  FRIENDS-visible access to the peer *for as long as the peer's activation stays warm*, not
  forever. Two consequences for how this is watched: the window closes on its own if `UserActor(bob)`
  idles out (10 minutes, §8.5), and it is invisible to any check that queries `friends` — including
  a `psql` spot-check, which will show the removal as complete while a warm actor still answers
  "friends". This is also a §1.3 violation of the exact shape §1.3 was sharpened for
  (`UserActor(alice)` writing a row `UserActor(bob)` caches), and it has no regression test.
  **Both notification paths are now live; the requirement is met and the dead letters are not.**
  This bullet used to say the alert reached nobody, and both halves of that have since changed.
  The provisioned rule (`infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml`) no
  longer routes to `grafana-default-email`: `contact-points-and-policies.yaml` provisions a
  `discord-ops` contact point as the catch-all root receiver, with the webhook supplied at runtime
  rather than committed. And `MaintenanceActor.reportDeadLetters` is no longer part of an unstarted
  chain — see §4; it has delivered hourly for a day.

  What has *not* changed is the population being reported. Measured 2026-09-19 on the shared stack,
  replacing the 2026-09-18 figure: **22 dead rows, 19 of them `MenuScanActor.process`, oldest still
  2026-09-10** — so that backlog grew from 10 to 19 while the reporting path was being built, and
  nothing has triaged it. The other three are recent singletons (`CellarActor.addItem`,
  `ItemActor.create`, `PlaceActor.enrichFromGoogle`). `removeFriendOtherSide` still shows 0 dead,
  so this specific fail-open has not fired.

  The open item is therefore no longer "build an alert" but "act on what it now reports", plus the
  operator step the alert depends on: `DISCORD_WEBHOOK_URL` must be in `infra/.env`, and a contact
  point with no webhook behind it is the same silence this bullet was written about.

  **2026-10-05: delivery removed by decision.** The Discord contact point and its webhook variable
  are gone; the root policy routes to the integration-less `empty` receiver, so this alert fires
  and is visible on Grafana's Alerting page and reaches nobody who is not looking at it — the
  silence described above, now chosen rather than accidental. Restoring push delivery:
  `deploy-loki.md` §9.7.

  **Superseded by `1763eac8` (2026-09-20): "act on what it reports" now has a mechanism, and it
  has been used.** `MaintenanceActor.acknowledgeDeadLetters` records a triage decision per
  `outbox.id` in `outbox_dead_letter_acks`; the dead row itself stays, as evidence. The hourly
  report then emits `maintenance.dead_letters` (ERROR) for *unacknowledged* rows only,
  `maintenance.dead_letter_regression` first when an acknowledged `(target_actor, method)` pair
  has dead-lettered again, and otherwise an INFO `maintenance.dead_letters_clear` heartbeat.
  Measured on the shared stack on 2026-09-26: 23 dead rows, all 23 acknowledged (by
  `dead-letter-triage-2026-09-20`), none new, and still none for `removeFriendOtherSide`. The
  provisioned Grafana rules were extended to match in `1c403299`. The standing-backlog rule keys
  on `maintenance.dead_letters`, which now means unacknowledged rows. Two paging rules
  (`urgency: page`, their own notification route) key on the rest: one on the regression event,
  and a dead-man's switch that fires when **no report of either kind** has run for 150 minutes.
  It counts the heartbeat and the ERROR together because a run that finds a backlog emits the
  ERROR *instead of* the heartbeat, so a heartbeat-only switch would page "reporter dead" on top
  of every real backlog. 150 minutes is 30 above the longest harmless gap in Loki's history.

  **2026-09-27: the rule this bullet asks for now pages, and delivery is proven.** The
  `removeFriendOtherSide` rule had `severity: critical` but not the `urgency: page` label the page
  route matches, so it went out on the root route like any other dead letter; it carries the label
  now. Proven end to end on `cellar-stack`: a SYNTHETIC-tagged OTLP record shaped like this dead
  letter, pushed into `otel-lgtm:4318`, made the rule fire at the next evaluation and a
  Discord-shaped notification reach a throwaway webhook sink 16 seconds later (the page route's
  10s), then `[RESOLVED]` after the 5-minute window; a negative control with a different
  `event_name` fired nothing. Two corrections to what is written above came with it: every rule's
  window had silently been **doubled** by its query type (the `range`-query bullet below), so "resolves 90
  minutes after" was 180 until then; and recreating `otel-lgtm` no longer wipes Loki, so the
  dead-man's switch's post-recreate false page is gone except on an empty volume.

  **Corrected by E3b (2026-09-10), measured against live Loki.** The query written here was
  wrong twice over and would have matched nothing, silently, forever — the exact failure this
  bullet exists to prevent. `event_name` is an OTLP log-record attribute, so it is Loki
  *structured metadata* and must be filtered **after** a pipe, never used as a stream selector
  (§7 of this document already says so 55 lines below — the two passages contradicted each
  other). And the method attribute is emitted as `outbox.method`
  (`services/actors/src/actors/outbox-actor.ts`), which reaches Loki as `outbox_method`; a bare
  `method` label does not exist at all. The rule that ships is:
  `{service_name="actors"} | event_name="outbox.dead_letter" | outbox_method="removeFriendOtherSide"`
  — verified against 11 real dead-letter rows, where the old form returned 0.
- **Never `res.send(err)` from the actor host.** A7b found the default handler was leaking SQL:
  JSON-encoding an `Error` drops `message` and `stack` (both non-enumerable) and ships whatever own
  enumerable properties the error happens to carry — for a `pg` `DatabaseError` that is `detail`,
  `where`, `internalQuery` and `table`, i.e. fragments of the failing query, straight to the client.
  `services/actors/src/lib/actor-error-envelope.ts` now emits `{code, message}` for the five known
  `ActorError` subclasses and a bare `{"code":"INTERNAL"}` for everything else, with the real error
  logged host-side. A test asserts none of the `pg` fields survive.
- **Dapr's actor error protocol is `200` plus an `X-Daprerrorresponseheader`, not a non-2xx status.**
  daprd checks the app's status before any header and folds every non-200 into
  `ERR_ACTOR_INVOKE_METHOD`, embedding the body inside a string. Anything reading actor responses
  must treat `200 + header` as failure — `OutboxActor` originally checked `response.ok` alone, which
  would have recorded a delivery to a target throwing `NotFoundError` as `delivered` and silently
  dropped the work.

- **Dapr actor calls are per-id single-threaded.** A singleton search actor would serialize every
  search in the app. Key search actors by input hash, never by a constant.

- **A reminder survives a full restart of the actor host *and* its sidecar** — measured by A5
  (2026-09-09), which is the question the plan's §6.4 confirmation became once A2 established that
  an `actorStateStore` component is mandatory. `ProbeJobActor.armRestartProbe` registered a
  **one-shot** reminder 90s out, recorded the process's boot id, and then
  `docker compose restart actors actors-dapr` replaced both containers. The reminder fired on
  schedule into the new process:
  ```
  armedAt 05:40:22.677Z  armedBootId 1c31b2e7-7900-45c9-a184-952d289d996e
  firedAt 05:41:52.686Z  firedBootId 2267ac36-315a-40ab-9fc8-7763d4d0d563  firedUptime 21s
  ```
  Different boot ids, 90.009s apart, in a process 21 seconds old: the reminder outlived the process
  that registered it and was not re-registered on the way. Durability comes from the **Scheduler's
  etcd volume** (`scheduler-data`, Dapr ≥ 1.15), not from the `state.in-memory` actor state store —
  so a one-shot reminder is safe to rely on, and `scheduler-data` is a volume that must be backed up
  and must not be recreated casually (E3). Deliberately a *one-shot*: `OutboxActor`'s 2s keep-alive
  is re-armed on every boot and could therefore prove nothing.

- **A container cannot SIGKILL itself when its app is PID 1.** `process.kill(process.pid, "SIGKILL")`
  from inside `node src/index.ts` is silently discarded — the kernel drops signals sent to PID 1 from
  within its own PID namespace unless PID 1 installed a handler. The process logged the kill and kept
  serving. `docker kill` works (different namespace); in-process, only `process.exit()` ends it.
  Anything that tests crash behaviour from inside the app has to know this or it will "pass" without
  ever having crashed.

- **Loki indexes OTLP resource attributes, not log-record attributes.** `service.name` becomes the
  label `service_name` and is selectable in `{…}`; every log-record attribute (`event.name`,
  `outbox.id`, …) becomes **structured metadata** and is filtered *after* the pipe. So the dead-letter
  query is `{service_name="actors"} | event_name="outbox.dead_letter"`, and the natural-looking
  `{service_name="actors", event_name="outbox.dead_letter"}` matches nothing — indistinguishable, from
  the query side, from the event never having been emitted. Grafana dashboards (E3) must use the
  first form.

- **A Grafana alert rule on a Loki `range` query evaluates a window of `relativeTimeRange` + the
  LogQL window, not the LogQL window.** Grafana runs `sum(count_over_time(…[W]))` at every step of
  the range, Loki omits the steps whose count is zero, and the `last` reducer takes the last
  *non-empty* step — so an event keeps the rule firing until it has left the window at every
  step. With `relativeTimeRange` equal to `W`, as every provisioned rule had it, each window was
  doubled: Grafana's own state history shows the 2026-09-26 regression page lasting 15:38:50 →
  18:38:50 on a "90-minute" rule, and `POST /api/v1/eval` with a fixed `now` reproduces it (range
  still firing at +179 min; instant empty at +91). The `instant: true` sitting beside
  `queryType: range` in the model did nothing. Every rule is `queryType: instant` since
  2026-09-27; a rule whose query is `… or vector(0)` was never affected, because every step has a
  value and the last one is `now`.

- **`grafana/otel-lgtm` is a demo image, and its defaults are demo defaults.** Measured on
  0.32.1: anonymous access on **with org role Admin**; no `VOLUME`, so a recreate discards every
  log, metric, trace and all of Grafana's state; Loki with no retention at all; a 5-second
  shutdown budget that SIGKILLs Loki and Tempo mid-flush; a HEALTHCHECK that reports a dead Loki
  as healthy; no `wget` (so a `wget` healthcheck can never pass). And `GF_SECURITY_ADMIN_PASSWORD`
  applies only to a new database, while `grafana cli admin reset-admin-password` run by
  `docker exec` without `GF_PATHS_DATA` resets a freshly created *different* database and reports
  success. Each is handled in the compose files; the measurements and procedures are in
  `deploy-loki.md` §9.

- **RLS was spiked and rejected** (§6.2, §8). If it is ever reconsidered, the spike's headline is
  that there is no single policy pattern and the wrong one costs 300×. The rest of its findings
  were only ever a pointer to a 2026-09-07 session artifact that is not in this repository, so
  they are not reproducible from here; re-spike rather than trusting a summary of a missing file.

---

## 8. Explicitly rejected

Don't re-propose these without new information.

| Rejected | Why |
|---|---|
| Staying on Hasura v2 CE | Agents work poorly with it: permissions in untyped YAML, Kriti transforms, and no offline verification — `tsc` and `gql.tada` do not catch invalid GraphQL fields, so queries must be validated against a live instance. |
| PostGraphile v5 | Customization means Grafast plans, smart tags as SQL `COMMENT`s, and a behaviors DSL — near-zero training data. No v5 PostGIS plugin. Schema still comes from live introspection. |
| Postgres RLS as the authorization layer | Actors cache aggregates across viewers, so visibility must be decided in code; RLS could only ever be defence-in-depth, and 141 policies for a path that doesn't exist is dead weight. |
| Dapr state store holding domain data or internals | Postgres is the truth; the outbox provides durability without it. A component must still be *declared* or Dapr will not host actors — see Q30 — but it stays empty. |
| Dapr Workflows (for now) | JS SDK reliability unvalidated. Steps are idempotent actor calls, so adoption later is additive. |
| One-transaction cross-aggregate writes | Tempting because Postgres is shared; breaks single-writer and stales peer caches; agents would widen the exception. |
| `FriendshipActor` keyed by user pair | Cleaner lock boundary, rejected in favour of `UserActor` owning edges. |
| Singleton `SearchActor` | Serializes all searches; keyed-by-hash instead. |
| Preserving Hasura's schema shape | No users to protect; re-implementing `where`/`_aggregate`/`on_conflict` fights the actor read model. |
| GraphQL subscriptions | Two existed; polling removes pub/sub from the stack. |
| Minimal cutover | Rejected in favour of chasing the end state; only the item consolidation is deferred. |
| SDL-first + graphql-codegen | Reasonable fallback, but Pothos is better once actors define the resolver shape. |
| Kysely / `kysely-codegen` / `drizzle-graphql` / `grats` / `garph` / `gqtx` / graphile-worker | Superseded by the choices above; details in the 2026-09-07 comparison artifacts. |
| A project-owned Pothos generator | Would be a worse PostGraphile with no docs and a bus factor of one. |

---

## 9. Related documents

- [`migration-plan.md`](./migration-plan.md) — actor catalog, writer map, workstreams, cutover runbook
- RLS spike results — session artifact, 2026-09-07
- Nhost exit analysis and Hasura destination comparison — session artifacts, 2026-09-07
