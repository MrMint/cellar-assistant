/**
 * `JobActor` — the base every long-running job extends (migration plan §2.6).
 *
 * > All extend `JobActor`, which owns the `jobs` table (kind, status, cursor,
 * > counters, error). Progress is written to `jobs` each batch; the next batch
 * > is scheduled by an outbox row targeting the same actor. Cancellation is a
 * > status flip checked at the top of each batch.
 *
 * A job is therefore not a loop. It is a chain of short actor turns, each one
 * scheduled by the previous turn's outbox row and each one crash-safe, because
 * the cursor advance and the row that schedules the next batch commit together
 * (§1.4). Kill the host mid-chain and the outbox re-delivers; the job resumes
 * from the last committed cursor and nothing is processed twice.
 *
 * ## Writing a job actor (C4's template)
 *
 * ```ts
 * export class PlaceRefreshJobActor extends JobActor<{ lastId: string }> {
 *   protected readonly kind = "place-refresh";
 *
 *   protected async processBatch(ctx, { cursor }) {
 *     const places = await nextPlaces(this.db, cursor?.lastId ?? null, 50);
 *     for (const place of places) {
 *       await refreshOne(ctx, place);   // an idempotent call to PlaceActor
 *     }
 *     const last = places.at(-1);
 *     return {
 *       cursor: last === undefined ? null : { lastId: last.id },
 *       processed: places.length,
 *       done: places.length === 0,
 *     };
 *   }
 * }
 * ```
 *
 * Put it at `services/actors/src/actors/place-refresh-job-actor.ts` (§8.3), and note
 * what it does *not* contain: any write to `jobs`. §3 gives that table to
 * `JobActor`, and the single-writer containment test resolves that name to
 * `actors/job-actor{.ts,/}` — this module. Subclasses record progress by
 * returning it, and everything else through `writeJob`.
 *
 * ## What `processBatch` must guarantee
 *
 * **Idempotency per batch (§8.4).** A batch that throws is retried by the
 * outbox with the *same* cursor, because the cursor only advances on success.
 * A batch that succeeds is never re-run: the delivery carries its batch number
 * and a re-delivery whose number does not match the stored cursor is dropped.
 * So the contract is: processing batch *n* twice must be harmless.
 *
 * ## Who may start a job: every subclass says, and none inherits a default
 *
 * `start` used to refuse only an anonymous caller, and a subclass that did
 * not override it inherited that as its rule — which is how
 * `MenuMatchJobActor`, documented as "system-only", could be started by any
 * signed-in user who reached its actor id. So the rule is now
 * {@link JobActor.authorizeStart}, **abstract**: a job actor that does not say
 * who may start it does not compile. `start` runs it first — before payload
 * validation, before the idempotent return of an existing row, and before any
 * write — and then {@link JobActor.validateStart} for the payload.
 *
 * ## When a job fails
 *
 * A batch that throws is retried by the outbox, and while it is being retried
 * the job is still `running`: `attempts` and `last_error` say why. But the
 * outbox does not retry forever — it dead-letters at `MAX_ATTEMPTS`, and at
 * once for a failure no retry can clear — and it tells nobody when it does.
 * So `runBatch` asks, before it rethrows, whether this failure is the last
 * one (`finalDeliveryFailure`, which applies the drainer's own rule), and if
 * it is, writes `status: 'failed'` and `finished_at`. Until that existed
 * nothing in this layer ever wrote `failed`: a job whose batch dead-lettered
 * stayed `running` forever, and a poll of it never ended.
 *
 * Two consequences an operator needs to know:
 *
 *  - **`failed` is terminal**, like `completed` and `cancelled`. Requeueing
 *    the dead `runBatch` row alone does nothing — its delivery finds a
 *    terminal job and returns `terminal`. Set the job back to `running`
 *    (and clear `finished_at`) in the same breath as the requeue.
 *  - **the drainer tells the job too.** Every `runBatch` declares
 *    `onDead: "markFailed"` (`services/actors/src/lib/outbox-targets.ts`), so the
 *    statement that dead-letters a batch's row also enqueues
 *    {@link JobActor.markFailed} for this job. That is what closes the one
 *    path `runBatch` cannot see: a host that dies mid-batch on the *last*
 *    attempt is dead-lettered by the reclaim sweep, which invokes nothing —
 *    and the job used to stay `running` forever. On every other path the
 *    failing turn has already written `failed`, and `markFailed` is a no-op.
 */
import {
  type ActorCategory,
  actorMethodTimeout,
  type BatchSkip,
  type CompensationResult,
  type Ctx,
  DEAD_DELIVERY_REASONS,
  type DeadDeliveryNotice,
  type JobDto,
  type RunBatchResult,
  ValidationError,
} from "@cellar-assistant/contracts";
import { jobs } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import { EntityActorBase } from "../../lib/actor-base.ts";
import type { DbOrTx } from "../../lib/db.ts";
import { finalDeliveryFailure } from "../../lib/delivery-attempt.ts";
import { requireSystem } from "../../lib/guards.ts";
import { enqueueOutbox } from "../../lib/outbox.ts";
import {
  jobRunBatchTarget,
  type OUTBOX_TARGETS,
} from "../../lib/outbox-targets.ts";
import { emit } from "../../lib/telemetry.ts";

export type JobRow = typeof jobs.$inferSelect;

/** `jobs.status`, per the table's check constraint. */
export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

const TERMINAL: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

/**
 * What `jobs.cursor` holds.
 *
 * `batch` is the base class's; `value` is the subclass's and is opaque here.
 * The batch number is what makes an at-least-once delivery safe: the outbox row
 * for batch *n* carries `n`, and a re-delivery after the cursor has moved on is
 * dropped rather than re-run.
 */
export type JobCursor<TCursor> = {
  readonly batch: number;
  readonly value: TCursor | null;
};

/** What one batch reports back. */
export type BatchOutcome<TCursor> = {
  /** Where the next batch starts. Ignored when `done`. */
  readonly cursor: TCursor | null;
  /** Rows handled in this batch; added to `jobs.processed`. */
  readonly processed: number;
  /** Total rows, once known. Written to `jobs.total` when provided. */
  readonly total?: number | null;
  /** No further batches. The job completes. */
  readonly done: boolean;
};

export type BatchInput<TCursor, TPayload> = {
  readonly cursor: TCursor | null;
  readonly payload: TPayload;
  /** 0-based index of this batch. */
  readonly batch: number;
  /**
   * How much of this batch's delivery is left — see {@link BatchBudget}. A
   * batch that makes one slow call per item asks it before every item and
   * stops when the answer is no; a batch that makes one call in total can
   * ignore it.
   */
  readonly budget: BatchBudget;
};

/**
 * Time the turn around a batch's items needs, held back from its delivery
 * timeout: the `reload` before `processBatch`, the progress write and the next
 * batch's outbox row after it, and the sidecar hop on either side. The
 * outbox's own `DELIVERY_OVERHEAD_MS` measured that whole envelope at 32ms;
 * five seconds is margin, not a budget.
 */
export const BATCH_BUDGET_MARGIN_MS = 5_000;

/**
 * A batch's clock: it must be finished before the outbox stops waiting for it.
 *
 * The outbox waits for a `runBatch` delivery for as long as the job's
 * descriptor declares (`pairDeliveryTimeoutMs` in `outbox-actor.ts`). A batch
 * that runs past that is aborted by the drainer, charged an attempt and
 * retried while its own turn is still running — which then commits, so the
 * retry answers `duplicate` and the work was done at the price of a spurious
 * retry, or, slow often enough, a dead-lettered job that had been progressing.
 * So a batch with a slow call per item stops *starting* items when the next
 * one's worst case would no longer finish in time, and returns the cursor as
 * of the last item it finished; the next batch resumes from there.
 */
export type BatchBudget = {
  /** Epoch ms by which every item this batch starts must have finished. */
  readonly deadline: number;
  /**
   * May another item start, given that it can take up to `worstCaseMs`?
   *
   * **Always yes the first time it is asked**, whatever the numbers: a batch
   * that could not start one item would make no progress at all, and the
   * chain would reschedule the same empty batch for ever. That is why every
   * job's declared `runBatch` timeout must hold one item's worst case plus
   * {@link BATCH_BUDGET_MARGIN_MS} — each job's test holds it to that. After
   * the first, yes only while `now + worstCaseMs` is still before
   * {@link BatchBudget.deadline}.
   */
  mayStart(worstCaseMs: number): boolean;
};

/**
 * A {@link BatchBudget} for a delivery that will be waited on for `timeoutMs`,
 * starting now. `now` is injectable for the tests that drive it.
 */
export const createBatchBudget = (
  timeoutMs: number,
  now: () => number = Date.now,
): BatchBudget => {
  const deadline = now() + timeoutMs - BATCH_BUDGET_MARGIN_MS;
  let started = 0;
  return {
    deadline,
    mayStart(worstCaseMs: number): boolean {
      if (started > 0 && now() + worstCaseMs > deadline) return false;
      started += 1;
      return true;
    },
  };
};

/**
 * `BatchSkip` and `RunBatchResult` are declared in `@cellar-assistant/contracts`
 * (`jobs.ts`), as the return of `InternalJobActorInterface.runBatch`;
 * re-exported for this module's existing importers.
 */
export type { BatchSkip, RunBatchResult };

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/**
 * A `jobs` row as it may leave this actor: `JobDto`, the contract's wire
 * shape. `cursor` and `payload` are dropped on purpose — a recipe-photo
 * cursor holds the whole model extraction and its payload holds file ids,
 * and neither is progress (`JobDto`'s own doc). The timestamps become the
 * ISO strings a JSON hop would have made of them anyway, so the type now says
 * what a caller across the sidecar actually receives.
 */
export const jobRowToDto = (row: JobRow): JobDto => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  total: row.total,
  processed: row.processed,
  attempts: row.attempts,
  lastError: row.lastError,
  cancelRequested: row.cancelRequested,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  startedAt: iso(row.startedAt),
  finishedAt: iso(row.finishedAt),
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export abstract class JobActor<
  TCursor = unknown,
  TPayload = Record<string, unknown>,
> extends EntityActorBase<JobRow> {
  static override readonly category: ActorCategory = "job";

  /** `jobs.kind`. Distinct per subclass; a job id is only valid for its kind. */
  protected abstract readonly kind: string;

  /**
   * Do one batch of work.
   *
   * Must be idempotent per batch number (see the module doc). Throwing hands
   * the retry to the outbox: the cursor does not advance, `attempts` and
   * `last_error` are recorded, and the same batch is delivered again with
   * backoff until the outbox dead-letters it.
   */
  protected abstract processBatch(
    ctx: Ctx,
    input: BatchInput<TCursor, TPayload>,
  ): Promise<BatchOutcome<TCursor>>;

  /**
   * Who may start this job. Throw (`ForbiddenError`) to refuse.
   *
   * **Abstract on purpose** (module doc): there is no default to inherit, so
   * a new job actor cannot be reachable by more callers than its author
   * decided. Runs first in `start` — before `validateStart`, before the
   * idempotent return of an existing row, and before anything is written.
   * Keep it to authorization; payload checks belong in `validateStart`, so
   * that a caller who may not start the job learns nothing about its payload
   * rules.
   */
  protected abstract authorizeStart(
    ctx: Ctx,
    payload: TPayload,
  ): void | Promise<void>;

  /**
   * Refuse a payload before anything is written — where a human is watching,
   * rather than three batches in. Runs after `authorizeStart`. Default: none.
   */
  protected validateStart(
    _ctx: Ctx,
    _payload: TPayload,
  ): void | Promise<void> {}

  protected async loadAggregate(id: string): Promise<JobRow | null> {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id));
    return row ?? null;
  }

  /**
   * The job row, or `NotFound`.
   *
   * A row whose `kind` belongs to a different subclass is treated as absent:
   * activating `PlaceRefreshJobActor` on an onboarding job's id must not run
   * that job with the wrong batch logic.
   *
   * "Treated as absent" now means *indistinguishable from* absent (E5b). This
   * used to answer `… is a 'onboarding-reprocess' job`, which disclosed both
   * that the id named a row and what kind of work it was — to any caller, from
   * `recipePhotoJob(jobId:)`, before `get`'s owner check had run. `get`'s own
   * doc says "anyone else is told it does not exist, because knowing a job id
   * is running is itself information"; three distinct strings for the three
   * ways this actor says "no" contradicted it. All three are now
   * `requireAggregate()`'s wording verbatim — see `c35fa111` for the house
   * rule and the base class's `refuseAsAbsent` for the one shared spelling.
   *
   * The kind is not lost, only moved: a mismatch is an internal invariant
   * violation as often as it is a probe (a `runBatch` delivered to the wrong
   * subclass), so it goes to telemetry, where an operator reads it and a
   * stranger does not.
   */
  protected requireJob(): JobRow {
    const job = this.requireAggregate();
    if (job.kind !== this.kind) {
      emit({
        name: "job.kind_mismatch",
        severity: "WARN",
        message: `${this.constructor.name}(${this.key}) is a '${job.kind}' job`,
        attributes: {
          "job.id": this.key,
          "job.kind": job.kind,
          "job.expected_kind": this.kind,
        },
      });
      this.refuseAsAbsent();
    }
    return job;
  }

  protected cursorOf(job: JobRow): JobCursor<TCursor> {
    const raw = job.cursor as Partial<JobCursor<TCursor>> | null;
    return {
      batch: typeof raw?.batch === "number" ? raw.batch : 0,
      value: (raw?.value ?? null) as TCursor | null,
    };
  }

  protected payloadOf(job: JobRow): TPayload {
    return (job.payload ?? {}) as TPayload;
  }

  /* ---------------------------------------------------------------------- */
  /* Methods                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * The job row, for a viewer allowed to read it: owner, admin or system.
   * Anyone else is told it does not exist, because knowing a job id is
   * running is itself information. For a subclass that needs the cursor; what
   * leaves the actor is `get`'s `JobDto`.
   */
  protected requireReadableJob(ctx: Ctx): JobRow {
    const job = this.requireJob();
    if (!this.canSee(ctx, job)) this.refuseAsAbsent();
    return job;
  }

  /** Owner, admin or system — `requireReadableJob`'s rule. */
  protected override canSee(ctx: Ctx, job: JobRow): boolean {
    return isOwner(ctx, job.createdBy);
  }

  /** Read the job, as `JobDto`. See `requireReadableJob` for who may. */
  async get(ctx: Ctx): Promise<JobDto> {
    return jobRowToDto(this.requireReadableJob(ctx));
  }

  /**
   * Create the job row and schedule its first batch — **in one transaction**,
   * which is §1.4's rule and the whole reason a job survives a crash between
   * "the work was accepted" and "the work started".
   *
   * Idempotent: calling it twice on the same job id returns the existing row
   * without scheduling a second chain, so a re-delivered `start` is harmless.
   */
  async start(ctx: Ctx, payload: TPayload): Promise<JobDto> {
    // Who, then what (module doc). Both before the idempotent return below,
    // so an existing row is not a way around either.
    await this.authorizeStart(ctx, payload);
    await this.validateStart(ctx, payload);

    const existing = this.aggregate;
    if (existing !== null) {
      // The idempotent return is still an *read* of somebody's job row, so it
      // carries `get`'s check rather than skipping it. Without this, a caller
      // who names another user's job id gets that row back — an authorization
      // bypass of `get`/`cancel`, which both refuse a non-owner. The sibling
      // `ItemOnboardingActor.start` has had this check on its own
      // idempotency path from the start; this is the same rule.
      return jobRowToDto(this.requireReadableJob(ctx));
    }

    await this.tx(async (tx) => {
      await tx.insert(jobs).values({
        id: this.key,
        kind: this.kind,
        status: "running",
        cursor: { batch: 0, value: null },
        payload: (payload ?? {}) as Record<string, unknown>,
        createdBy: ctx.viewerId,
        startedAt: new Date(),
      });
      await this.scheduleBatch(tx, 0, ctx);
    });
    await this.reload();

    emit({
      name: "job.started",
      severity: "INFO",
      message: `${this.kind} job ${this.key} started`,
      attributes: { "job.id": this.key, "job.kind": this.kind },
    });
    return jobRowToDto(this.requireJob());
  }

  /**
   * Request cancellation. Checked at the top of the next batch (§2.6), so a
   * batch already in flight finishes; nothing is torn down mid-write.
   */
  async cancel(ctx: Ctx): Promise<JobDto> {
    const job = this.requireReadableJob(ctx);
    if (TERMINAL.has(job.status)) return jobRowToDto(job);

    await this.writeJob({
      cancelRequested: true,
      // Nothing is running yet, so there is no batch to notice the flag.
      ...(job.status === "pending"
        ? { status: "cancelled", finishedAt: new Date() }
        : {}),
    });
    await this.reload();
    return jobRowToDto(this.requireJob());
  }

  /**
   * Run one batch. Delivered by the outbox, and only by the outbox: `system` is
   * constructed by `OutboxActor` and job actors alone (§1.6), so this is not
   * reachable from a request even by an admin.
   */
  async runBatch(
    ctx: Ctx,
    delivery: { batch?: number } = {},
  ): Promise<RunBatchResult> {
    requireSystem(
      ctx,
      `${this.constructor.name}.runBatch is delivered by the outbox; it is ` +
        "not callable from a request (§1.6)",
    );
    // The cached copy may be stale: `cancel` runs in a different turn, and a
    // redelivery may arrive at a fresh activation. Postgres is the truth (§1.3).
    await this.reload();
    const job = this.requireJob();

    if (TERMINAL.has(job.status)) return { ran: false, reason: "terminal" };

    if (job.cancelRequested) {
      await this.writeJob({ status: "cancelled", finishedAt: new Date() });
      await this.reload();
      emit({
        name: "job.cancelled",
        severity: "INFO",
        message: `${this.kind} job ${this.key} cancelled`,
        attributes: { "job.id": this.key, "job.kind": this.kind },
      });
      return { ran: false, reason: "cancelled" };
    }

    const cursor = this.cursorOf(job);
    const batch = delivery.batch ?? cursor.batch;
    if (batch !== cursor.batch) {
      // At-least-once delivery: an outbox row for a batch that has already been
      // processed. Dropping it is the idempotency guarantee (§8.4), not an
      // error — but a *future* batch means a scheduling row was lost, which is.
      if (batch > cursor.batch) {
        throw new ValidationError(
          `job ${this.key} was asked for batch ${batch} but stands at ` +
            `${cursor.batch}; a scheduling row was lost`,
        );
      }
      return { ran: false, reason: "duplicate" };
    }

    let outcome: BatchOutcome<TCursor>;
    try {
      outcome = await this.processBatch(ctx, {
        cursor: cursor.value,
        payload: this.payloadOf(job),
        batch,
        budget: this.batchBudget(),
      });
    } catch (error) {
      // Record the failure, then rethrow: the outbox owns the retry, and this
      // row's `attempts` is the human-readable copy of its attempt count.
      // Unless this is the failure the outbox will not retry — then the job
      // has failed, and this turn is the only one that can say so (module
      // doc, "When a job fails").
      const final = await finalDeliveryFailure(this.db, ctx, error);
      await this.writeJob({
        attempts: job.attempts + 1,
        lastError: messageOf(error).slice(0, 4_000),
        ...(final === null
          ? {}
          : { status: "failed" as const, finishedAt: new Date() }),
      });
      await this.reload();
      emit({
        name: final === null ? "job.batch_failed" : "job.failed",
        severity: final === null ? "WARN" : "ERROR",
        message:
          `${this.kind} job ${this.key} batch ${batch}` +
          (final === null ? "" : ` failed the job (${final})`) +
          `: ${messageOf(error)}`,
        attributes: {
          "job.id": this.key,
          "job.kind": this.kind,
          "job.batch": batch,
          "job.attempts": job.attempts + 1,
          ...(final === null ? {} : { "job.final_reason": final }),
        },
      });
      throw error;
    }

    const next = batch + 1;
    await this.tx(async (tx) => {
      await tx
        .update(jobs)
        .set({
          cursor: { batch: next, value: outcome.cursor ?? null },
          processed: job.processed + outcome.processed,
          ...(outcome.total === undefined ? {} : { total: outcome.total }),
          ...(outcome.done
            ? { status: "completed" as const, finishedAt: new Date() }
            : {}),
          attempts: 0,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, this.key));
      // §2.6: the next batch is scheduled by an outbox row targeting the same
      // actor, committed with the progress it follows from.
      if (!outcome.done) await this.scheduleBatch(tx, next, ctx);
    });
    await this.reload();

    if (outcome.done) {
      emit({
        name: "job.completed",
        severity: "INFO",
        message: `${this.kind} job ${this.key} completed`,
        attributes: {
          "job.id": this.key,
          "job.kind": this.kind,
          "job.batches": next,
        },
      });
    }
    return { ran: true, processed: outcome.processed, done: outcome.done };
  }

  /**
   * The outbox gave up on one of this job's batches: fail the job.
   *
   * Every `runBatch`'s `onDead` (`services/actors/src/lib/outbox-targets.ts`) — so it
   * is enqueued by the drainer alone, in the very statement that makes the
   * batch's row `dead`, and delivered like any other row. `system` only.
   *
   * Idempotent, and deliberately narrow about what it will fail:
   *
   *  - a job already `completed`, `failed` or `cancelled` is left alone —
   *    the usual case, because `runBatch`'s own final failure wrote `failed`
   *    first; this matters on the path it cannot see (a reclaim of the last
   *    attempt), where nothing else ever would;
   *  - a job whose cursor has moved past the dead row's batch is left alone
   *    (`stale`): the chain went on without that row, so its death ended
   *    nothing;
   *  - a job row that does not exist (or is another kind's) is `absent`, and
   *    returned rather than thrown, since retrying cannot create it.
   *
   * `last_error` keeps whatever the failing turns recorded; only a job with
   * none — the reclaim path — gets a line saying why it ended.
   */
  async markFailed(
    ctx: Ctx,
    notice: DeadDeliveryNotice,
  ): Promise<CompensationResult> {
    requireSystem(
      ctx,
      `${this.constructor.name}.markFailed is the outbox's compensation for a ` +
        "dead batch; it is not callable from a request (§1.6)",
    );
    if (!DEAD_DELIVERY_REASONS.includes(notice?.reason)) {
      throw new ValidationError(
        `markFailed needs a dead-delivery reason, got ${String(notice?.reason)}`,
      );
    }
    await this.reload();
    const job = this.aggregate;
    if (job === null || job.kind !== this.kind) {
      return { compensated: false, reason: "absent" };
    }
    if (TERMINAL.has(job.status)) {
      return { compensated: false, reason: "terminal" };
    }
    const deadBatch = (notice.deadPayload as { batch?: unknown } | null)?.batch;
    const cursor = this.cursorOf(job);
    if (typeof deadBatch === "number" && deadBatch !== cursor.batch) {
      return { compensated: false, reason: "stale" };
    }

    await this.writeJob({
      status: "failed",
      finishedAt: new Date(),
      ...(job.lastError === null
        ? {
            lastError:
              `the outbox gave up on batch ${cursor.batch} (${notice.reason})` +
              (notice.reason === "reclaim"
                ? ": its last delivery never completed (host restart or crash)"
                : ""),
          }
        : {}),
    });
    await this.reload();
    emit({
      name: "job.failed",
      severity: "ERROR",
      message:
        `${this.kind} job ${this.key} batch ${cursor.batch} failed the job ` +
        `(${notice.reason}); the outbox gave up on it`,
      attributes: {
        "job.id": this.key,
        "job.kind": this.kind,
        "job.batch": cursor.batch,
        "job.attempts": job.attempts,
        "job.final_reason": notice.reason,
        "outbox.dead_id": notice.deadOutboxId,
      },
    });
    return { compensated: true };
  }

  /* ---------------------------------------------------------------------- */
  /* For subclasses                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * The **only** place `jobs` is written outside `runBatch`/`start`.
   *
   * §3 gives the table to `JobActor`, and the single-writer test resolves that
   * to this module — so a subclass that needs to touch its row calls this
   * instead of importing `jobs`.
   */
  protected async writeJob(patch: Partial<JobRow>): Promise<void> {
    await this.tx(async (tx) => {
      await tx
        .update(jobs)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(jobs.id, this.key));
    });
  }

  /**
   * The outbox row that runs batch `batch` on this actor. Must be called with
   * the transaction that commits the progress it follows (§1.4).
   */
  protected async scheduleBatch(
    tx: DbOrTx,
    batch: number,
    ctx: Ctx,
  ): Promise<string> {
    // This job's own `runBatch`: the base class cannot name its subclass in a
    // type, so the handle is looked up by `this.getActorType()` — and the
    // annotation is the bound the outbox allow-list scan reads.
    const target: (typeof OUTBOX_TARGETS)[
      | "MenuMatchJobActor.runBatch"
      | "OnboardingReprocessJobActor.runBatch"
      | "OvertureReloadJobActor.runBatch"
      | "PlaceRefreshJobActor.runBatch"
      | "ProbeJobActor.runBatch"
      | "RecipePhotoJobActor.runBatch"
      | "VectorReembedJobActor.runBatch"] = jobRunBatchTarget(
      this.getActorType(),
    );
    return enqueueOutbox(
      tx,
      target,
      { targetId: this.key, payload: { batch } },
      { attributeTo: ctx },
    );
  }

  /**
   * This batch's {@link BatchBudget}: the `runBatch` timeout this job's own
   * descriptor declares, which is what the outbox waits for its delivery (it
   * may wait longer, never shorter — `pairDeliveryTimeoutMs`). Overridden by
   * tests that need a clock they control.
   */
  protected batchBudget(): BatchBudget {
    return createBatchBudget(
      actorMethodTimeout(
        jobRunBatchTarget(this.getActorType()).descriptor,
        "runBatch",
      ),
    );
  }
}
