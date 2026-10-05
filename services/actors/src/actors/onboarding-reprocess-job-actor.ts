/**
 * `OnboardingReprocessJobActor` — C4 (migration plan §2.6).
 *
 * > `OnboardingReprocessJobActor(jobId)` | `reprocessOnboardingBatch` +
 * > `onboarding_reprocess_jobs`; iterates `item_onboardings` and calls
 * > `ItemOnboardingActor.reprocess` per row
 *
 * That is the whole design, and B2 already wrote the far half: `reprocess`
 * exists on `ItemOnboardingActor`, is `system`/`admin` only, re-runs the
 * extraction, and records the delivery in `item_onboardings.last_reprocess_result`.
 * This actor is only the walk.
 *
 * ## Three things fixed on the way across
 *
 *  1. **The cursor is a `(created_at, id)` keyset.** The old
 *     `onboarding_reprocess_jobs.cursor` held `created_at` alone and the query
 *     was `created_at > $cursor`, so two rows sharing a timestamp across a
 *     batch boundary were **silently skipped**. `created_at` is
 *     `default now()` and a bulk backfill inserts many rows per microsecond,
 *     so this was not hypothetical.
 *  2. **A poison row can no longer loop forever.** The old worker treated a
 *     `failed` job as resumable and flipped it back to `processing`, so a row
 *     that always threw cycled between the two states indefinitely. Here a
 *     per-row failure is *counted* and the cursor advances past it; the row is
 *     reported in `jobs.cursor.failed` and the chain finishes.
 *  3. **The per-row retry is free.** Each row is handed
 *     `idempotencyKey(ctx, "OnboardingReprocessJobActor.reprocess", rowId)` —
 *     derived from this batch's delivery, so stable across the outbox's
 *     retries of it — and `reprocess` records it. A batch retried by the
 *     outbox therefore re-attempts only the rows that had not finished; the
 *     ones that had return `reprocessed: false` without spending another model
 *     call. The key is passed **explicitly**: it used to ride along as
 *     `ctx.requestId`, which meant this job lent its delivery identity to
 *     `ItemOnboardingActor`. The typed client now strips `delivery` from every
 *     forward (`lib/delivery.ts`), so nothing is lent by accident.
 *
 * ## What it deliberately does not do
 *
 * The old worker also updated the linked `wines`/`beers`/… row and re-linked
 * its brand, to make a `generate_vector` trigger fire. Both belong to
 * `ItemActor` and `BrandActor` under §1.2, and the vector regeneration is an
 * outbox row those actors already enqueue. A job actor writing another
 * aggregate's rows is exactly what the single-writer test forbids, so the
 * decision of what an improved extraction should change about the *item* is
 * `ItemOnboardingActor.reprocess`'s to make, not this walk's.
 */
import type {
  ActorCategory,
  Ctx,
  InternalJobActorInterface,
  JobActorInterface,
  OnboardingReprocessCursor,
  OnboardingReprocessJobPayload,
  ReprocessResult,
} from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  assertNoCallerSuppliedUser,
  ItemOnboardingActorDescriptor,
  ONBOARDING_REPROCESS_BATCH_SIZE,
  ONBOARDING_REPROCESS_JOB_KIND,
  ONBOARDING_REPROCESS_MAX_BATCH_SIZE,
  OnboardingReprocessJobActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { idempotencyKey } from "../lib/delivery.ts";
import { requirePrivileged } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { uuidArrayParam } from "../lib/sql-arrays.ts";
import { emit } from "../lib/telemetry.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor } from "./job-actor/index.ts";

/* -------------------------------------------------------------------------- */
/* The seam onto ItemOnboardingActor (§8.5: job → entity)                      */
/* -------------------------------------------------------------------------- */

export type OnboardingReprocessor = (
  ctx: Ctx,
  onboardingId: string,
  input: Record<string, unknown>,
) => Promise<ReprocessResult>;

/**
 * A vision call per row; §8.5's "over a few seconds" is the norm here, hence
 * the 90s `ItemOnboardingActorDescriptor` gives `reprocess`.
 */
export const daprOnboardingReprocessor: OnboardingReprocessor = (
  ctx,
  onboardingId,
  input,
) =>
  internal(ctx)(ItemOnboardingActorDescriptor, onboardingId).reprocess(input);

/**
 * The longest one row can take: the timeout `daprOnboardingReprocessor` waits
 * for `reprocess`, read from the same descriptor. What the batch asks its
 * `BatchBudget` about before every row after the first.
 */
export const ONBOARDING_REPROCESS_WORST_CASE_MS = actorMethodTimeout(
  ItemOnboardingActorDescriptor,
  "reprocess",
);

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

type OnboardingRow = {
  readonly id: string;
  readonly created_at: string;
};

export const reprocessBatchSize = (requested: number | undefined): number => {
  if (requested === undefined) return ONBOARDING_REPROCESS_BATCH_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new ValidationError("batchSize must be a positive integer");
  }
  return Math.min(requested, ONBOARDING_REPROCESS_MAX_BATCH_SIZE);
};

const requireIsoDate = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new ValidationError(`createdBefore is not a timestamp: ${value}`);
  }
  return at.toISOString();
};

const EMPTY_CURSOR: OnboardingReprocessCursor = {
  lastCreatedAt: null,
  lastOnboardingId: null,
  reprocessed: 0,
  skipped: 0,
  failed: 0,
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class OnboardingReprocessJobActor
  extends JobActor<OnboardingReprocessCursor, OnboardingReprocessJobPayload>
  implements
    JobActorInterface<OnboardingReprocessJobPayload>,
    InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    OnboardingReprocessJobActorDescriptor.category;

  protected readonly kind = ONBOARDING_REPROCESS_JOB_KIND;

  readonly #reprocess: OnboardingReprocessor;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    reprocess: OnboardingReprocessor = daprOnboardingReprocessor,
  ) {
    super(daprClient, id, db);
    this.#reprocess = reprocess;
  }

  /**
   * **Admin only.** It re-runs a vision model over other people's onboardings;
   * `reprocess` itself refuses anything but system/admin, so a user-started
   * job would fail on its first row anyway — failing here is the honest
   * version.
   */
  protected authorizeStart(ctx: Ctx): void {
    requirePrivileged(
      ctx,
      "only an admin may start an onboarding-reprocess job: it re-runs the " +
        "extraction model over other users' onboardings",
    );
  }

  protected override validateStart(
    _ctx: Ctx,
    payload: OnboardingReprocessJobPayload,
  ): void {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "an onboarding-reprocess job's payload",
    );
    reprocessBatchSize(payload.batchSize);
    requireIsoDate(payload.createdBefore);
  }

  protected async processBatch(
    ctx: Ctx,
    {
      cursor,
      payload,
      budget,
    }: BatchInput<OnboardingReprocessCursor, OnboardingReprocessJobPayload>,
  ): Promise<BatchOutcome<OnboardingReprocessCursor>> {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "an onboarding-reprocess job's payload",
    );
    const previous = cursor ?? EMPTY_CURSOR;
    const batchSize = reprocessBatchSize(payload.batchSize);

    const seen = previous.reprocessed + previous.skipped + previous.failed;
    const remaining =
      payload.maxOnboardings === undefined
        ? batchSize
        : Math.min(batchSize, Math.max(0, payload.maxOnboardings - seen));
    if (remaining === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    const rows = await this.#nextOnboardings(previous, payload, remaining);
    if (rows.length === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    let reprocessed = previous.reprocessed;
    let skipped = previous.skipped;
    let failed = previous.failed;
    let lastCreatedAt = previous.lastCreatedAt;
    let lastOnboardingId = previous.lastOnboardingId;
    // Rows this batch actually visited. The cursor stops at the last of them,
    // so a batch the budget cuts short resumes at the next row — none
    // skipped, none reprocessed twice.
    let handled = 0;
    let outOfTime = false;

    for (const row of rows) {
      if (!budget.mayStart(ONBOARDING_REPROCESS_WORST_CASE_MS)) {
        outOfTime = true;
        break;
      }
      handled += 1;
      lastCreatedAt = row.created_at;
      lastOnboardingId = row.id;
      try {
        // One key per row, derived from this batch's delivery (module doc).
        const key = idempotencyKey(
          ctx,
          "OnboardingReprocessJobActor.reprocess",
          row.id,
        );
        const result = await this.#reprocess(ctx, row.id, {
          requestedBy: `job:${this.key}`,
          ...(key === null ? {} : { idempotencyKey: key }),
        });
        if (result.reprocessed) reprocessed += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        emit({
          name: "onboarding_reprocess.row_failed",
          severity: "WARN",
          message: `onboarding ${row.id} failed to reprocess: ${
            error instanceof Error ? error.message : String(error)
          }`,
          attributes: { "job.id": this.key, "onboarding.id": row.id },
        });
      }
    }

    return {
      cursor: {
        lastCreatedAt,
        lastOnboardingId,
        reprocessed,
        skipped,
        failed,
      },
      processed: handled,
      // A short page means the walk is over; a batch the budget stopped is
      // not, whatever the page size.
      done: !outOfTime && rows.length < remaining,
    };
  }

  /**
   * The `(created_at, id)` keyset page.
   *
   * The `front/back label image` predicate is the old worker's, and it is
   * worth keeping here rather than letting `reprocess` discover it per row: a
   * row with no images can only ever be skipped, and skipping it in SQL costs
   * nothing while skipping it in an actor costs an activation.
   */
  async #nextOnboardings(
    cursor: OnboardingReprocessCursor,
    payload: OnboardingReprocessJobPayload,
    limit: number,
  ): Promise<readonly OnboardingRow[]> {
    const afterAt = cursor.lastCreatedAt;
    const afterId = cursor.lastOnboardingId;
    // A `uuid[]` parameter, not a placeholder list — see `lib/sql-arrays.ts`.
    const only = uuidArrayParam(payload.onboardingIds);
    const { rows } = await this.db.execute<OnboardingRow>(sql`
      select id, created_at
      from public.item_onboardings
      where (front_label_image_id is not null or back_label_image_id is not null)
        and (${payload.itemType ?? null}::text is null
             or item_type = ${payload.itemType ?? null}::text)
        and (${payload.aiModel ?? null}::text is null
             or ai_model = ${payload.aiModel ?? null}::text)
        and (${requireIsoDate(payload.createdBefore)}::timestamptz is null
             or created_at < ${requireIsoDate(payload.createdBefore)}::timestamptz)
        and (${only}::uuid[] is null or id = any(${only}::uuid[]))
        and (
          ${afterAt}::timestamptz is null
          or (created_at, id) > (${afterAt}::timestamptz, ${afterId}::uuid)
        )
      order by created_at asc, id asc
      limit ${limit}
    `);
    return rows;
  }
}
