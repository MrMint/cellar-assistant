/**
 * `PlaceRefreshJobActor` — C4 (migration plan §2.6, §2.1 `PlaceActor.refreshFromSource`).
 *
 * > `PlaceRefreshJobActor(jobId)` | `refreshPlaces` + `processPlaceRefreshBatch`
 * > + `place_refresh_jobs` cursor loop
 *
 * ## What this replaces, and what it does not — read before deleting anything
 *
 * The old pair is **two unrelated things wearing one name**, and only one of
 * them has a home in the new stack:
 *
 *  1. **the cursor loop** — a `place_refresh_jobs` row whose `cursor` column
 *     was updated by each batch, with a Hasura event trigger on `update:
 *     [cursor]` re-invoking the worker. That is precisely `JobActor` (§2.6),
 *     and it is what this actor is;
 *  2. **the payload** — a `DELETE FROM places` followed by a keyset walk of a
 *     **BigQuery table of Overture Maps places**, upserted 500 at a time on
 *     `places_overture_id_key`. There is no BigQuery seam anywhere in
 *     `services/actors`, `PlaceActor` has no bulk-upsert method, and §2.1 gives
 *     `places` to `PlaceActor` alone — so a bulk Overture reload is a separate
 *     piece of work with its own seam, not something C4 can smuggle in.
 *
 * What this actor refreshes instead is what B5 built `PlaceActor.refreshFromSource`
 * for and documented as "called by C4's `PlaceRefreshJobActor`": the **Google
 * enrichment** of places whose `last_sync_at` has gone stale. That is a real,
 * useful, budget-aware refresh, and it is the one the new stack can express.
 * `refreshPlaces/_services/` (BigQuery + the Wisconsin mock) is **not** ported
 * and must not be deleted on the assumption that it was.
 *
 * ## Why it is not destructive
 *
 * The old starter deleted every row in `places` before reloading, leaving the
 * table empty for the whole run. Nothing here deletes anything: a place that
 * Google no longer knows about comes back `unresolved` and keeps its row.
 *
 * ## The walk (§8.4)
 *
 * Places are walked in **`id` order** under a staleness predicate:
 *
 * ```sql
 * where (last_sync_at is null or last_sync_at < cutoff) and id > :lastPlaceId
 * order by id asc limit :batchSize
 * ```
 *
 * `id` is a random uuid, so the order is arbitrary — but it is *stable*, which
 * is the only property a keyset needs, and unlike the old `created_at` cursor
 * it is unique, so no row can fall between two batches. `refreshFromSource`
 * stamps `last_sync_at = now()`, so a refreshed place drops out of the
 * predicate; combined with `id >` the walk both terminates and never revisits.
 *
 * Idempotency has two layers: `JobActor.runBatch` drops a delivery whose batch
 * number is behind the cursor, and `refreshFromSource` is itself idempotent —
 * re-running it re-writes the same enrichment row rather than adding one.
 *
 * ## Failure policy
 *
 * A single unreachable place must not wedge the chain until the outbox
 * dead-letters it, so a per-place failure is **counted, not thrown**. Two
 * things do stop the chain:
 *
 *  - `budget_denied` — `BudgetActor` refused the spend, so every later place
 *    in this run would be refused too. The job completes with
 *    `cursor.stopped` set rather than burning ten more denials per batch.
 *  - a cancel request, which `JobActor` checks at the top of every batch.
 */
import type {
  ActorCategory,
  Ctx,
  EnrichFromGoogleResult,
  InternalJobActorInterface,
  JobActorInterface,
  PlaceRefreshCursor,
  PlaceRefreshJobPayload,
  RefreshFromSourceInput,
} from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  assertNoCallerSuppliedUser,
  PLACE_REFRESH_BATCH_SIZE,
  PLACE_REFRESH_JOB_KIND,
  PLACE_REFRESH_MAX_BATCH_SIZE,
  PLACE_REFRESH_STALE_DAYS,
  PlaceActorDescriptor,
  PlaceRefreshJobActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requirePrivileged } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { uuidArrayParam } from "../lib/sql-arrays.ts";
import { emit } from "../lib/telemetry.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor } from "./job-actor/index.ts";

/* -------------------------------------------------------------------------- */
/* The seam onto PlaceActor (§8.5: job → entity)                               */
/* -------------------------------------------------------------------------- */

/**
 * `PlaceActor.refreshFromSource`, injectable so the harness can drive the
 * whole chain without a sidecar. B8's `SuggestionRecorder` exactly.
 */
export type PlaceRefresher = (
  ctx: Ctx,
  placeId: string,
  input: RefreshFromSourceInput,
) => Promise<EnrichFromGoogleResult>;

/**
 * Bounded by the generous 90s `PlaceActorDescriptor` gives
 * `refreshFromSource`, because the call behind it is up to eight Google
 * round-trips inside one `PlaceActor` turn. What keeps the *batch* inside its
 * own delivery is not the batch size but the `BatchBudget`: a place is only
 * started while its worst case still fits.
 */
export const daprPlaceRefresher: PlaceRefresher = (ctx, placeId, input) =>
  internal(ctx)(PlaceActorDescriptor, placeId).refreshFromSource(input);

/**
 * The longest one place can take: the timeout `daprPlaceRefresher` waits for
 * `refreshFromSource`, read from the same descriptor. What the batch asks its
 * `BatchBudget` about before every place after the first.
 */
export const PLACE_REFRESH_WORST_CASE_MS = actorMethodTimeout(
  PlaceActorDescriptor,
  "refreshFromSource",
);

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

type StalePlaceRow = { readonly id: string; readonly name: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** `payload.batchSize`, clamped. A batch is a turn, and a turn must be short. */
export const refreshBatchSize = (requested: number | undefined): number => {
  if (requested === undefined) return PLACE_REFRESH_BATCH_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new ValidationError("batchSize must be a positive integer");
  }
  return Math.min(requested, PLACE_REFRESH_MAX_BATCH_SIZE);
};

export const stalenessCutoff = (
  staleAfterDays: number | undefined,
  now: number = Date.now(),
): Date => {
  const days = staleAfterDays ?? PLACE_REFRESH_STALE_DAYS;
  if (!Number.isFinite(days) || days < 0) {
    throw new ValidationError("staleAfterDays must be zero or more");
  }
  return new Date(now - days * DAY_MS);
};

const EMPTY_CURSOR: PlaceRefreshCursor = {
  lastPlaceId: null,
  refreshed: 0,
  skipped: 0,
  failed: 0,
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class PlaceRefreshJobActor
  extends JobActor<PlaceRefreshCursor, PlaceRefreshJobPayload>
  implements
    JobActorInterface<PlaceRefreshJobPayload>,
    InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    PlaceRefreshJobActorDescriptor.category;

  protected readonly kind = PLACE_REFRESH_JOB_KIND;

  readonly #refresh: PlaceRefresher;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    refresh: PlaceRefresher = daprPlaceRefresher,
  ) {
    super(daprClient, id, db);
    this.#refresh = refresh;
  }

  /**
   * **Admin only.** The old Hasura action carried `role: admin` and this one
   * spends money through `BudgetActor` on every place it touches, so a plain
   * signed-in user may not start it. `system` also passes, which is how a
   * scheduled `run_after` outbox row could start one later.
   */
  protected authorizeStart(ctx: Ctx): void {
    requirePrivileged(
      ctx,
      "only an admin may start a place-refresh job: every place it visits " +
        "spends against the google_places budget",
    );
  }

  protected override validateStart(
    _ctx: Ctx,
    payload: PlaceRefreshJobPayload,
  ): void {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "a place-refresh job's payload",
    );
    // Validate here, where a human is watching, rather than three batches in.
    refreshBatchSize(payload.batchSize);
    stalenessCutoff(payload.staleAfterDays);
  }

  protected async processBatch(
    ctx: Ctx,
    {
      cursor,
      payload,
      budget,
    }: BatchInput<PlaceRefreshCursor, PlaceRefreshJobPayload>,
  ): Promise<BatchOutcome<PlaceRefreshCursor>> {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "a place-refresh job's payload",
    );
    const previous = cursor ?? EMPTY_CURSOR;
    const batchSize = refreshBatchSize(payload.batchSize);
    const cutoff = stalenessCutoff(payload.staleAfterDays);

    const seen = previous.refreshed + previous.skipped + previous.failed;
    const remaining =
      payload.maxPlaces === undefined
        ? batchSize
        : Math.min(batchSize, Math.max(0, payload.maxPlaces - seen));
    if (remaining === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    const rows = await this.#stalePlaces(
      previous.lastPlaceId,
      cutoff,
      remaining,
      payload.placeIds ?? null,
    );
    if (rows.length === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    const input: RefreshFromSourceInput =
      payload.maxPhotos === undefined ? {} : { maxPhotos: payload.maxPhotos };

    let refreshed = previous.refreshed;
    let skipped = previous.skipped;
    let failed = previous.failed;
    let stopped: string | null = null;
    let lastPlaceId = previous.lastPlaceId;
    // Places this batch actually visited. The cursor stops at the last of
    // them, so a batch the budget cuts short resumes at the next place —
    // none skipped, none refreshed twice.
    let handled = 0;
    let outOfTime = false;

    for (const row of rows) {
      if (!budget.mayStart(PLACE_REFRESH_WORST_CASE_MS)) {
        outOfTime = true;
        break;
      }
      lastPlaceId = row.id;
      handled += 1;
      try {
        const result = await this.#refresh(ctx, row.id, input);
        if (result.status === "budget_denied") {
          stopped = result.reason;
          break;
        }
        if (result.status === "enriched") refreshed += 1;
        else skipped += 1;
      } catch (error) {
        // One place must not wedge the chain. The outbox would retry the whole
        // batch, re-spending on the places that already succeeded.
        failed += 1;
        emit({
          name: "place_refresh.place_failed",
          severity: "WARN",
          message: `place ${row.id} (${row.name}) failed to refresh: ${
            error instanceof Error ? error.message : String(error)
          }`,
          attributes: { "job.id": this.key, "place.id": row.id },
        });
      }
    }

    const next: PlaceRefreshCursor = {
      lastPlaceId,
      refreshed,
      skipped,
      failed,
      ...(stopped === null ? {} : { stopped }),
    };

    if (stopped !== null) {
      emit({
        name: "place_refresh.stopped",
        severity: "WARN",
        message: `place-refresh job ${this.key} stopped: ${stopped}`,
        attributes: { "job.id": this.key },
      });
      return { cursor: next, processed: handled, done: true };
    }

    return {
      cursor: next,
      processed: handled,
      // A short page means the walk is over; a batch the budget stopped is
      // not, whatever the page size.
      done: !outOfTime && rows.length < remaining,
    };
  }

  /**
   * The keyset page. `places` belongs to `PlaceActor` (§1.2) and a job actor
   * may read any table (§1.1) — but caches none of it, so this is a fresh
   * query every batch and a place refreshed by someone else in between simply
   * drops out of the predicate.
   */
  async #stalePlaces(
    after: string | null,
    cutoff: Date,
    limit: number,
    only: readonly string[] | null,
  ): Promise<readonly StalePlaceRow[]> {
    // A `uuid[]` parameter, not a placeholder list — see `lib/sql-arrays.ts`.
    const restrict = uuidArrayParam(only);
    const { rows } = await this.db.execute<StalePlaceRow>(sql`
      select id, name
      from public.places
      where is_active
        and (last_sync_at is null or last_sync_at < ${cutoff.toISOString()}::timestamptz)
        and (${after}::uuid is null or id > ${after}::uuid)
        and (${restrict}::uuid[] is null or id = any(${restrict}::uuid[]))
      order by id asc
      limit ${limit}
    `);
    return rows;
  }
}
