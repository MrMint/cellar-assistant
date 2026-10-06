/**
 * `OvertureReloadJobActor` — C4b (migration plan §1326, §2.6, §8.4, §8.5).
 *
 * > **C4b · Overture bulk reload.** Needs a BigQuery seam and a bulk-upsert
 * > method on `PlaceActor` (keyset walk, upsert on `places_overture_id_key`).
 * > Note the old service factory **fell back to a Wisconsin JSON mock silently
 * > in production** when GCP credentials were absent — the new seam must throw
 * > instead. Accept: a reload runs from a cursor, is non-destructive, and
 * > refuses to start unconfigured.
 *
 * This is the half of `refreshPlaces` C4 deliberately did not port. C4 took the
 * *cursor loop* (`place_refresh_jobs` + its event trigger) and built the Google
 * staleness walk `PlaceActor.refreshFromSource` was written for. The *payload*
 * — a keyset walk of a BigQuery table of Overture Maps places — needed a seam
 * that did not exist and a bulk write into a table `PlaceActor` owns. Both now
 * exist: `lib/overture.ts` and `PlaceActor.bulkUpsertFromOverture`.
 *
 * ## Three differences from the thing it replaces, all deliberate
 *
 * | old | here |
 * |---|---|
 * | `DELETE FROM places` first, table empty for the whole run | nothing is deleted; rows are upserted in place |
 * | a missing GCP credential silently loaded `wisconsin-places.json` | `start` refuses when no source is installed; a *partial* configuration stops the host at boot (`lib/overture.ts`) |
 * | one malformed row failed a 500-row GraphQL mutation, or was coerced (`name ?? "Unknown"`, `parseFloat(...)` → `NaN`) | a malformed row is rejected, counted and walked past; `maxRejected` stops a wholesale schema change at the other end |
 *
 * ## The walk (§8.4)
 *
 * Keyset, in `overture_id` order — the source table's own primary key, which
 * is unique, so unlike the `created_at` cursor C4 replaced no row can fall
 * between two batches. The cursor advances to the **last row fetched**, not the
 * last row accepted: a rejected row at the end of a page must still be walked
 * past or the chain retries the same page for ever.
 *
 * Idempotency has three layers, and the middle one is why an interrupted
 * reload is free to resume:
 *
 *  1. `JobActor.runBatch` drops a delivery whose batch number is behind the
 *     stored cursor;
 *  2. `bulkUpsertFromOverture` is naturally idempotent on
 *     `places_overture_id_key`, **and** its `DO UPDATE` carries an
 *     `IS DISTINCT FROM` guard, so replaying a page whose rows already match
 *     writes zero rows;
 *  3. the source is read fresh each batch, so a page that moved under us is
 *     simply the new page.
 *
 * Layer 2 is what makes the transaction boundary safe. The upsert commits in
 * `PlaceActor`'s transaction and the cursor advance commits in this actor's,
 * one turn later — they *cannot* be one transaction, because they are two
 * actors. A crash between them replays a page that is by then a no-op. Partial
 * success within a batch is therefore consistent by construction: either the
 * page's rows are in the database or they are not, and either way the cursor
 * has not moved and the replay is correct.
 *
 * ## Why the fan-out is one call
 *
 * §8.5's call graph is closed and a job fanning out synchronous calls to
 * thousands of `PlaceActor` instances is exactly what it forbids. One page is
 * one `job → entity` hop, at the reserved key `PLACE_BULK_ACTOR_ID`. The §1.3
 * tension that buys — a bulk key writing rows other activations cache — is
 * argued in `PlaceActor.bulkUpsertFromOverture`'s own doc rather than hidden
 * here.
 */
import type {
  ActorCategory,
  BulkUpsertFromOvertureInput,
  BulkUpsertFromOvertureResult,
  Ctx,
  InternalJobActorInterface,
  JobActorInterface,
  OverturePlaceInput,
  OvertureReloadCursor,
  OvertureReloadJobPayload,
} from "@cellar-assistant/contracts";
import {
  assertNoCallerSuppliedUser,
  ConflictError,
  OVERTURE_RELOAD_BATCH_SIZE,
  OVERTURE_RELOAD_JOB_KIND,
  OVERTURE_RELOAD_MAX_BATCH_SIZE,
  OVERTURE_RELOAD_MAX_REJECTED,
  OvertureReloadJobActorDescriptor,
  PLACE_BULK_ACTOR_ID,
  PlaceActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requirePrivileged } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import type { OverturePlaceSource } from "../lib/overture.ts";
import { normalizeOvertureRow, overturePlaceSource } from "../lib/overture.ts";
import { emit } from "../lib/telemetry.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor } from "./job-actor/index.ts";

/* -------------------------------------------------------------------------- */
/* The seams (§8.5: job → entity)                                              */
/* -------------------------------------------------------------------------- */

/**
 * `PlaceActor.bulkUpsertFromOverture`, injectable so the harness can drive the
 * whole chain without a sidecar — `PlaceRefresher` and B8's
 * `SuggestionRecorder` exactly.
 */
export type OvertureUpserter = (
  ctx: Ctx,
  input: BulkUpsertFromOvertureInput,
) => Promise<BulkUpsertFromOvertureResult>;

/**
 * `PlaceActor`'s internal `bulkUpsertFromOverture`, bounded by the generous
 * 120s its descriptor declares: one page is up to
 * `OVERTURE_RELOAD_MAX_BATCH_SIZE` rows in a single statement. Still bounded —
 * the batch size is what keeps the *turn* short.
 */
export const daprOvertureUpserter: OvertureUpserter = (ctx, input) =>
  internal(ctx)(
    PlaceActorDescriptor,
    PLACE_BULK_ACTOR_ID,
  ).bulkUpsertFromOverture(input);

/**
 * How this actor finds the installed source.
 *
 * A **resolver**, not a source. `lib/overture.ts` installs the real BigQuery
 * client at boot or installs nothing at all, and "nothing" has to reach `start`
 * as an absence it can refuse — not as a stub that throws on first use. Dapr
 * constructs actors as `new Cls(daprClient, actorId)`, so a constructor default
 * *is* the production wiring: a throwing stub sitting here would make a
 * misconfigured deployment indistinguishable from a working one until an
 * operator started a reload and watched it dead-letter three batches in. This
 * repository has shipped that bug twice.
 */
export type OvertureSourceResolver = () => OverturePlaceSource | null;

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export const reloadBatchSize = (requested: number | undefined): number => {
  if (requested === undefined) return OVERTURE_RELOAD_BATCH_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new ValidationError("batchSize must be a positive integer");
  }
  return Math.min(requested, OVERTURE_RELOAD_MAX_BATCH_SIZE);
};

export const maxRejectedOf = (requested: number | undefined): number => {
  if (requested === undefined) return OVERTURE_RELOAD_MAX_REJECTED;
  if (!Number.isInteger(requested) || requested < 0) {
    throw new ValidationError("maxRejected must be zero or more");
  }
  return requested;
};

const EMPTY_CURSOR: OvertureReloadCursor = {
  lastOvertureId: null,
  fetched: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  rejected: 0,
};

/** How many rejection reasons one batch logs before it stops shouting. */
const REJECTION_SAMPLE = 5;

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class OvertureReloadJobActor
  extends JobActor<OvertureReloadCursor, OvertureReloadJobPayload>
  implements
    JobActorInterface<OvertureReloadJobPayload>,
    InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    OvertureReloadJobActorDescriptor.category;

  protected readonly kind = OVERTURE_RELOAD_JOB_KIND;

  readonly #upsert: OvertureUpserter;
  readonly #resolveSource: OvertureSourceResolver;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    upsert: OvertureUpserter = daprOvertureUpserter,
    resolveSource: OvertureSourceResolver = overturePlaceSource,
  ) {
    super(daprClient, id, db);
    this.#upsert = upsert;
    this.#resolveSource = resolveSource;
  }

  /**
   * **Admin only, and only when a source is installed.**
   *
   * The Hasura predecessor carried `role: admin`; this one rewrites the
   * reference half of every place in the database, so a plain signed-in user
   * may not start it. `system` also passes, which is how a scheduled
   * `run_after` outbox row could start one later.
   *
   * The second half is C4b's acceptance criterion — *"refuses to start
   * unconfigured"*. The refusal is here, in front of the admin who typed the
   * command, and not at the first row of the first batch: an operator learning
   * from a dead-lettered outbox row that the credential was missing is how the
   * Wisconsin mock survived as long as it did.
   */
  protected authorizeStart(ctx: Ctx): void {
    requirePrivileged(
      ctx,
      "only an admin may start an Overture reload: it rewrites the " +
        "reference half of every place row in the database",
    );
  }

  protected override validateStart(
    _ctx: Ctx,
    payload: OvertureReloadJobPayload,
  ): void {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "an Overture reload job's payload",
    );
    // Validate here, where a human is watching, rather than three batches in.
    reloadBatchSize(payload.batchSize);
    maxRejectedOf(payload.maxRejected);
    this.#requireSource();
  }

  #requireSource(): OverturePlaceSource {
    const source = this.#resolveSource();
    if (source === null) {
      throw new ConflictError(
        "no Overture source is installed, so there is nothing to reload " +
          "from. Set OVERTURE_SOURCE=bigquery together with " +
          "OVERTURE_BIGQUERY_TABLE and a service-account key, and restart " +
          "the actor host — an incomplete configuration stops the host at " +
          "boot rather than degrading to a stub (services/actors/src/lib/" +
          "overture.ts). Nothing was started.",
      );
    }
    return source;
  }

  protected async processBatch(
    ctx: Ctx,
    {
      cursor,
      payload,
    }: BatchInput<OvertureReloadCursor, OvertureReloadJobPayload>,
  ): Promise<BatchOutcome<OvertureReloadCursor>> {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "an Overture reload job's payload",
    );
    const source = this.#requireSource();
    const previous = cursor ?? EMPTY_CURSOR;
    const batchSize = reloadBatchSize(payload.batchSize);
    const maxRejected = maxRejectedOf(payload.maxRejected);

    const remaining =
      payload.maxPlaces === undefined
        ? batchSize
        : Math.min(
            batchSize,
            Math.max(0, payload.maxPlaces - previous.fetched),
          );
    if (remaining === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    const batch = await source.fetchBatch({
      after: previous.lastOvertureId,
      limit: remaining,
    });
    if (batch.rows.length === 0) {
      return { cursor: previous, processed: 0, done: true };
    }
    if (batch.lastId === null || batch.lastId === previous.lastOvertureId) {
      // Without a fresh keyset key the next batch would ask for the same page
      // for ever. Thrown, not counted: the outbox retries and then dead-letters
      // with this message, which is the right outcome for a broken source.
      throw new ValidationError(
        `${source.name} returned ${batch.rows.length} row(s) but no cursor ` +
          `beyond ${previous.lastOvertureId ?? "START"}. A source that cannot ` +
          "produce a keyset key cannot be walked.",
      );
    }

    const accepted: OverturePlaceInput[] = [];
    const reasons: string[] = [];
    for (const raw of batch.rows) {
      const normalized = normalizeOvertureRow(raw);
      if (normalized.ok) accepted.push(normalized.place);
      else if (reasons.length < REJECTION_SAMPLE) {
        reasons.push(`${normalized.overtureId ?? "?"}: ${normalized.reason}`);
      }
    }
    const rejectedHere = batch.rows.length - accepted.length;

    // One page, one hop (§8.5). A page of nothing but rejects still advances.
    const written =
      accepted.length === 0
        ? null
        : await this.#upsert(ctx, { places: accepted });

    if (rejectedHere > 0) {
      emit({
        name: "overture_reload.rows_rejected",
        severity: "WARN",
        message:
          `${rejectedHere} of ${batch.rows.length} source rows rejected in ` +
          `job ${this.key}: ${reasons.join("; ")}`,
        attributes: {
          "job.id": this.key,
          "overture.rejected": rejectedHere,
          "overture.batch_rows": batch.rows.length,
        },
      });
    }

    const rejected = previous.rejected + rejectedHere;
    const next: OvertureReloadCursor = {
      lastOvertureId: batch.lastId,
      fetched: previous.fetched + batch.rows.length,
      inserted: previous.inserted + (written?.inserted ?? 0),
      updated: previous.updated + (written?.updated ?? 0),
      unchanged: previous.unchanged + (written?.unchanged ?? 0),
      skipped: previous.skipped + (written?.skipped ?? 0),
      rejected,
    };

    if (rejected > maxRejected) {
      const stopped =
        `${rejected} source rows rejected, over the ${maxRejected} allowed; ` +
        "the source's shape has probably changed. Everything accepted so far " +
        "is committed and the cursor is where it stopped.";
      emit({
        name: "overture_reload.stopped",
        severity: "ERROR",
        message: `overture reload ${this.key} stopped: ${stopped}`,
        attributes: { "job.id": this.key, "overture.rejected": rejected },
      });
      return {
        cursor: { ...next, stopped },
        processed: batch.rows.length,
        done: true,
      };
    }

    return {
      cursor: next,
      processed: batch.rows.length,
      done: !batch.hasMore || batch.rows.length < remaining,
    };
  }
}
