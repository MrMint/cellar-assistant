/**
 * `VectorReembedJobActor` — re-embed every stored vector another embedding
 * made.
 *
 * ## Why it exists
 *
 * Two vectors are comparable only when one embedding made both
 * (`../lib/embeddings.ts`, "A stored vector's identity"). Since
 * `20260928162504_vector_embedding_identity` every `item_vectors` and
 * `recipe_vectors` row records which one did (`embedding_model`), and
 * `regenerateVector` treats a row whose model is not the configured one as
 * stale. That makes a re-embed *possible*; this is what makes it *happen*:
 * nothing else touches a vector whose item never changes, and after a model
 * change that is nearly all of them.
 *
 * **It is the cutover step.** Every migrated vector's `embedding_model` is
 * NULL (legacy `gemini-embedding-2-preview`, which nobody recorded), so a run
 * after the first deploy re-embeds all of them with the configured model. It
 * is also what to run after any later change of embedding model or provider.
 *
 * ## The walk (§8.4)
 *
 * `item_vectors`, then `recipe_vectors`, each in `id` order under
 *
 * ```sql
 * where embedding_model is distinct from :configured and id > :lastId
 * ```
 *
 * `regenerateVector` records the new model, so a re-embedded row drops out of
 * the predicate; `id >` is what makes the walk terminate over a row that stays
 * stale (its re-embed failed, or a replica with another model answered it). A
 * run converges on the model configured in *this* process when it starts, and
 * the cursor records which — a later run after a redeploy picks up whatever the
 * first could not.
 *
 * Each row is re-embedded by the actor that owns it — `ItemActor` or
 * `RecipeActor` `regenerateVector` over the sidecar (§8.5: job → entity) — so
 * the embedding text, the image set and the write are theirs; this reads the
 * two tables (§1.1: a job may read any) and writes only its own `jobs` row.
 *
 * ## Money and failure
 *
 * Every re-embed is an embedding call charged to `BudgetActor` under the ctx
 * this batch was delivered with, which carries the job's outbox row as
 * `causedBy`, so the spend is booked to whoever started the job. A
 * `BUDGET_EXCEEDED` stops the chain (`cursor.stopped`) rather than spending
 * ten more refusals a batch. Any other per-row failure is counted, not thrown,
 * like `PlaceRefreshJobActor`: one bad item must not wedge the walk until the
 * outbox dead-letters it.
 */
import type {
  ActorCategory,
  Ctx,
  InternalJobActorInterface,
  ItemRef,
  VectorReembedCursor,
  VectorReembedJobActorInterface,
  VectorReembedJobPayload,
  VectorReembedProgress,
  VectorTable,
} from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  assertNoCallerSuppliedUser,
  ConflictError,
  ITEM_TYPES,
  ItemActorDescriptor,
  itemActorId,
  RecipeActorDescriptor,
  ValidationError,
  VECTOR_REEMBED_BATCH_SIZE,
  VECTOR_REEMBED_JOB_KIND,
  VECTOR_REEMBED_MAX_BATCH_SIZE,
  VECTOR_TABLES,
  VectorReembedJobActorDescriptor,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requirePrivileged } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { emit } from "../lib/telemetry.ts";
import { embeddingModel, imageEmbeddingKey } from "../lib/vectors.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor, jobRowToDto } from "./job-actor/index.ts";

/* -------------------------------------------------------------------------- */
/* The seam onto ItemActor / RecipeActor (§8.5: job → entity)                  */
/* -------------------------------------------------------------------------- */

/** What one row's re-embed reported: whether it actually embedded. */
export type Reembedded = { readonly skipped: boolean };

export type VectorRegenerator = {
  item(ctx: Ctx, ref: ItemRef): Promise<Reembedded>;
  recipe(ctx: Ctx, recipeId: string): Promise<Reembedded>;
  /** G32: one stored photo's own vector (`ItemActor.embedImage`). */
  image(ctx: Ctx, ref: ItemRef, imageId: string): Promise<Reembedded>;
};

export const daprVectorRegenerator: VectorRegenerator = {
  item: (ctx, ref) =>
    internal(ctx)(ItemActorDescriptor, itemActorId(ref)).regenerateVector(),
  recipe: (ctx, recipeId) =>
    internal(ctx)(RecipeActorDescriptor, recipeId).regenerateVector({}),
  image: (ctx, ref, imageId) =>
    internal(ctx)(ItemActorDescriptor, itemActorId(ref)).embedImage({
      imageId,
    }),
};

/**
 * The longest one row can take — the timeout the regenerator waits for,
 * read from the same descriptors. What the batch asks its `BatchBudget`.
 */
export const VECTOR_REEMBED_WORST_CASE_MS = Math.max(
  actorMethodTimeout(ItemActorDescriptor, "regenerateVector"),
  actorMethodTimeout(RecipeActorDescriptor, "regenerateVector"),
  actorMethodTimeout(ItemActorDescriptor, "embedImage"),
);

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

export const reembedBatchSize = (requested: number | undefined): number => {
  if (requested === undefined) return VECTOR_REEMBED_BATCH_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new ValidationError("batchSize must be a positive integer");
  }
  return Math.min(requested, VECTOR_REEMBED_MAX_BATCH_SIZE);
};

/** `payload.tables`, validated, in `VECTOR_TABLES` order. */
export const reembedTables = (
  requested: readonly string[] | undefined,
): readonly VectorTable[] => {
  if (requested === undefined) return VECTOR_TABLES;
  const unknown = requested.filter(
    (table) => !(VECTOR_TABLES as readonly string[]).includes(table),
  );
  if (unknown.length > 0 || requested.length === 0) {
    throw new ValidationError(
      `tables must be a non-empty subset of ${VECTOR_TABLES.join(", ")}` +
        (unknown.length > 0 ? `; got ${unknown.join(", ")}` : ""),
    );
  }
  return VECTOR_TABLES.filter((table) => requested.includes(table));
};

/** The configured embedding, or a refusal: a job with nothing to converge on. */
const requireConfiguredModel = (): string => {
  const model = embeddingModel();
  if (model === null) {
    throw new ConflictError(
      "no embedding model is configured in this process (AI_PROVIDER is " +
        "unset), so there is nothing to re-embed vectors with",
    );
  }
  return model.key;
};

type StaleRow =
  | { readonly id: number; readonly kind: "item"; readonly ref: ItemRef }
  | { readonly id: number; readonly kind: "recipe"; readonly recipeId: string }
  | {
      readonly kind: "image";
      readonly imageId: string;
      readonly ref: ItemRef;
    };

const VECTORS = ARCS.itemVectors;
const IMAGES = ARCS.itemImage;

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class VectorReembedJobActor
  extends JobActor<VectorReembedCursor, VectorReembedJobPayload>
  implements VectorReembedJobActorInterface, InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    VectorReembedJobActorDescriptor.category;

  protected readonly kind = VECTOR_REEMBED_JOB_KIND;

  readonly #regenerate: VectorRegenerator;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    regenerate: VectorRegenerator = daprVectorRegenerator,
  ) {
    super(daprClient, id, db);
    this.#regenerate = regenerate;
  }

  /**
   * **Admin only.** It spends an embedding call on every stale vector in the
   * database, against the embedding budget.
   */
  protected authorizeStart(ctx: Ctx): void {
    requirePrivileged(
      ctx,
      "only an admin may start a vector re-embed job: every vector it visits " +
        "spends an embedding call",
    );
  }

  protected override validateStart(
    _ctx: Ctx,
    payload: VectorReembedJobPayload,
  ): void {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "a vector re-embed job's payload",
    );
    reembedBatchSize(payload.batchSize);
    reembedTables(payload.tables);
    if (
      payload.maxVectors !== undefined &&
      (!Number.isInteger(payload.maxVectors) || payload.maxVectors < 0)
    ) {
      throw new ValidationError("maxVectors must be zero or more");
    }
    // Refused here, where a human is watching, rather than as a failing
    // first batch.
    requireConfiguredModel();
  }

  /**
   * The job and its cursor — the one place a caller can see *how* it ended:
   * a budget stop completes the job like a finished walk does, and only
   * `cursor.stopped` tells them apart (`scripts/operator.ts reembed`).
   */
  async progress(ctx: Ctx): Promise<VectorReembedProgress> {
    const row = this.requireReadableJob(ctx);
    return { job: jobRowToDto(row), cursor: this.cursorOf(row).value };
  }

  protected async processBatch(
    ctx: Ctx,
    {
      cursor,
      payload,
      budget,
    }: BatchInput<VectorReembedCursor, VectorReembedJobPayload>,
  ): Promise<BatchOutcome<VectorReembedCursor>> {
    const tables = reembedTables(payload.tables);
    const batchSize = reembedBatchSize(payload.batchSize);
    const first = tables[0] ?? "item_vectors";
    const previous: VectorReembedCursor = cursor ?? {
      table: first,
      lastId: 0,
      model: requireConfiguredModel(),
      reembedded: 0,
      skipped: 0,
      failed: 0,
    };

    const seen = previous.reembedded + previous.skipped + previous.failed;
    const remaining =
      payload.maxVectors === undefined
        ? batchSize
        : Math.min(batchSize, Math.max(0, payload.maxVectors - seen));
    if (remaining === 0) {
      return { cursor: previous, processed: 0, done: true };
    }

    const rows = await this.#staleRows(previous, remaining);
    if (rows.length === 0) {
      // This table is walked out: on to the next, or done.
      const next = tables[tables.indexOf(previous.table) + 1];
      return next === undefined
        ? { cursor: previous, processed: 0, done: true }
        : {
            cursor: { ...previous, table: next, lastId: 0, lastImageId: null },
            processed: 0,
            done: false,
          };
    }

    let { reembedded, skipped, failed, lastId } = previous;
    let lastImageId = previous.lastImageId ?? null;
    let stopped: string | null = null;
    let handled = 0;
    // Rows this batch finished, one way or the other. The cursor stops at the
    // last of them, so a batch the clock or the budget cuts short resumes at
    // the next row — none skipped, none embedded twice.
    for (const row of rows) {
      if (!budget.mayStart(VECTOR_REEMBED_WORST_CASE_MS)) break;
      try {
        const result =
          row.kind === "item"
            ? await this.#regenerate.item(ctx, row.ref)
            : row.kind === "image"
              ? await this.#regenerate.image(ctx, row.ref, row.imageId)
              : await this.#regenerate.recipe(ctx, row.recipeId);
        if (result.skipped) skipped += 1;
        else reembedded += 1;
      } catch (error) {
        if (isBudgetRefusal(error)) {
          // Nothing was embedded for this row; a later run starts at it.
          stopped = error instanceof Error ? error.message : String(error);
          break;
        }
        failed += 1;
        emit({
          name: "vector_reembed.row_failed",
          severity: "WARN",
          message: `${previous.table} ${rowLabel(row)} failed to re-embed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          attributes: { "job.id": this.key, "vector.id": rowLabel(row) },
        });
      }
      handled += 1;
      if (row.kind === "image") lastImageId = row.imageId;
      else lastId = row.id;
    }

    const next: VectorReembedCursor = {
      table: previous.table,
      lastId,
      ...(lastImageId === null ? {} : { lastImageId }),
      model: previous.model,
      reembedded,
      skipped,
      failed,
      ...(stopped === null ? {} : { stopped }),
    };
    if (stopped !== null) {
      emit({
        name: "vector_reembed.stopped",
        severity: "WARN",
        message: `vector re-embed job ${this.key} stopped: ${stopped}`,
        attributes: { "job.id": this.key },
      });
      return { cursor: next, processed: handled, done: true };
    }
    // A short page ends this table, not the job: the next batch finds it
    // empty and moves on.
    return { cursor: next, processed: handled, done: false };
  }

  /**
   * The keyset page over the cursor's table. A job actor may read any table
   * (§1.1) but caches none of it: a row re-embedded by anyone in between has
   * already dropped out of the predicate.
   */
  async #staleRows(
    cursor: VectorReembedCursor,
    limit: number,
  ): Promise<readonly StaleRow[]> {
    if (cursor.table === "item_image_vectors") {
      return this.#staleImages(cursor, limit);
    }
    if (cursor.table === "item_vectors") {
      const { rows } = await this.db.execute<{
        id: number;
        item_id: string;
        item_type: string;
      }>(sql`
        select v.id, ${VECTORS.idExpr("v")} as item_id,
               ${VECTORS.typeExpr("v")} as item_type
        from public.item_vectors v
        where v.embedding_model is distinct from ${cursor.model}
          and v.id > ${cursor.lastId}
        order by v.id asc
        limit ${limit}
      `);
      return rows.flatMap((row): StaleRow[] => {
        const type = ITEM_TYPES.find(
          (candidate) => candidate === row.item_type,
        );
        return type === undefined
          ? []
          : [
              {
                id: Number(row.id),
                kind: "item",
                ref: { type, id: row.item_id },
              },
            ];
      });
    }
    const { rows } = await this.db.execute<{ id: number; recipe_id: string }>(
      sql`
        select id, recipe_id
        from public.recipe_vectors
        where embedding_model is distinct from ${cursor.model}
          and id > ${cursor.lastId}
        order by id asc
        limit ${limit}
      `,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      kind: "recipe",
      recipeId: row.recipe_id,
    }));
  }

  /**
   * G32 — the image table is the backfill as well as the re-embed: its stale
   * set is every `item_image` with **no** vector made by the configured image
   * embedding, which includes every image that has no vector at all. So the
   * walk is over `item_image`, in uuid order (`cursor.lastImageId`), not over
   * the vector table's own ids. With an embedding model that cannot take an
   * image alone there is nothing to converge on, and the table is empty.
   */
  async #staleImages(
    cursor: VectorReembedCursor,
    limit: number,
  ): Promise<readonly StaleRow[]> {
    const model = imageEmbeddingKey(embeddingModel());
    if (model === null) return [];
    const after = cursor.lastImageId ?? null;
    const { rows } = await this.db.execute<{
      id: string;
      item_id: string;
      item_type: string;
    }>(sql`
      select ii.id, ${IMAGES.idExpr("ii")} as item_id,
             ${IMAGES.typeExpr("ii")} as item_type
      from public.item_image ii
      left join public.item_image_vectors iv on iv.item_image_id = ii.id
      where iv.embedding_model is distinct from ${model}
        ${after === null ? sql`` : sql`and ii.id > ${after}::uuid`}
      order by ii.id asc
      limit ${limit}
    `);
    return rows.flatMap((row): StaleRow[] => {
      const type = ITEM_TYPES.find((candidate) => candidate === row.item_type);
      return type === undefined
        ? []
        : [
            {
              kind: "image",
              imageId: String(row.id),
              ref: { type, id: row.item_id },
            },
          ];
    });
  }
}

const rowLabel = (row: StaleRow): string | number =>
  row.kind === "image" ? row.imageId : row.id;

/**
 * `BudgetActor` refused the embedding. Checked by code rather than by class:
 * the refusal crosses two sidecar hops (`ItemActor`, then `EmbeddingActor`)
 * before it arrives here.
 */
const isBudgetRefusal = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "BUDGET_EXCEEDED";
