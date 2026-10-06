/**
 * `OutboxActor` — the drainer (migration plan §1.4, §2.7).
 *
 * > **`OutboxActor()`** — singleton. Reminder-registered keep-alive (`drain`,
 * > every 2s). Reads `outbox` rows `where status='pending' and run_after <=
 * > now()` ordered by id, batch 100, invokes `target_actor.method(ctx.system,
 * > payload)`, marks delivered or increments attempts; dead-letters at 10 with
 * > exponential backoff between. Idempotency is the target method's
 * > responsibility.
 *
 * This is the only durability primitive for side effects in the system. If it
 * loses a row, the system loses work silently, so the design is deliberately
 * boring: Postgres holds the queue, every state change is a committed row, and
 * nothing lives in memory across a turn that matters.
 *
 * ## The lifecycle of a row
 *
 * ```
 *   pending ──claim──▶ delivering ──2xx──▶ delivered
 *      ▲                    │
 *      │                    ├──error, attempts < 10──▶ pending, run_after += backoff
 *      │                    ├──error, attempts = 10──▶ dead
 *      │                    └──permanent error────────▶ dead (any attempt)
 *      └──reclaim (stuck > 10 min: the host died mid-delivery)
 * ```
 *
 * Five decisions in there are load-bearing:
 *
 * 1. **Claim before calling.** `status='delivering'` is committed before the
 *    invocation, so a second drainer (or a restarted one) cannot pick the same
 *    row up while it is in flight. `FOR UPDATE SKIP LOCKED` makes the claim
 *    itself safe under concurrency even though §1.5 keys this actor as a
 *    singleton — the singleton is a serialization *choice*, not a correctness
 *    dependency, and a rolling deploy briefly runs two hosts.
 * 2. **A stuck claim is reclaimed, not orphaned.** If the process dies between
 *    the claim and the outcome, the row would otherwise sit in `delivering`
 *    forever. It is charged an attempt on reclaim, so a message that reliably
 *    kills the host still dead-letters rather than crash-looping.
 * 3. **An attempt is charged when a delivery is actually attempted** — never at
 *    claim time. Rows claimed and released unattempted (the drain deadline)
 *    keep their attempt budget.
 * 4. **Delivery is at least once.** The target learns which delivery it is
 *    from `ctx.delivery = { outboxId, attempt, final }`, minted here and
 *    nowhere else ({@link deliveryArgs}), and derives any key it needs from
 *    that with `idempotencyKey` (`lib/delivery.ts`). It used to parse
 *    `ctx.requestId` for an `outbox:` prefix; `requestId` still carries that
 *    form, for log correlation only.
 * 5. **A failure retrying cannot clear dies immediately** (`isPermanentFailure`
 *    below). Retrying a `VALIDATION` nine more times does not make the payload
 *    valid; it just delays the dead letter by seventeen minutes and buries the
 *    real cause under nine identical `outbox.retry` events.
 * 6. **An outcome is only recorded by the claim that earned it.** `#claim`
 *    mints a `claim_token`; the success write, `#fail` and `#release` all carry
 *    it in the `WHERE`. A deliverer whose claim the reclaim sweep has taken
 *    away writes nothing (`lostClaim`), instead of resurrecting a `delivered`
 *    row or rewriting `attempts` from a snapshot taken before the reclaim.
 * 7. **Every timestamp the queue reasons about comes from the database.**
 *    `run_after` and `updated_at` are written as `now()` expressions, never as
 *    a host `Date`. Two hosts do not share a clock, and a host that lags writes
 *    a `run_after` that is already in the past by the database's reckoning —
 *    which turns the backoff ladder into a hot loop.
 *
 * ## What bounds the capability
 *
 * `deliver` invokes an arbitrary `(target_actor, method)` with `systemCtx`, and
 * `bypassesPolicy` is true for `system`, so a delivery runs with every owner
 * gate open. That is the design — a follow-up has no viewer to authorize — but
 * for a long time the *only* validation a row received was "not myself", which
 * is a reentrancy guard and not an authorization one. `#deliverOne` now checks
 * the pair against `OUTBOX_TARGETS` (`services/actors/src/lib/outbox-targets.ts`) and
 * dead-letters an undeclared one on attempt 1. The typed handles in that module
 * are the other half: an enqueue site can only name a declared pair, so a
 * target that cannot be delivered also cannot be written.
 *
 * ## What bounds the table
 *
 * Nothing used to delete an outbox row. `#reapDelivered` now does, hourly and
 * in bounded batches — `delivered` rows only, never `dead`, which is the
 * dead-letter report's only input and this system's only alarm on the queue.
 * The reclaim sweep also has an index now (`outbox_delivering_idx`); it was a
 * sequential scan every two seconds over a table that only grew.
 *
 * ## Ordering
 *
 * §2.7 says "ordered by id". `outbox.id` is a random v4 uuid, so ordering by it
 * is *arbitrary*, not FIFO — see the A5 report. A5 ordered by
 * `(run_after, created_at, id)` instead, which was FIFO for everything except
 * the case that matters most: rows written by one transaction share
 * `created_at` (it is transaction-*start* time), so the tie fell through to a
 * random uuid.
 *
 * **A7b closed that.** `outbox.seq` is a `bigserial` assigned at INSERT, so
 * `(run_after, seq)` is a total order and is insertion order within a
 * transaction. Two rows enqueued in sequence now drain in sequence.
 *
 * Two halves are needed and only one of them is the `ORDER BY`. `UPDATE … WHERE
 * id IN (SELECT … ORDER BY … LIMIT n) RETURNING` does **not** return rows in the
 * subquery's order — the planner is free to emit them in whatever order the join
 * produces, and it does. The claim is a CTE whose final `SELECT` re-imposes the
 * order on the way out; without that the ordered claim would still be delivered
 * arbitrarily.
 *
 * This is still not a *guarantee* of sequential execution: delivery is at least
 * once, a failure reschedules a row behind its successors, and §8.4 idempotency
 * remains every target method's job. What it guarantees is that the first
 * *attempt* of two rows enqueued together happens in the order they were
 * enqueued.
 */
import { randomUUID } from "node:crypto";
import {
  type ActorCategory,
  type ActorDescriptor,
  type AnyActorDescriptor,
  actorMethodMeta,
  type Ctx,
  isActorError,
  systemCtx,
} from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import { ActorBase } from "../lib/actor-base.ts";
import {
  aiRequestTimeoutMs,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  selectProvider,
} from "../lib/ai/config.ts";
import type { DbOrTx } from "../lib/db.ts";
import { requirePrivileged } from "../lib/guards.ts";
import type { KeepAlive } from "../lib/keep-alive.ts";
import { insertCompensations } from "../lib/outbox.ts";
import { isAllowedOutboxTarget, outboxTarget } from "../lib/outbox-targets.ts";
import { invokeActorMethod } from "../lib/sidecar.ts";
import { emit } from "../lib/telemetry.ts";

/** Dapr actor type name — the class name `src/actors/registry.ts` registers. */
export const OUTBOX_ACTOR_TYPE = "OutboxActor";

/**
 * The singleton's id. §1.5 reserves true singletons for things that *should*
 * serialize, and a queue drainer is the archetype: one turn at a time is what
 * makes "in order" mean anything.
 */
export const OUTBOX_ACTOR_ID = "singleton";

/** Reminder name for the keep-alive. Re-registering the name is idempotent. */
export const DRAIN_REMINDER = "drain";

/** §2.7: every 2s. */
export const DRAIN_PERIOD = "2s";

/** §2.7: batch 100. */
export const DRAIN_BATCH_SIZE = 100;

/** §2.7: dead-letter at 10. */
export const MAX_ATTEMPTS = 10;

/** First retry waits this long; each subsequent one doubles. */
export const BACKOFF_BASE_MS = 2_000;

/** Ceiling on the backoff, so an attempt-9 retry is not a two-hour nap. */
export const BACKOFF_CAP_MS = 600_000;

/**
 * How long a `delivering` row may sit before a drainer assumes the host that
 * claimed it is gone. Comfortably above the delivery timeout, so a slow call is
 * never reclaimed underneath itself — and that "comfortably" is now *enforced*
 * rather than asserted: see {@link MAX_DELIVERY_TIMEOUT_MS}.
 */
export const RECLAIM_AFTER_MS = 10 * 60 * 1000;

/**
 * The same bound as a Postgres interval literal, **derived** rather than
 * written a second time. The cross-check below compares timeouts against the
 * millisecond form; two hand-maintained copies of "ten minutes" would drift
 * silently, and the thing that would then be wrong is the one invariant
 * holding the reclaim sweep apart from a live delivery.
 */
export const RECLAIM_AFTER = `${RECLAIM_AFTER_MS / 1000} seconds`;

/**
 * Ceiling on `OUTBOX_DELIVERY_TIMEOUT_MS`.
 *
 * A delivery timeout at or above `RECLAIM_AFTER` is not a slow setting, it is
 * a correctness hole: the reclaim sweep takes the row back *while the original
 * delivery is still running*, and from there the two race to record an
 * outcome. That race is the whole of finding B, and the claim token
 * ({@link ClaimedRow.claimedAt}) now makes it harmless — but a configuration
 * that manufactures it on every single delivery is still wrong, and until this
 * bound existed `envInt` accepted any positive integer with no upper limit and
 * no relationship to `RECLAIM_AFTER` at all.
 *
 * Half, so the two halves of a worst-case turn — the drain deadline, then one
 * delivery that runs to its timeout — cannot together exceed `RECLAIM_AFTER`.
 */
export const MAX_DELIVERY_TIMEOUT_MS = RECLAIM_AFTER_MS / 2;

/** Ceiling on `OUTBOX_DRAIN_DEADLINE_MS`; the other half of the same sum. */
export const MAX_DRAIN_DEADLINE_MS = RECLAIM_AFTER_MS / 2;

/** Names already warned about, so a per-delivery read is not a per-delivery log line. */
const clamped = new Set<string>();

/**
 * A positive integer from the environment, **bounded**.
 *
 * A value over `max` is clamped rather than rejected: refusing to boot over a
 * tuning knob is worse than running at the largest value that is still safe,
 * and the warning says which happened.
 */
const envInt = (
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  if (value <= max) return value;
  if (!clamped.has(name)) {
    clamped.add(name);
    emit({
      name: "outbox.env_clamped",
      severity: "WARN",
      message:
        `${name}=${value} exceeds ${max}ms and was clamped: a value at or ` +
        `above RECLAIM_AFTER (${RECLAIM_AFTER_MS}ms) has the reclaim sweep ` +
        "take rows back from deliveries that are still running",
      attributes: {
        "outbox.env": name,
        "outbox.requested": value,
        "outbox.applied": max,
      },
    });
  }
  return max;
};

/** The value `OUTBOX_DELIVERY_TIMEOUT_MS` takes when nobody sets it. */
export const DEFAULT_DELIVERY_TIMEOUT_MS = 30_000;

/**
 * The non-model half of a delivery: the sidecar hop, the actor's aggregate
 * load, the guard, and the writes on either side of the call.
 *
 * Measured on the compose stack against the heaviest outbox-delivered model
 * method there is — `TierListActor.generateInsights`, on its throttled path,
 * which is that whole turn minus the model call: **32ms**. Five seconds is
 * therefore not a budget, it is a margin with two orders of magnitude of room,
 * and it is spent only in the case it exists for: a model call that runs all
 * the way to `AI_REQUEST_TIMEOUT_MS` and is about to be classified.
 */
export const DELIVERY_OVERHEAD_MS = 5_000;

/** Names already warned about raising, alongside {@link clamped}. */
const raised = new Set<string>();

/**
 * The shortest delivery timeout that cannot truncate a model call, or `0`
 * where no delivery can make one.
 *
 * With `AI_PROVIDER` unset every seam throws before it reaches a provider
 * (`lib/ai/seams.ts`), so no delivery can be slow for this reason and the
 * floor is nothing. Anything else and it is `AI_REQUEST_TIMEOUT_MS` plus
 * {@link DELIVERY_OVERHEAD_MS}, capped by {@link MAX_DELIVERY_TIMEOUT_MS} —
 * which the cap can only bind if the AI layer is configured to wait longer
 * than half the reclaim window, and then the warning in `deliveryTimeoutMs`
 * says so.
 *
 * Reading the AI config can throw (`AI_PROVIDER=vertex`,
 * `AI_REQUEST_TIMEOUT_MS=soon`). `installAI()` already fails the boot over
 * both, so the queue does not get a vote — but if it is running at all, the
 * safe answer to "might a delivery make a model call" is yes.
 */
export const modelCallFloorMs = (): number => {
  let mayCallModel: boolean;
  try {
    mayCallModel = selectProvider() !== null;
  } catch {
    mayCallModel = true;
  }
  if (!mayCallModel) return 0;

  let aiTimeout: number;
  try {
    aiTimeout = aiRequestTimeoutMs();
  } catch {
    aiTimeout = DEFAULT_AI_REQUEST_TIMEOUT_MS;
  }
  return Math.min(aiTimeout + DELIVERY_OVERHEAD_MS, MAX_DELIVERY_TIMEOUT_MS);
};

/**
 * Bound on one delivery, **floored so it cannot cut a model call short**.
 *
 * The docstring this replaces said outbox work "is expected to be short:
 * §8.5's two 120-second exceptions are request-driven, and long work is
 * chunked by a `JobActor` into one outbox row per batch". Both halves are
 * true and neither covers the case that matters. Chunking bounds how many
 * *rows* a job takes; it does nothing about how long one row's model call
 * runs, and three outbox-delivered methods make one —
 * `TierListActor.generateInsights`, `MenuScanActor.process` (whose own comment
 * calls it "a 30-second vision call") and `RecipePhotoJobActor`'s `extract`
 * stage. Against a 30-second delivery timeout, the *expected* duration of one
 * of those is the timeout.
 *
 * What that costs, measured on the compose stack at 22:28:57Z against
 * `gemma3:4b`: `generateInsights` for one tier list, attempt 1 aborted at
 * exactly 30.0s, attempt 2 aborted at exactly 30.0s, attempt 3 succeeded in
 * 2.0s — and `tier_lists.insights_generated_at` landed on attempt 3, so the
 * first two turns' work was thrown away, not merely unreported. The model was
 * asked three times for one answer. A call that reliably exceeds 30s does that
 * ten times and then dead-letters, having delivered nothing.
 *
 * The abort is also why the AI layer's own error classification never gets to
 * run: `lib/ai/http.ts` turns a 400 into a permanent `ValidationError` that
 * `isPermanentFailure` kills on attempt 1, but only if the call is allowed to
 * *return*. Cut it off at 30s and every model failure is a generic retry.
 *
 * So the floor is the AI layer's own bound. It is the exact mirror of the
 * ceiling above: that one says a delivery may not outlive the reclaim sweep,
 * this one says it may not die before the thing it is waiting on.
 *
 * ## What it costs, stated honestly
 *
 * The drainer is a singleton and delivers serially, so a delivery's timeout is
 * also how long one row may hold the queue. The trade is not uniform:
 *
 *  - **A slow call that succeeds** — the case this fixes — gets *cheaper*. A
 *    35-second generation used to hold the drain for 30s and then do it again;
 *    now it holds it for 35s once.
 *  - **A provider that hangs** gets dearer, and by exactly the ratio between
 *    the two knobs. Measured here at 22:45:33Z with `gemma3:4b` evicted and
 *    the host contended: one delivery sat `delivering` for 120s and then
 *    failed with the AI layer's own message (`ollama generateContent … could
 *    not be reached … The operation timed out`) rather than the drainer's
 *    anonymous one. Ten of those is twenty minutes of blocked queue where it
 *    used to be five.
 *
 * That second row is the price of the first, and the lever for it is
 * `AI_REQUEST_TIMEOUT_MS`, which the floor follows down. That is the right
 * lever: it is the only honest statement of how long a model call may take,
 * and the bug was that two knobs disagreed about it and the queue silently
 * won.
 */
export const deliveryTimeoutMs = (): number => {
  const configured = envInt(
    "OUTBOX_DELIVERY_TIMEOUT_MS",
    DEFAULT_DELIVERY_TIMEOUT_MS,
    MAX_DELIVERY_TIMEOUT_MS,
  );
  const floor = modelCallFloorMs();
  if (configured >= floor) return configured;
  if (!raised.has("OUTBOX_DELIVERY_TIMEOUT_MS")) {
    raised.add("OUTBOX_DELIVERY_TIMEOUT_MS");
    emit({
      name: "outbox.delivery_timeout_raised",
      severity: "WARN",
      message:
        `OUTBOX_DELIVERY_TIMEOUT_MS=${configured} is below AI_REQUEST_TIMEOUT_MS ` +
        `plus ${DELIVERY_OVERHEAD_MS}ms of turn overhead and was raised to ` +
        `${floor}: a delivery that gives up before the model call it is ` +
        "waiting on discards that call's work and asks the provider the same " +
        "question again on every retry",
      attributes: {
        "outbox.env": "OUTBOX_DELIVERY_TIMEOUT_MS",
        "outbox.requested": configured,
        "outbox.applied": floor,
      },
    });
  }
  return floor;
};

/**
 * Bound on one delivery **of this pair**: {@link deliveryTimeoutMs}, unless the
 * target method's descriptor declares a longer `timeoutMs` — then that, never
 * more than {@link MAX_DELIVERY_TIMEOUT_MS}.
 *
 * `ActorMethodMeta.timeoutMs` is documented as how long **any** caller waits
 * for the method, and the API and the actors' own typed client both honour
 * it. The drainer did not: it waited `deliveryTimeoutMs()` for every row. A
 * job's `runBatch` nests calls with their own long budgets —
 * `PlaceActor.refreshFromSource` is 90s, `bulkUpsertFromOverture` 120s — so a
 * batch that was merely slow was aborted client-side at 30s, charged an
 * attempt, and retried while its first turn was still running and about to
 * commit; the retry then queued behind the turn lock and answered
 * `duplicate`, and a batch slow enough, often enough, dead-lettered a job that
 * had been making progress all along.
 *
 * Why the declared value is only ever a *raise*: most pairs declare nothing
 * (the descriptor default, 15s, is a request-path number), and a delivery that
 * makes a model call relies on the floor `deliveryTimeoutMs` applies. Taking
 * the larger of the two keeps both promises.
 *
 * Why the ceiling still applies: a delivery timeout past half of
 * `RECLAIM_AFTER` lets the reclaim sweep take a row back from a delivery that
 * is still running (see {@link MAX_DELIVERY_TIMEOUT_MS}). The ceiling here
 * never binds in practice — `outbox-actor.test.ts` fails if any declared
 * outbox pair asks for more — but a descriptor edit must not be able to buy a
 * longer delivery at the sweep's expense.
 *
 * A pair the allow-list does not know gets the plain bound; `#deliverOne`
 * refuses it before this is asked anyway.
 */
export const pairDeliveryTimeoutMs = (
  targetActor: string,
  method: string,
): number => {
  const pair = outboxTarget(targetActor, method);
  return pair === undefined
    ? deliveryTimeoutMs()
    : declaredDeliveryTimeoutMs(pair.descriptor, method);
};

/** {@link pairDeliveryTimeoutMs} for a descriptor in hand, which a test can make up. */
export const declaredDeliveryTimeoutMs = (
  descriptor: AnyActorDescriptor,
  method: string,
): number => {
  const bound = deliveryTimeoutMs();
  const declared = actorMethodMeta(descriptor, method)?.timeoutMs;
  if (declared === undefined || declared <= bound) return bound;
  return Math.min(declared, MAX_DELIVERY_TIMEOUT_MS);
};

/**
 * Bound on one drain turn. Dapr runs one turn at a time per actor id, so a
 * drain that outran the reminder period would queue reminders behind itself;
 * unattempted rows are released instead and picked up 2s later.
 */
export const drainDeadlineMs = (): number =>
  envInt("OUTBOX_DRAIN_DEADLINE_MS", 15_000, MAX_DRAIN_DEADLINE_MS);

/**
 * How long a `delivered` row is kept before the retention sweep deletes it.
 *
 * Nothing used to delete an outbox row, ever. That is a table that only grows,
 * and it grows under two queries that had to read all of it: the reclaim
 * sweep's `status = 'delivering'` scan, every 2 seconds, and the hourly
 * dead-letter report's `status = 'dead'` grouping. Measured on the compose
 * stack at 598 rows the reclaim sweep was already a `Seq Scan` touching 47
 * buffers; the fix for *that* is the partial index added alongside this, but
 * an index does not stop a table growing without bound.
 *
 * **`dead` rows are never deleted.** They are the only input the dead-letter
 * report has, and the report is this system's only alarm on the outbox.
 * `pending` and `delivering` rows are live work. Only `delivered` is history.
 *
 * 30 days by default — long enough to still be able to answer "did that
 * delivery ever happen?" about anything anybody is likely to ask.
 */
const retentionDays = (): number => envInt("OUTBOX_RETENTION_DAYS", 30, 3_650);

/**
 * At most one retention sweep an hour, per activation. The sweep runs inside a
 * drain turn (Dapr serializes turns, so it *is* the drain for as long as it
 * takes), which is why it is both throttled and batched.
 */
export const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Rows deleted per sweep. A bounded statement never becomes a long lock. */
export const RETENTION_BATCH = 5_000;

/**
 * How often the drain reminder emits `outbox.heartbeat`, per activation.
 *
 * The reminder fires every 2s; a line per firing would be 43,200 a day of
 * nothing. Once a minute is 1,440, and it is what the dead-man's rule
 * (`infra/grafana/provisioning/alerting/outbox-liveness-alerts.yaml`) counts:
 * it pages when five minutes pass without one — five missed beats, which a
 * restart of the actor host (well under a minute to re-arm the reminder)
 * does not reach.
 */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/** What `outbox.heartbeat` reports: the queue, as the database sees it. */
export type OutboxBacklog = {
  /** `pending` rows, due or not. */
  readonly pending: number;
  /** `pending` rows whose `run_after` has passed — work waiting on the drain. */
  readonly due: number;
  /**
   * How long the oldest due row has been due, in whole seconds of the
   * database's clock; `0` when nothing is due. A healthy drain claims due
   * rows within one 2s tick, so this is small unless the drain is stuck
   * behind something — which is what the backlog rule watches.
   */
  readonly oldestDueAgeS: number;
  /** Rows claimed and not yet resolved. */
  readonly delivering: number;
};

/**
 * The queue's shape, in one statement, on the database's clock (decision 7):
 * `now() - min(run_after)` over due rows, never a host `Date`.
 */
export const outboxBacklog = async (db: DbOrTx): Promise<OutboxBacklog> => {
  const { rows } = await db.execute<{
    pending: string | number;
    due: string | number;
    oldest_due_age_s: string | number | null;
    delivering: string | number;
  }>(sql`
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'pending' and run_after <= now()) as due,
      floor(extract(epoch from now() - min(run_after)
        filter (where status = 'pending' and run_after <= now()))) as oldest_due_age_s,
      count(*) filter (where status = 'delivering') as delivering
    from outbox
    where status in ('pending', 'delivering')
  `);
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    due: Number(row?.due ?? 0),
    oldestDueAgeS: Math.max(0, Number(row?.oldest_due_age_s ?? 0)),
    delivering: Number(row?.delivering ?? 0),
  };
};

/**
 * Exponential backoff, in milliseconds, before retry number `attempts`.
 *
 * 2s, 4s, 8s … 512s, capped at 10 minutes — roughly 17 minutes of retrying
 * across nine failures before the tenth dead-letters. Deliberately **without
 * jitter**: jitter de-correlates competing consumers, and a singleton drainer
 * has none. Determinism is worth more here, because it makes the schedule
 * assertable in a test.
 */
export const backoffMs = (attempts: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);

/**
 * The two arguments a delivery invokes its target with: the ctx, then the
 * row's payload. **The only place a `delivery` is minted** (`delivery.test.ts`
 * holds that by scan), and pure so it can be tested directly rather than only
 * through a sidecar.
 *
 * - `kind: "system"` with no viewer — policy is off for a delivery (§1.6);
 * - `delivery` — which row, which attempt (from 1), and whether a retryable
 *   failure of this attempt is the one `#fail` dead-letters: the same
 *   `attempts + 1 >= MAX_ATTEMPTS` the statement applies;
 * - `causedBy` — the same row, for attribution, which unlike `delivery`
 *   survives the target's onward calls (`lib/delivery.ts`);
 * - `requestId` — `outbox:<id>`, for log correlation only. Nothing may read
 *   identity out of it any more.
 */
export const deliveryArgs = (
  row: Pick<ClaimedRow, "id" | "attempts" | "payload">,
): readonly [Ctx, unknown] => {
  const attempt = row.attempts + 1;
  const ctx: Ctx = {
    ...systemCtx(`outbox:${row.id}`),
    delivery: {
      outboxId: row.id,
      attempt,
      final: attempt >= MAX_ATTEMPTS,
    },
    causedBy: row.id,
  };
  return [ctx, row.payload];
};

/** One claimed row, as the drain sees it. */
export type ClaimedRow = {
  readonly id: string;
  readonly targetActor: string;
  readonly targetId: string;
  readonly method: string;
  readonly payload: unknown;
  /** Attempts *before* this one. */
  readonly attempts: number;
  /**
   * Which claim this row is under — `outbox.claim_token`, minted by `#claim`.
   *
   * Every write that records this delivery's outcome carries it in the
   * `WHERE`, so a deliverer whose claim has since been taken away by the
   * reclaim sweep writes nothing at all. Without it both outcome writes said
   * `where id = ?` and nothing else, and a stalled host returning after the
   * reclaim window resurrected a row the reclaimer had already re-delivered
   * *and* overwrote the reclaim's attempt charge from its own stale snapshot.
   *
   * A minted uuid rather than the claim's `updated_at`: the token has to be
   * unique per claim, and two claims can land on the same timestamp. One token
   * covers a whole batch — `#release` guards the batch with one equality.
   */
  readonly claimToken: string;
};

export type DrainResult = {
  /** Rows moved out of `delivering` by the reclaim sweep. */
  readonly reclaimed: number;
  readonly claimed: number;
  readonly delivered: number;
  /** Failed, still under the attempt limit, rescheduled with backoff. */
  readonly retried: number;
  readonly dead: number;
  /** Claimed but not attempted before the drain deadline; back to pending. */
  readonly released: number;
  /**
   * Outcomes this drainer tried to record and could not, because the claim had
   * already been reclaimed. Non-zero means a host stalled past
   * `RECLAIM_AFTER` — the write was correctly refused, and this is the count
   * that says so out loud instead of leaving it to be inferred.
   */
  readonly lostClaim: number;
  /** `delivered` rows deleted by the retention sweep, if one ran this turn. */
  readonly reaped: number;
  /**
   * Compensating rows written alongside this turn's dead letters — one per
   * dead row whose pair declares `onDead` (`services/actors/src/lib/outbox-targets.ts`).
   */
  readonly compensated: number;
};

const EMPTY: DrainResult = {
  reclaimed: 0,
  claimed: 0,
  delivered: 0,
  retried: 0,
  dead: 0,
  released: 0,
  lostClaim: 0,
  reaped: 0,
  compensated: 0,
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Is this failure one that retrying can never clear?
 *
 * The rule is not invented here — `lib/ai/image-mime.ts` already states it, in
 * a doc comment and in a test name: "`ValidationError` dead-letters on the
 * first attempt; `ConflictError` makes the outbox retry. No retry turns these
 * bytes into an image." That convention was written down and then never wired
 * to anything, so until now `requireImageMime`'s refusal was retried nine more
 * times like everything else.
 *
 * **Only `VALIDATION` qualifies, and the narrowness is the point.** It is the
 * one code whose own definition is "input the actor rejected before touching
 * the database" — a pure function of a payload that, in an `outbox` row, is
 * frozen. The other four are all legitimately transient here, and a blanket
 * "typed error means permanent" rule would break real behaviour:
 *
 *   - `NOT_FOUND` is how the FK-ordering retry works. `ItemOnboardingActor`
 *     enqueues `create` then `linkBrand` and says so in its own comment: "a
 *     retry that overtakes fails on the foreign key and is retried, which is
 *     the contract, not a bug".
 *   - `CONFLICT` covers `FileActor`'s "the PUT has not completed", a unique
 *     constraint lost to a concurrent writer, and — by the classification in
 *     `lib/ai/http.ts` — a 429 or a 5xx from a model provider. All of those
 *     clear on their own.
 *   - `FORBIDDEN` can clear: policy is derived from rows another actor owns.
 *   - `BUDGET_EXCEEDED` clears when the window rolls over; that is the whole
 *     design of `BudgetActor`.
 *
 * A `SidecarError` — an opaque non-actor failure, i.e. a crash — stays
 * retryable too, which is what decision 2 in the header is about.
 */
export const isPermanentFailure = (error: unknown): boolean =>
  isActorError(error) && error.code === "VALIDATION";

/**
 * The outbox's whole callable surface. Nothing outside this host names it —
 * the keep-alive reminder is what runs `drain`, and an admin may force one —
 * so the contract lives beside the class rather than in
 * `@cellar-assistant/contracts`, and its result type stays this module's.
 */
export type OutboxActorInterface = {
  drain(ctx: Ctx): Promise<DrainResult>;
};

/**
 * `entity`, for the reason the class's own `category` gives. Registered with
 * the class in `./registry.ts`, which is what holds the two to each other.
 */
export const OutboxActorDescriptor: ActorDescriptor<OutboxActorInterface> = {
  actorType: OUTBOX_ACTOR_TYPE,
  category: "entity",
  methods: {
    drain: {},
  },
};

export class OutboxActor extends ActorBase implements OutboxActorInterface {
  /**
   * §1.1 has six categories and none of them is "infrastructure"; §2.7's actors
   * sit outside the table. `entity` is the honest fit — it writes exactly one
   * table (`outbox`, which §3 exempts precisely so every actor may *insert*
   * while only this one updates status) and nothing else. The only field any
   * code branches on is `mayWrite`.
   */
  static readonly category: ActorCategory = OutboxActorDescriptor.category;

  /**
   * Defence in depth. Dapr already serializes turns per actor id, so a second
   * concurrent drain should be impossible; if the runtime ever changes its mind
   * the claim is still safe (`SKIP LOCKED`) and this keeps the metrics honest.
   */
  #draining = false;

  /**
   * Earliest time the retention sweep may run again. `0` on a fresh
   * activation, so a restart sweeps once and then settles into the hourly
   * rhythm.
   */
  #nextRetentionSweep = 0;

  /** Earliest time the next `outbox.heartbeat` may be emitted; `0` = now. */
  #nextHeartbeat = 0;

  /**
   * Drain one batch.
   *
   * Callable through the sidecar, so it carries a policy check: only `system`
   * (the keep-alive reminder) and `admin` (a human forcing a drain) may run it.
   * §1.6 — a request cannot produce a `system` ctx, so the reminder path is not
   * reachable from the API.
   */
  async drain(ctx: Ctx): Promise<DrainResult> {
    requirePrivileged(
      ctx,
      "OutboxActor.drain is system/admin only; the outbox drains itself " +
        "from its keep-alive reminder (§2.7)",
    );
    if (this.#draining) return EMPTY;
    this.#draining = true;
    try {
      return await this.#drainOnce();
    } finally {
      this.#draining = false;
    }
  }

  /**
   * The keep-alive (§2.7). Dapr's scheduler fires it every 2s and the firing is
   * what keeps this actor activated; the reminder carries no domain intent
   * (§1.4), it just says "look at the table".
   *
   * Never throws: a reminder handler that throws is retried by the scheduler
   * with its own policy, and the next tick is 2s away regardless.
   */
  override async receiveReminder(_data: string): Promise<void> {
    try {
      const result = await this.drain(systemCtx(`outbox-drain:${Date.now()}`));
      await this.#heartbeat();
      if (result.claimed > 0 || result.reclaimed > 0) {
        emit({
          name: "outbox.drain",
          severity: "INFO",
          message: `drained ${result.delivered}/${result.claimed}`,
          // Spelled out rather than spread, so the catalog (`lib/events.ts`)
          // and the scan that holds it to the code see every key.
          attributes: {
            reclaimed: result.reclaimed,
            claimed: result.claimed,
            delivered: result.delivered,
            retried: result.retried,
            dead: result.dead,
            released: result.released,
            lostClaim: result.lostClaim,
            reaped: result.reaped,
            compensated: result.compensated,
          },
        });
      }
    } catch (error) {
      emit({
        name: "outbox.drain_failed",
        severity: "ERROR",
        message: messageOf(error),
      });
    }
  }

  /**
   * Proof the drain is alive, with the queue it is draining: at most once per
   * {@link HEARTBEAT_INTERVAL_MS}, from the reminder turn and only after a
   * drain returned — so a drain that throws, a reminder that stopped firing
   * and a host that is gone all look the same, as silence, and the dead-man's
   * rule pages on silence. Before this, nothing noticed a stopped drainer but
   * the dead-letter report's own 150-minute switch, and that report is
   * delivered *by the outbox*: a dead drainer silenced its own alarm and
   * then, 150 minutes later, the alarm about the alarm.
   */
  async #heartbeat(): Promise<void> {
    if (Date.now() < this.#nextHeartbeat) return;
    this.#nextHeartbeat = Date.now() + HEARTBEAT_INTERVAL_MS;
    const backlog = await outboxBacklog(this.db);
    emit({
      name: "outbox.heartbeat",
      severity: "INFO",
      message:
        `outbox alive: ${backlog.due} due of ${backlog.pending} pending, ` +
        `oldest due ${backlog.oldestDueAgeS}s, ${backlog.delivering} delivering`,
      attributes: {
        "outbox.pending": backlog.pending,
        "outbox.due": backlog.due,
        "outbox.oldest_due_age_s": backlog.oldestDueAgeS,
        "outbox.delivering": backlog.delivering,
      },
    });
  }

  async #drainOnce(): Promise<DrainResult> {
    const reclaim = await this.#reclaimStale();
    const reaped = await this.#reapDelivered();
    const rows = await this.#claim();
    const deadline = Date.now() + drainDeadlineMs();

    let delivered = 0;
    let retried = 0;
    let dead = 0;
    let lostClaim = 0;
    this.#failCompensations = 0;
    // Index of the first claimed row not yet handed to `#deliverOne`. Every
    // row from here on was never attempted, however the loop ends.
    let next = 0;

    try {
      while (next < rows.length && Date.now() <= deadline) {
        const row = rows[next] as ClaimedRow;
        next += 1;
        const outcome = await this.#deliverOne(row);
        if (outcome === "delivered") delivered += 1;
        else if (outcome === "dead") dead += 1;
        else if (outcome === "lost") lostClaim += 1;
        else retried += 1;
      }
    } catch (error) {
      // An outcome write threw (the database went away mid-turn, say). The
      // row it was for stays `delivering` — it *was* attempted, so the reclaim
      // sweep charging it is right. The rows behind it were not: left alone
      // they would sit claimed for RECLAIM_AFTER and then each be charged an
      // attempt that never happened, and a row claimed at attempt 9 would be
      // dead-lettered without its tenth try (decision 3). Release them first.
      await this.#releaseAfterFailure(rows.slice(next), error);
      throw error;
    }

    const unattempted = rows.slice(next);
    if (unattempted.length > 0) await this.#release(unattempted);

    return {
      reclaimed: reclaim.reclaimed,
      claimed: rows.length,
      delivered,
      retried,
      dead,
      released: unattempted.length,
      lostClaim,
      reaped,
      compensated: reclaim.compensated + this.#failCompensations,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Steps                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Rows left `delivering` by a host that died mid-delivery. The attempt is
   * charged — that is what stops a message which kills the process from
   * looping forever — and the row goes back to `pending` with backoff, or dies.
   */
  async #reclaimStale(): Promise<{ reclaimed: number; compensated: number }> {
    // One statement: the reclaim, and — for a row it dead-letters whose pair
    // declares `onDead` — the compensating row (`insertCompensations`). This
    // is the path a target cannot see at all: the host died mid-delivery on
    // the last attempt, so no turn of the target ever learns the work died.
    const rows = await this.tx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        target_actor: string;
        method: string;
        attempts: number;
        status: string;
        compensation_id: string | null;
        compensation_method: string | null;
      }>(sql`
        with reclaimed as (
          update outbox set
            attempts = attempts + 1,
            status = case
              when attempts + 1 >= ${MAX_ATTEMPTS} then 'dead' else 'pending'
            end,
            run_after = case
              when attempts + 1 >= ${MAX_ATTEMPTS} then run_after
              else now() + make_interval(secs => least(
                ${BACKOFF_CAP_MS / 1000}::double precision,
                (${BACKOFF_BASE_MS / 1000}::double precision) * power(2, attempts)
              ))
            end,
            last_error = 'reclaimed: delivery never completed (host restart or crash)',
            claim_token = null,
            updated_at = now()
          where status = 'delivering'
            and updated_at < now() - ${RECLAIM_AFTER}::interval
          returning id, target_actor, target_id, method, payload,
                    attempts, status, 'reclaim'::text as dead_reason
        ), compensated as (${insertCompensations("reclaimed")})
        select r.id, r.target_actor, r.method, r.attempts, r.status,
               c.id as compensation_id, c.method as compensation_method
        from reclaimed r
        left join compensated c on c.dead_outbox_id = r.id::text
      `);
      return result.rows;
    });

    let compensated = 0;
    for (const row of rows) {
      if (row.compensation_id !== null) compensated += 1;
      emit({
        name: row.status === "dead" ? "outbox.dead_letter" : "outbox.reclaimed",
        severity: row.status === "dead" ? "ERROR" : "WARN",
        message:
          `${row.target_actor}.${row.method} was claimed but never completed ` +
          `(attempt ${row.attempts}/${MAX_ATTEMPTS})` +
          (row.compensation_method === null
            ? ""
            : `; compensating with ${row.target_actor}.${row.compensation_method}`),
        attributes: {
          "outbox.id": row.id,
          "outbox.target_actor": row.target_actor,
          "outbox.method": row.method,
          "outbox.attempts": row.attempts,
          "outbox.reason": "reclaim",
          ...(row.compensation_id === null || row.compensation_method === null
            ? {}
            : {
                "outbox.compensation": row.compensation_method,
                "outbox.compensation_id": row.compensation_id,
              }),
        },
      });
    }
    return { reclaimed: rows.length, compensated };
  }

  /**
   * Take up to `DRAIN_BATCH_SIZE` due rows and mark them `delivering`, in one
   * committed statement. `SKIP LOCKED` means a concurrent drainer takes a
   * different set rather than blocking on this one.
   *
   * Ordered twice, deliberately (A7b). `due` picks *which* rows — that is the
   * `(run_after, seq)` index scan. The trailing `select … order by` picks the
   * order they are *delivered* in: `RETURNING` follows the update's execution
   * order, not the subquery's, so an ordered claim without this returns
   * shuffled rows.
   *
   * The claim also stamps `claim_token`, handed back as
   * {@link ClaimedRow.claimToken} — the token every outcome write carries. See
   * `#claimHeld` for what that rules out.
   */
  async #claim(): Promise<ClaimedRow[]> {
    // One token per claim, minted here rather than by `gen_random_uuid()` in
    // the statement: that would evaluate per row, and `#release` needs a single
    // equality to cover the whole batch.
    const token = randomUUID();
    return this.tx(async (tx) => {
      const result = await tx.execute<{
        id: string;
        target_actor: string;
        target_id: string;
        method: string;
        payload: unknown;
        attempts: number;
      }>(sql`
        with due as (
          select id from outbox
          where status = 'pending' and run_after <= now()
          order by run_after asc, seq asc
          limit ${DRAIN_BATCH_SIZE}
          for update skip locked
        ), claimed as (
          update outbox set
            status = 'delivering',
            claim_token = ${token}::uuid,
            updated_at = now()
          where id in (select id from due)
          returning id, target_actor, target_id, method, payload, attempts,
                    run_after, seq
        )
        select id, target_actor, target_id, method, payload, attempts
        from claimed
        order by run_after asc, seq asc
      `);
      return result.rows.map((row) => ({
        id: row.id,
        targetActor: row.target_actor,
        targetId: row.target_id,
        method: row.method,
        payload: row.payload,
        attempts: row.attempts,
        claimToken: token,
      }));
    });
  }

  /** Compensations `#fail` has written this drain turn; reset by `#drainOnce`. */
  #failCompensations = 0;

  async #deliverOne(
    row: ClaimedRow,
  ): Promise<"delivered" | "retry" | "dead" | "lost"> {
    // §8.5: reentrancy is off. A row targeting this actor would deadlock the
    // drain against itself, so it is a permanent failure, not a retryable one.
    if (row.targetActor === OUTBOX_ACTOR_TYPE) {
      const outcome = await this.#fail(
        row,
        "OutboxActor cannot deliver to itself: reentrancy is disabled (§8.5)",
        true,
      );
      return outcome.applied ? "dead" : "lost";
    }

    // The allow-list (§1.6). Until it existed, the check above was the *only*
    // validation a row got, and "not myself" is a deadlock guard, not an
    // authorization one: `deliver` mints a `systemCtx`, `bypassesPolicy`
    // returns true for it, and every owner gate in the codebase opens. Any pair
    // that reached this table was therefore executed with policy off.
    //
    // Permanent, not retryable, and the reasoning is `isPermanentFailure`'s own:
    // a row naming an undeclared pair is a frozen payload that nine more
    // attempts cannot make legal. It is also the only classification that does
    // not leave a rejected capability re-knocking for seventeen minutes.
    //
    // This is the *second* fence and it has a different job from the first.
    // Every enqueue site names a typed handle from `OUTBOX_TARGETS`
    // (`../lib/outbox-targets.ts`), so a pair written in the source is checked
    // by the compiler before it ships. This one sees the row. It also covers
    // what no type or scan of `services/actors` ever could: a row already in
    // the table from an older deploy, and a row inserted by anything else
    // holding the Postgres credential.
    if (!isAllowedOutboxTarget(row.targetActor, row.method)) {
      emit({
        name: "outbox.target_refused",
        severity: "ERROR",
        message:
          `${row.targetActor}.${row.method} is not a declared outbox target; ` +
          "the row was dead-lettered rather than invoked with policy off",
        attributes: {
          "outbox.id": row.id,
          "outbox.target_actor": row.targetActor,
          "outbox.target_id": row.targetId,
          "outbox.method": row.method,
        },
      });
      const outcome = await this.#fail(
        row,
        `${row.targetActor}.${row.method} is not in OUTBOX_TARGETS: the ` +
          "outbox delivers with policy off, so it delivers only declared " +
          "targets (services/actors/src/lib/outbox-targets.ts)",
        true,
      );
      return outcome.applied ? "dead" : "lost";
    }

    try {
      await this.deliver(row);
    } catch (error) {
      // Two ways to die: out of attempts, or a failure no attempt could clear.
      // Which of the two it was is decided *by the statement*, from the
      // attempt count the row actually holds — see `#fail`.
      const outcome = await this.#fail(
        row,
        messageOf(error),
        isPermanentFailure(error),
      );
      if (!outcome.applied) return "lost";
      return outcome.terminal ? "dead" : "retry";
    }

    const applied = await this.tx(async (tx) =>
      tx
        .update(outbox)
        .set({
          status: "delivered",
          lastError: null,
          claimToken: null,
          updatedAt: sql`now()`,
        })
        .where(this.#claimHeld(row))
        .returning({ id: outbox.id }),
    );
    if (applied.length === 0) {
      this.#lostClaim(row, "delivered");
      return "lost";
    }
    return "delivered";
  }

  /**
   * The `WHERE` every outcome write carries: this row, still `delivering`, and
   * still carrying *this* claim's token.
   *
   * `eq(outbox.id, …)` alone is what both outcome writes used to say, and it
   * is a write with no opinion about whether the claim it is reporting on
   * still exists. Replayed at SQL level against the compose stack: a stalled
   * deliverer's late failure turned a row the reclaimer had already
   * re-delivered from `delivered` back to `pending` — a third delivery of work
   * that had succeeded — and rewrote `attempts` from 5 back to 4, which pins
   * the counter below `MAX_ATTEMPTS` and defeats dead-lettering outright.
   *
   * Both halves are needed. `status = 'delivering'` alone still matches a row
   * some *other* drainer has since re-claimed, which is the same clobber one
   * hop later; the token is what distinguishes "still my claim" from "claimed
   * again by somebody else".
   */
  #claimHeld(row: ClaimedRow) {
    return and(
      eq(outbox.id, row.id),
      eq(outbox.status, "delivering"),
      eq(outbox.claimToken, row.claimToken),
    );
  }

  /** A refused outcome write: this delivery's claim is gone. */
  #lostClaim(row: ClaimedRow, outcome: string): void {
    emit({
      name: "outbox.lost_claim",
      severity: "WARN",
      message:
        `${row.targetActor}/${row.targetId}.${row.method} finished as ` +
        `'${outcome}' but its claim had already been reclaimed; the outcome ` +
        "was refused rather than applied over the reclaim",
      attributes: {
        "outbox.id": row.id,
        "outbox.target_actor": row.targetActor,
        "outbox.method": row.method,
        "outbox.outcome": outcome,
      },
    });
  }

  /**
   * Make the call: the row's target, with {@link deliveryArgs}, bounded by
   * the pair's own {@link pairDeliveryTimeoutMs}.
   */
  protected async deliver(row: ClaimedRow): Promise<void> {
    await this.invoke(
      row.targetActor,
      row.targetId,
      row.method,
      deliveryArgs(row),
      pairDeliveryTimeoutMs(row.targetActor, row.method),
    );
  }

  /**
   * The sidecar hop. Overridden in tests, which is the only reason it is not
   * inlined — and it sits *below* `deliver` so that a test's stand-in receives
   * the arguments and the timeout the real drainer builds, rather than
   * building its own.
   */
  protected async invoke(
    targetActor: string,
    targetId: string,
    method: string,
    args: readonly unknown[],
    timeoutMs: number,
  ): Promise<void> {
    await invokeActorMethod(targetActor, targetId, method, args, timeoutMs);
  }

  /**
   * Record the outcome of a failed delivery.
   *
   * Three things are deliberately done **in the statement** rather than in
   * JavaScript, and all three are the same bug:
   *
   * 1. **`attempts = attempts + 1`, relative.** The old code wrote
   *    `row.attempts + 1` — an absolute value computed from the claim-time
   *    snapshot. `#reclaimStale` has always been relative, so a late failure
   *    from a stalled host overwrote the reclaim's charge with a number from
   *    before it. Replayed at SQL level: `attempts` went 5 → 4. Repeat that
   *    and the counter never reaches `MAX_ATTEMPTS`, so the row never
   *    dead-letters and a poison message retries forever.
   * 2. **`status` from the row's own attempt count.** "Out of attempts" is a
   *    fact about the row, not about the snapshot the caller is holding.
   * 3. **`run_after` from `now()`, the database's clock.** The old code wrote
   *    `new Date(Date.now() + backoffMs(attempts))` — the *host's* clock, into
   *    a column that `#claim` and `#reclaimStale` compare against `now()`.
   *    On one host that is a 48ms discrepancy and invisible; across two hosts
   *    a lagging clock collapses the whole backoff ladder into a hot loop,
   *    because every row it writes is already due by the database's reckoning.
   *    The expression is the same `least(cap, base * 2^attempts)` as
   *    `#reclaimStale`, against the same pre-increment `attempts`, so the two
   *    paths still produce exactly `backoffMs(attempts + 1)`.
   *
   * `permanent` only ever *explains* a terminal outcome — it never causes one
   * on its own — except here, where it does both: a `VALIDATION` failure dies
   * on the attempt it happened on, whatever the count.
   *
   * The `WHERE` is `#claimHeld`, so a delivery whose claim was reclaimed
   * underneath it writes **nothing**; `applied: false` says so, and the caller
   * reports it rather than double-counting an outcome that never landed.
   */
  async #fail(
    row: ClaimedRow,
    error: string,
    permanent = false,
  ): Promise<{
    applied: boolean;
    attempts: number;
    terminal: boolean;
    compensated: boolean;
  }> {
    const terminalSql = sql`(${permanent}::boolean or attempts + 1 >= ${MAX_ATTEMPTS})`;
    // The compensation (`insertCompensations`) rides in the same statement,
    // so a row is never `dead` without its `onDead` row — see that function.
    const result = await this.tx(async (tx) =>
      tx.execute<{
        attempts: number;
        status: string;
        compensation_id: string | null;
        compensation_method: string | null;
      }>(sql`
        with failed as (
          update outbox set
            attempts = attempts + 1,
            status = case when ${terminalSql} then 'dead' else 'pending' end,
            run_after = case
              when ${terminalSql} then run_after
              else now() + make_interval(secs => least(
                ${BACKOFF_CAP_MS / 1000}::double precision,
                (${BACKOFF_BASE_MS / 1000}::double precision) * power(2, attempts)
              ))
            end,
            last_error = ${error.slice(0, 4_000)},
            claim_token = null,
            updated_at = now()
          where id = ${row.id}::uuid
            and status = 'delivering'
            and claim_token = ${row.claimToken}::uuid
          returning id, target_actor, target_id, method, payload,
                    attempts, status,
                    case when ${permanent}::boolean then 'permanent'
                         else 'attempts' end as dead_reason
        ), compensated as (${insertCompensations("failed")})
        select f.attempts, f.status,
               c.id as compensation_id, c.method as compensation_method
        from failed f
        left join compensated c on c.dead_outbox_id = f.id::text
      `),
    );

    const written = result.rows[0];
    if (written === undefined) {
      this.#lostClaim(row, "failed");
      return {
        applied: false,
        attempts: row.attempts,
        terminal: false,
        compensated: false,
      };
    }
    const attempts = Number(written.attempts);
    const terminal = written.status === "dead";
    if (written.compensation_id !== null) this.#failCompensations += 1;

    emit({
      name: terminal ? "outbox.dead_letter" : "outbox.retry",
      severity: terminal ? "ERROR" : "WARN",
      message:
        `${row.targetActor}/${row.targetId}.${row.method} failed on attempt ` +
        `${attempts}/${MAX_ATTEMPTS}` +
        (permanent ? " and will not be retried (permanent)" : "") +
        `: ${error}`,
      attributes: {
        "outbox.id": row.id,
        "outbox.target_actor": row.targetActor,
        "outbox.target_id": row.targetId,
        "outbox.method": row.method,
        "outbox.attempts": attempts,
        "outbox.max_attempts": MAX_ATTEMPTS,
        // Why it died, for the operator reading the dead-letter report: an
        // exhausted budget of attempts, or a failure refused on sight.
        ...(terminal
          ? { "outbox.terminal_reason": permanent ? "permanent" : "attempts" }
          : { "outbox.retry_in_ms": backoffMs(attempts) }),
        ...(written.compensation_id === null ||
        written.compensation_method === null
          ? {}
          : {
              "outbox.compensation": written.compensation_method,
              "outbox.compensation_id": written.compensation_id,
            }),
      },
    });
    return {
      applied: true,
      attempts,
      terminal,
      compensated: written.compensation_id !== null,
    };
  }

  /**
   * Claimed, never attempted (the drain ran out of time). No attempt charged.
   *
   * Guarded by the claim token like every other outcome write, and with a
   * single equality because one token covers a whole claim.
   */
  async #release(rows: readonly ClaimedRow[]): Promise<void> {
    const token = rows[0]?.claimToken;
    if (token === undefined) return;
    await this.tx(async (tx) => {
      await tx
        .update(outbox)
        .set({ status: "pending", claimToken: null, updatedAt: sql`now()` })
        .where(
          and(
            eq(outbox.status, "delivering"),
            eq(outbox.claimToken, token),
            inArray(outbox.id, [...rows.map((row) => row.id)]),
          ),
        );
    });
  }

  /**
   * {@link OutboxActor.#release} on the way out of a failed drain turn. The
   * turn's own error is the one that must surface (`outbox.drain_failed`), so
   * a release that fails too — the database is the likeliest cause of both —
   * is reported beside it rather than thrown over it; those rows then fall to
   * the reclaim sweep, which is where they would have gone anyway.
   */
  async #releaseAfterFailure(
    rows: readonly ClaimedRow[],
    cause: unknown,
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.#release(rows);
    } catch (error) {
      // `drain_failed`, the catalogued event this turn is about to emit for
      // `cause` anyway (`lib/events.ts`), rather than a new name for the
      // same failure.
      emit({
        name: "outbox.drain_failed",
        severity: "ERROR",
        message:
          `${rows.length} claimed row(s) could not be released after the ` +
          `drain failed (${messageOf(cause)}): ${messageOf(error)}; the ` +
          "reclaim sweep will take them back and charge each an attempt",
      });
    }
  }

  /**
   * Delete `delivered` rows past their retention window (see
   * {@link RETENTION_SWEEP_INTERVAL_MS} and the `retentionDays` doc).
   *
   * Throttled per activation rather than scheduled: this actor already has a
   * clock — the drain reminder — and a second scheduled chain to maintain for
   * a `DELETE` would be more machinery than the job is worth. A restart just
   * sweeps once more, which is harmless.
   *
   * Never touches `dead` (the dead-letter report's only input), nor `pending`
   * or `delivering` (live work). `ctid IN (… LIMIT n)` keeps one sweep bounded
   * so it cannot turn into a long lock inside a drain turn.
   */
  async #reapDelivered(): Promise<number> {
    if (Date.now() < this.#nextRetentionSweep) return 0;
    this.#nextRetentionSweep = Date.now() + RETENTION_SWEEP_INTERVAL_MS;
    const deleted = await this.tx(async (tx) => {
      const result = await tx.execute(sql`
        delete from outbox where ctid in (
          select ctid from outbox
          where status = 'delivered'
            and updated_at < now() - make_interval(days => ${retentionDays()})
          limit ${RETENTION_BATCH}
        )
      `);
      return result.rowCount ?? 0;
    });
    if (deleted > 0) {
      emit({
        name: "outbox.reaped",
        severity: "INFO",
        message: `retention: deleted ${deleted} delivered outbox row(s)`,
        attributes: {
          "outbox.reaped": deleted,
          "outbox.retention_days": retentionDays(),
        },
      });
    }
    return deleted;
  }
}

/**
 * The drain's clock, declared on this actor's registry entry and armed at boot
 * by `boot()` (`src/lib/keep-alive.ts` has the retry and the reasoning).
 *
 * Nothing ever invokes `OutboxActor`, so nothing would ever activate it, so
 * without this the queue would sit still: every row `pending` forever, no
 * item created, no vector regenerated, no brand linked.
 */
export const OUTBOX_KEEP_ALIVE: KeepAlive = {
  actorId: OUTBOX_ACTOR_ID,
  reminder: DRAIN_REMINDER,
  dueTime: DRAIN_PERIOD,
  period: DRAIN_PERIOD,
  event: "outbox",
  what: "drain reminder",
  consequence: "the outbox will not drain",
};
