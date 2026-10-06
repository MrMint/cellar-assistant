/**
 * The SQL side of stored vectors — no model anywhere in reach.
 *
 * `lib/embeddings.ts` holds the `Embedder` seam (the model); this module holds
 * what every actor that *compares against* or *stores* a vector needs, and it
 * deliberately imports nothing that could call out: `no-external-calls.test.ts`
 * lets `ItemActor` import this and forbids it the model seam.
 *
 * Before it, the `halfvec` literal was built by hand as `[${v.join(",")}]` in
 * several places beside the shared `toVectorLiteral`, and the ~45-line
 * semantic-distance query over `item_vectors` was written out twice —
 * `CellarActor` and `CellarItemSearchActor` — each with its own six-column
 * select and its own min-per-item merge.
 */
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { itemVectors } from "@cellar-assistant/db";
import { and, inArray, or, sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";

/** `[0.1,0.2,…]` — the text form every `halfvec` cast in this codebase takes. */
export const toVectorLiteral = (vector: readonly number[]): string =>
  `[${vector.join(",")}]`;

/** `<literal>::halfvec` — a vector as a SQL value, for a comparison or a write. */
export const halfvec = (vector: readonly number[]) =>
  sql`${toVectorLiteral(vector)}::halfvec`;

/* -------------------------------------------------------------------------- */
/* Which embedding made a vector                                               */
/* -------------------------------------------------------------------------- */

/**
 * The embedding this process is configured with, as `embedding_model` records
 * it — or `null` when no provider is installed (`AI_PROVIDER` unset, and every
 * test that does not set one).
 *
 * It lives here, not beside the model seam in `./embeddings.ts`, because
 * `ItemActor` must read it and may not import that seam
 * (`no-external-calls.test.ts`). It is a string and a flag; nothing here can
 * call a model.
 */
export type EmbeddingModelIdentity = {
  /** `<provider>:<model>@<dimensions>/<document task>` — `embeddingModelKey`. */
  readonly key: string;
  /** Whether a document vector takes images with its text (`gemini-embedding-2`). */
  readonly acceptsImages: boolean;
};

/**
 * `embedding_model`'s spelling. The task is part of it because the same model
 * under a different task instruction is a different space
 * (`./embeddings.ts`, "A stored vector's identity"); a document vector is
 * always embedded as `RETRIEVAL_DOCUMENT`.
 */
export const embeddingModelKey = (input: {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
}): string =>
  `${input.provider}:${input.model}@${input.dimensions}/RETRIEVAL_DOCUMENT`;

let installedModel: EmbeddingModelIdentity | null = null;

/** Set by `installSeams` at boot, beside `setEmbedder`; `null` resets it. */
export const setEmbeddingModel = (
  next: EmbeddingModelIdentity | null,
): void => {
  installedModel = next;
};

export const embeddingModel = (): EmbeddingModelIdentity | null =>
  installedModel;

/**
 * `item_image_vectors.embedding_model` (G32): the document key with its task
 * replaced by `IMAGE`, because an image embedded alone carries no task
 * instruction — `vertex-ai:gemini-embedding-2@768/IMAGE`. `null` when the
 * configured embedding cannot take an image at all, which is what makes the
 * image table "nothing to do" for the re-embed job and the attach path.
 */
export const imageEmbeddingKey = (
  identity: EmbeddingModelIdentity | null,
): string | null =>
  identity === null || !identity.acceptsImages
    ? null
    : identity.key.replace(/\/[A-Z_]+$/, "/IMAGE");

/** `embedding_images` for a text-only vector. */
export const NO_IMAGES = "none";

/**
 * `embedding_images` for a vector embedded with these files, **in the order
 * they were sent** — the order is an input to the model too. `none` for no
 * files; otherwise the count and the ids themselves (at most six uuids), so a
 * changed display image or a relabelled item reads as a changed input, and an
 * operator can see exactly which files a vector was made from.
 */
export const imageSetKey = (fileIds: readonly string[]): string =>
  fileIds.length === 0 ? NO_IMAGES : `${fileIds.length}:${fileIds.join(",")}`;

/** What a fresh vector's two identity columns must hold. */
export type ExpectedEmbedding = {
  readonly model: string;
  readonly images: string;
};

/* -------------------------------------------------------------------------- */
/* Freshness                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The one stored-vector row an aggregate holds — `ItemActor`'s `item_vectors`
 * row, `RecipeActor`'s `recipe_vectors` row — reduced to what
 * `regenerateVector` needs: when it was last written, and what made it.
 * `model`/`images` are `null` for a row nobody recorded (every migrated
 * legacy vector).
 */
export type StoredVector = {
  readonly id: number;
  readonly updatedAt: Date;
  readonly model: string | null;
  readonly images: string | null;
};

/**
 * The first row of a `*_vectors` select (`id asc`) as a `StoredVector`, or
 * `null` when there is none. A null `updated_at` reads as the epoch, so such a
 * row is stale against any input that has a timestamp.
 */
export const storedVector = (
  rows: readonly {
    readonly id: number;
    readonly updatedAt: Date | null;
    readonly embeddingModel?: string | null;
    readonly embeddingImages?: string | null;
  }[],
): StoredVector | null => {
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        updatedAt: row.updatedAt ?? new Date(0),
        model: row.embeddingModel ?? null,
        images: row.embeddingImages ?? null,
      };
};

/**
 * `regenerateVector`'s skip test, shared by `ItemActor` and `RecipeActor`. A
 * stored vector is fresh when
 *
 *  1. it is at least as new as every row its embedding text was built from (a
 *     missing input timestamp counts as the epoch), **and**
 *  2. it was made by the embedding `expected` names — the configured model, over
 *     the images the actor would send now. A row with no recorded model
 *     (`null`, every legacy vector) is never that.
 *
 * `expected` is `null` only when no model is configured in this process; then
 * there is nothing to compare against and (1) alone decides, which is what a
 * process with `AI_PROVIDER` unset has always done. A missing vector is never
 * fresh.
 *
 * (2) is what the timestamp could not see: a model change touches no input
 * row, so without it a re-embed after switching models was a no-op for every
 * vector — "fresh" by clock, and in the wrong space.
 */
export const vectorIsFresh = (
  vector: Pick<StoredVector, "updatedAt" | "model" | "images"> | null,
  inputsUpdatedAt: readonly (Date | null | undefined)[],
  expected: ExpectedEmbedding | null = null,
): boolean => {
  if (vector === null) return false;
  if (
    expected !== null &&
    (vector.model !== expected.model || vector.images !== expected.images)
  ) {
    return false;
  }
  const freshest = Math.max(
    0,
    ...inputsUpdatedAt.map((at) => (at ?? new Date(0)).getTime()),
  );
  return vector.updatedAt.getTime() >= freshest;
};

/**
 * What `regenerateIfStale` did: nothing, a first insert, an update because an
 * input changed, or an update because the stored vector was made by a
 * different embedding (a model change, a legacy row, a changed image set).
 */
export type VectorRegeneration =
  | "fresh"
  | "first vector"
  | "changed"
  | "embedding changed";

/**
 * The order `regenerateVector` runs in, shared by `ItemActor` and
 * `RecipeActor`, and the reason both are idempotent without a key (§8.4):
 *
 *  1. if `vector` is fresh against `inputsUpdatedAt` and `expected`
 *     (`vectorIsFresh`), stop — a redelivery costs the caller's `SELECT`s and
 *     never reaches the model;
 *  2. otherwise `embed` — build the text and call the model, outside any
 *     transaction, so a slow model holds no locks;
 *  3. then `write` what `embed` returned, given the row to update (`null`
 *     means insert).
 *
 * Only the sequence is shared. `write` is the actor's own — its own table,
 * its own columns, in its own transaction — so the single-writer scan
 * (`packages/db/src/writers-scan.ts`) goes on attributing the insert and the
 * update to the actor that owns the table. An error from `embed` or `write`
 * propagates unchanged; after a failed `embed`, `write` is never called.
 */
export const regenerateIfStale = async <Embedded>(
  vector: StoredVector | null,
  inputsUpdatedAt: readonly (Date | null | undefined)[],
  steps: {
    readonly embed: () => Promise<Embedded>;
    readonly write: (
      embedded: Embedded,
      existing: StoredVector | null,
    ) => Promise<void>;
  },
  expected: ExpectedEmbedding | null = null,
): Promise<VectorRegeneration> => {
  if (vectorIsFresh(vector, inputsUpdatedAt, expected)) return "fresh";
  const embedded = await steps.embed();
  await steps.write(embedded, vector);
  if (vector === null) return "first vector";
  return vectorIsFresh(vector, inputsUpdatedAt)
    ? "embedding changed"
    : "changed";
};

/**
 * Cosine distance from `query` to each of `refs`' stored vectors, by item id.
 *
 * One query over `item_vectors` for the lot, narrowed per type through the
 * arc's own columns — never one `ItemActor.get` per item (B1). An item with no
 * vector (never embedded, or embedded as `null`) is simply absent from the map;
 * callers decide whether that sorts last or drops out. Since
 * `item_vectors_one_per_item` there is at most one row per item, so the map is
 * a plain projection; the `min` below only matters to a database that has not
 * run that migration yet.
 */
export const vectorDistances = async (
  db: DbOrTx,
  refs: readonly ItemRef[],
  query: readonly number[],
): Promise<Map<string, number>> => {
  const arc = ARCS.itemVectors;
  const byType = new Map<ItemType, string[]>();
  for (const ref of refs) {
    byType.set(ref.type, [...(byType.get(ref.type) ?? []), ref.id]);
  }
  const conditions = [...byType.entries()].map(([type, ids]) =>
    inArray(arc.columns[type], ids),
  );
  if (conditions.length === 0) return new Map();

  const rows = await db
    .select({
      itemId: sql<string>`${arc.idExpr()}`,
      distance: sql<number>`(${itemVectors.vector} <=> ${halfvec(query)})`,
    })
    .from(itemVectors)
    .where(and(sql`${itemVectors.vector} is not null`, or(...conditions)));

  const distances = new Map<string, number>();
  for (const row of rows) {
    const distance = Number(row.distance);
    const previous = distances.get(row.itemId);
    if (previous === undefined || distance < previous) {
      distances.set(row.itemId, distance);
    }
  }
  return distances;
};
