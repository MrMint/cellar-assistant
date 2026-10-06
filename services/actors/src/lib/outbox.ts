/**
 * Writing to the outbox — the half of §1.4 that every other actor uses.
 *
 * > When a write needs a follow-up — regenerate a vector, notify a peer actor,
 * > retry a cross-actor call, generate insights, run something later — the
 * > actor inserts an `outbox` row **in the same transaction** as its domain
 * > write.
 *
 * So the call always looks like this, and never like anything else:
 *
 * ```ts
 * await this.tx(async (tx) => {
 *   await tx.update(recipes).set({ name }).where(eq(recipes.id, this.key));
 *   await enqueueOutbox(tx, OUTBOX_TARGETS["RecipeActor.regenerateVector"], {
 *     targetId: this.key,
 *     payload: { reason: "rename" },
 *   });
 * });
 * ```
 *
 * The second argument is a **handle** from `OUTBOX_TARGETS`
 * (`./outbox-targets.ts`): the pair and the payload type the target method
 * declares, so an undeclared pair or a payload of the wrong shape is a compile
 * error here rather than a dead letter later.
 *
 * The `tx` argument is not decoration: passing `this.db` instead would commit
 * the intent separately from the write it belongs to, and that is precisely the
 * failure mode the outbox exists to prevent. `outbox` is exempt from the
 * single-writer rule for exactly this reason (§3, `infrastructure:outbox`) —
 * every actor inserts, only `OutboxActor` updates status.
 *
 * ## Ordering
 *
 * Two rows enqueued in sequence are *delivered* in sequence. `outbox.seq` is a
 * `bigserial` assigned at INSERT and the drain claims by `(run_after, seq)`, so
 * ordering is total even inside one transaction — where `created_at` ties and
 * `id`, a random uuid, never meant anything (A7b; A5's report explains what
 * this replaces).
 *
 * That is ordering of the first *attempt*, not serialised execution. A failed
 * row is rescheduled with backoff and therefore lands behind rows enqueued
 * after it, and delivery is at least once either way — so ordering is a
 * convenience, and idempotency (below) is still the contract.
 *
 * ## Every call to this function is a privilege boundary
 *
 * The row you write here is delivered with `systemCtx`, and `bypassesPolicy`
 * returns true for `system`, so every owner gate in this codebase opens on it.
 * Whatever an authenticated caller can persuade an actor to enqueue is
 * therefore executed with policy off. Two consequences, and the second is the
 * one that has actually bitten:
 *
 * 1. **The pair has to be declared.** The handle has to come from
 *    `OUTBOX_TARGETS` (`./outbox-targets.ts`) — the compiler holds that — and
 *    its entry has to list *this* module as an enqueuer, which
 *    `outbox-targets.test.ts` checks by scanning every call site in
 *    `services/actors/src`. `OutboxActor` refuses an undeclared pair at
 *    delivery time rather than invoking it, whatever the row says.
 * 2. **A caller-supplied `targetId` has to be authorized before the row is
 *    written.** The far end cannot do it: by the time the delivery arrives
 *    there is no viewer to authorize. E5a found two sites that had not —
 *    `ItemOnboardingActor.confirm` enqueuing `CellarActor.addItem` on a
 *    caller's `cellarId` and `ItemActor.linkBrand` on a caller's `itemId`.
 *    `BarcodeActor.linkItem` is the house pattern: prove ownership of the id
 *    first, then enqueue. The registry records which targets take such an id,
 *    and the test keeps the inventory current.
 *
 * ## What the target method must guarantee
 *
 * Delivery is **at least once**. A row claimed and delivered by a drainer that
 * dies before recording the result is delivered again after the reclaim window.
 * §8.4: every method reachable from the outbox is either naturally idempotent
 * on a unique constraint, or takes an idempotency key — derived from the
 * delivery with `idempotencyKey(ctx, purpose, ...scope)` (`./delivery.ts`),
 * which reads the `ctx.delivery` only `OutboxActor` mints.
 *
 * ## Attribution, which is not authority
 *
 * Pass the enqueuing turn's `ctx` as `attributeTo`, and the row records who
 * caused it — `outbox.attributed_to`. It exists for one reader:
 * `BudgetActor.reserveForModel`, which copies it into
 * `api_usage_log.triggered_by` when a model call is made inside the delivery.
 * Without it every model call the outbox drove was booked to nobody (63 of 93
 * embedding rows and 13 of 13 menu extractions on the compose stack), and the
 * budget runbook's first question — which viewer is looping? — had no answer.
 *
 * It is attribution **only**, and that is held by construction rather than by
 * care:
 *
 *  - the delivery ctx carries no viewer. `OutboxActor` still invokes
 *    `method(systemCtx, payload)` with `viewerId: null`, and `ClaimedRow` does
 *    not even carry the column, so no target method can see it;
 *  - the value never enters a `Ctx`, so no policy function can be handed it —
 *    what a delivery ctx carries is `causedBy`, the *row* id, from which only
 *    this module and `BudgetActor` look the attribution up;
 *  - a caller cannot name an arbitrary id: `attributeTo` takes a `Ctx`, and
 *    the recorded value is that ctx's own viewer — or, for a system turn that
 *    descends from a delivery (`ctx.causedBy`, which survives the delivery's
 *    onward calls), whatever that row was attributed to, so a chain of
 *    deliveries stays attributed to the person who started it;
 *  - `outbox-attribution.test.ts` fails if any module but this one and
 *    `BudgetActor` names the column, or if the policy or contracts packages
 *    ever do.
 *
 * Omit it — or run in a system turn that is not a delivery, like
 * `MaintenanceActor`'s reminders — and the column is null, which is the honest
 * answer for work the system originated.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import type { SQL } from "@cellar-assistant/db/orm";
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { causedByOf, isCanonicalUuid } from "./delivery.ts";
import {
  type OutboxDelivery,
  type OutboxTarget,
  outboxCompensations,
} from "./outbox-targets.ts";

/**
 * The value `outbox.attributed_to` gets for a row enqueued in `ctx`'s turn, as
 * SQL: the viewer, for a user or admin turn; the attribution of the row a
 * system turn descends from (`ctx.causedBy`); otherwise null. See the module
 * doc.
 *
 * A subquery rather than a read-then-write, so it is one statement with the
 * insert and needs no extra round trip. `causedByOf` already refuses a
 * malformed row id (and any non-`system` ctx), so a bad one attributes to
 * nobody rather than failing the enqueue — and with it the domain write in
 * the same transaction.
 */
const attributionFor = (ctx: Ctx | undefined): SQL => {
  if (ctx === undefined) return sql`null::uuid`;
  if (ctx.kind !== "system") {
    return isCanonicalUuid(ctx.viewerId)
      ? sql`${ctx.viewerId}::uuid`
      : sql`null::uuid`;
  }
  const parent = causedByOf(ctx);
  return parent !== null
    ? sql`(select o.attributed_to from public.outbox o where o.id = ${parent}::uuid)`
    : sql`null::uuid`;
};

/** Options every enqueue takes. */
export type EnqueueOptions = {
  /**
   * The enqueuing turn's ctx, so the row records who caused it — for
   * `api_usage_log.triggered_by`, never for authority. See the module doc.
   */
  readonly attributeTo?: Ctx;
};

/**
 * `run_after` for {@link OutboxDelivery.delayMs}, as SQL on the database
 * clock.
 *
 * A delay, never a timestamp. This used to be `runAfter?: Date`, which the
 * callers filled with `new Date(Date.now() + interval)` — a host clock
 * written into the column `OutboxActor.#claim` compares against `now()`,
 * which is the exact thing `OutboxActor`'s decision 7 forbids. A host that
 * lags schedules work early by its lag; one that runs fast delays it. As a
 * delay it is written `now() + interval` in the statement, so there is no
 * host time to get wrong, and the type no longer admits one.
 *
 * A delay that is not a finite, non-negative number is a programming error
 * and throws before anything is written.
 */
const runAfterSql = (delayMs: number | undefined): SQL => {
  if (delayMs === undefined) return sql`now()`;
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error(`enqueueOutbox: delayMs must be >= 0, got ${delayMs}`);
  }
  return sql`now() + make_interval(secs => ${delayMs / 1000}::double precision)`;
};

/**
 * Insert one outbox row. Returns its id, which is also the delivery's
 * idempotency key.
 *
 * Pass the **transaction**, not the database.
 */
export const enqueueOutbox = async <TPayload>(
  tx: DbOrTx,
  target: OutboxTarget<string, TPayload>,
  delivery: OutboxDelivery<NoInfer<TPayload>>,
  options: EnqueueOptions = {},
): Promise<string> => {
  const [row] = await tx
    .insert(outbox)
    .values({
      targetActor: target.actorType,
      targetId: delivery.targetId,
      method: target.method,
      payload: delivery.payload ?? {},
      runAfter: runAfterSql(delivery.delayMs),
      attributedTo: attributionFor(options.attributeTo),
    })
    .returning({ id: outbox.id });
  if (row === undefined) throw new Error("enqueueOutbox: no row returned");
  return row.id;
};

/** Options for {@link enqueueOutboxOnce}. */
export type EnqueueOnceOptions = EnqueueOptions & {
  /**
   * An outbox row id to ignore when looking for a live duplicate — the
   * delivery whose execution *is* this call. It sits in `delivering` while it
   * runs, so without this it would match its own guard and convince the caller
   * that the work is already queued. `deliveryOf(ctx)?.outboxId`
   * (`./delivery.ts`), which is absent when a human forced the run.
   */
  readonly excludeRowId?: string | null;
  /**
   * Does a row already *being delivered* satisfy the request?
   *
   * Default `false`, and the default is the interesting case: a change made
   * while a delivery is in flight was not visible to that delivery, so
   * suppressing it would silently drop the follow-up. Counting only `pending`
   * costs at most one extra row per in-flight delivery and loses nothing.
   *
   * `MaintenanceActor`'s self-arming chains pass `true`, because there the
   * in-flight row *is* the next cycle — see `armCycle`.
   */
  readonly includeDelivering?: boolean;
};

/**
 * Insert one outbox row **unless an equivalent one is already queued**.
 *
 * ## What this is for
 *
 * `enqueueOutbox` is unconditional, which is right for a row that carries
 * information — `CellarActor.addItem`'s payload names an item, and two of them
 * are two different pieces of work. It is wrong for a row that carries none.
 *
 * `TierListActor.generateInsights` is the archetype: the payload is `{}`, the
 * method recomputes from whatever the aggregate holds *at delivery time*, and
 * it is throttled to one real generation per 24h. Thirty of those rows do the
 * work of one and occupy thirty slots in a queue that drains serially and
 * globally. Enqueuing them unconditionally is how one authenticated request
 * put thirty rows ahead of every other user's friend confirmations, vector
 * regenerations and menu scans.
 *
 * So this bounds the queue at **one live row per
 * `(target_actor, target_id, method)`** — without dropping work, which is the
 * distinction that matters. Nothing is rejected and nothing is rate-limited;
 * a second request for work that is already queued is simply already
 * satisfied.
 *
 * ## When NOT to use it
 *
 * **The guard ignores `payload`.** Two rows with the same target and method
 * but different payloads are two different jobs, and this would collapse them
 * into one and lose the second. Use it only where the payload is empty or
 * carries nothing the delivery needs — i.e. where the method is idempotent by
 * *recomputation*, not by key.
 *
 * ## Why it is safe — and it is not because of the one statement
 *
 * The `INSERT … SELECT … WHERE NOT EXISTS` below does **not** close the race
 * on its own, whatever it looks like. Under READ COMMITTED (the default, and
 * what `this.tx()` runs at) two transactions executing it at once each
 * evaluate `NOT EXISTS` against the rows committed when their statement
 * began; neither can see the other's uncommitted insert, so both insert.
 * Nothing makes the second one wait: no lock is taken, and no unique index
 * backs the guard — `outbox_live_target_idx` is a plain index that makes the
 * lookup cheap, not a constraint that could refuse a duplicate. One statement
 * only saves the round trip that a read-then-`enqueueOutbox` would spend.
 *
 * What makes it safe today is who calls it. Both callers —
 * `TierListActor`'s `#bumpContentAndEnqueueInsights` (queueing its own
 * `generateInsights`) and `MaintenanceActor.armCycle` — enqueue for **their
 * own actor**: `targetActor` is their own type and `targetId` is `this.key`.
 * Dapr runs one turn at a time per actor id, and a turn's transaction commits
 * before the turn ends, so two calls guarding the same
 * `(target_actor, target_id, method)` are always serialised by the actor
 * runtime and the second one sees the first one's row.
 *
 * So these break it, and each would need a real lock (`pg_advisory_xact_lock`
 * on the triple, or a partial unique index over live rows) before it lands:
 *
 *  - enqueueing for **another** actor's id, which some other turn of that
 *    actor — or a third actor — could be guarding at the same moment;
 *  - calling it outside an actor turn (a script, a migration, a test driving
 *    two transactions);
 *  - Dapr running two turns of one actor id at once — a placement split
 *    during a rolling deploy is the realistic way — which lets exactly the
 *    duplicate through for that window.
 *
 * The cost of a breach is bounded, because this is only for payload-free,
 * recompute-at-delivery work (above): a duplicate live row wastes one queue
 * slot and one delivery, and loses nothing. `outbox` is the one table §3
 * lets any actor insert into, so writing it here needs no other permission.
 *
 * Returns the new row's id, or `null` if an equivalent row was already live.
 */
export const enqueueOutboxOnce = async <TPayload>(
  tx: DbOrTx,
  target: OutboxTarget<string, TPayload>,
  delivery: OutboxDelivery<NoInfer<TPayload>>,
  options: EnqueueOnceOptions = {},
): Promise<string | null> => {
  const live =
    options.includeDelivering === true
      ? sql`status in ('pending', 'delivering')`
      : sql`status = 'pending'`;
  const exclude = options.excludeRowId ?? null;
  const result = await tx.execute<{ id: string }>(sql`
    insert into public.outbox (target_actor, target_id, method, payload, run_after, attributed_to)
    select ${target.actorType}, ${delivery.targetId}, ${target.method},
           ${JSON.stringify(delivery.payload ?? {})}::jsonb,
           ${runAfterSql(delivery.delayMs)},
           ${attributionFor(options.attributeTo)}
    where not exists (
      select 1 from public.outbox
      where target_actor = ${target.actorType}
        and target_id = ${delivery.targetId}
        and method = ${target.method}
        and ${live}
        and (${exclude}::uuid is null or id <> ${exclude}::uuid)
    )
    returning id
  `);
  return result.rows[0]?.id ?? null;
};

/* -------------------------------------------------------------------------- */
/* Compensations                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every declared `onDead`, as the JSON the statement below joins against.
 * Computed once: the registry is plain data fixed at build time.
 */
const COMPENSATIONS_JSON = JSON.stringify(
  outboxCompensations().map((c) => ({
    target_actor: c.targetActor,
    method: c.method,
    on_dead: c.onDead,
  })),
);

/** The CTE names the drainer's two dead-letter statements use. */
export type DeadRowsCte = "failed" | "reclaimed";

/**
 * The compensating half of a dead-letter statement: for each row of the CTE
 * `dead` that is now `status = 'dead'` and whose pair declares an `onDead`,
 * insert that method's row — same actor, same `target_id`, payload a
 * `DeadDeliveryNotice`, attributed to whoever the dead row was — and return
 * `(id, dead_outbox_id)` for each one written.
 *
 * `dead` must expose `id, target_actor, target_id, method, payload, status,
 * dead_reason` — `OutboxActor.#fail` and `#reclaimStale` build it from their
 * own `UPDATE … RETURNING`. The attribution is read here, from the row itself
 * (the statement's snapshot, which the `UPDATE` did not change), so the
 * drainer never names the column (`outbox-attribution.test.ts`).
 *
 * ## Why it is in the same statement, and why that makes it exactly once
 *
 * A data-modifying CTE commits with the `UPDATE` it reads, so there is no
 * moment at which a row is `dead` and its compensation not yet written — no
 * crash window between them, which a second statement would have. And a row
 * becomes `dead` once: both writers take it from `delivering` under a row
 * lock (`#fail` also under its claim token), so no two statements can both
 * see it transition. The `NOT EXISTS` on `deadOutboxId` is therefore not what
 * makes the drainer idempotent — it is what makes a *backfill* (the same
 * insert, run by hand over existing dead rows) safe to repeat.
 *
 * ## Why it lives here
 *
 * `lib/outbox.ts` is the only module that may insert into `outbox`
 * (`outbox-targets.test.ts`, "is the whole surface"). This third insert
 * cannot name an arbitrary pair: the only `(target_actor, method)` it can
 * write is one the registry declares as some pair's `onDead`, joined from
 * `outboxCompensations()`, which itself returns only declared compensations.
 */
export const insertCompensations = (dead: DeadRowsCte): SQL => sql`
  insert into public.outbox (target_actor, target_id, method, payload, attributed_to)
  select d.target_actor, d.target_id, c.on_dead,
         jsonb_build_object(
           'deadOutboxId', d.id,
           'deadMethod', d.method,
           'reason', d.dead_reason,
           'deadPayload', d.payload
         ),
         (select src.attributed_to from public.outbox src where src.id = d.id)
  from ${sql.raw(dead)} d
  join jsonb_to_recordset(${COMPENSATIONS_JSON}::jsonb)
         as c(target_actor text, method text, on_dead text)
    on c.target_actor = d.target_actor and c.method = d.method
  where d.status = 'dead'
    and not exists (
      select 1 from public.outbox o
      where o.target_actor = d.target_actor
        and o.target_id = d.target_id
        and o.method = c.on_dead
        and o.payload->>'deadOutboxId' = d.id::text
    )
  returning id, payload->>'deadOutboxId' as dead_outbox_id, method
`;
