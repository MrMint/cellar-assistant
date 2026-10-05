/**
 * `CategoryVectorsActor` — A9 (migration plan §2.1, §5).
 *
 * > **`CategoryVectorsActor()`** — singleton. Owns: `category_vectors`.
 * > Methods: `seed` (admin; replaces `seedCategoryVectors`), `all`.
 *
 * `category_vectors` holds the fixed catalog of category/alias/descriptor
 * embeddings that place and item search match against — small, admin-curated,
 * read far more often than written. A singleton is the right call here (§1.5
 * reserves singletons for "things that *should* serialize"): there is exactly
 * one such catalog, `seed` is an infrequent admin operation, and every reader
 * shares one warm, fully-cached activation instead of one per table the way
 * `ReferenceDataActor` needs.
 *
 * Tagged `"entity"`, not `"reference"`: this table *is* written (by `seed`),
 * and `packages/db/src/writers.ts` already names `CategoryVectorsActor` as
 * `category_vectors`'s writer. §1.1 has no "singleton that writes" row; A5's
 * gap note against §1.1 says an infrastructure singleton "borrows `entity`",
 * and the same borrowing is the only fit for a domain singleton that writes.
 *
 * **What `seed` does not do.** §8.5: "No AI or external call runs inside" an
 * entity actor's turn. Computing an embedding is exactly such a call, so
 * `seed` takes already-computed vectors — the caller (an admin script today;
 * later, whatever replaces `seedCategoryVectors`) runs the AI call itself and
 * hands the result here to be written, once, inside a transaction.
 */
import {
  type ActorCategory,
  CATEGORY_VECTORS_ACTOR_ID,
  type CategoryVectorRow,
  type CategoryVectorSeedInput,
  type CategoryVectorSeedResult,
  CategoryVectorsActorDescriptor,
  type CategoryVectorsActorInterface,
  type Ctx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { categoryVectors } from "@cellar-assistant/db";
import { asc, sql } from "@cellar-assistant/db/orm";
import { EntityActorBase, exactKey, type KeyShape } from "../lib/actor-base.ts";
import { requirePrivileged } from "../lib/guards.ts";

type CategoryVectorsAggregate = {
  readonly rows: readonly CategoryVectorRow[];
};

export class CategoryVectorsActor
  extends EntityActorBase<CategoryVectorsAggregate>
  implements CategoryVectorsActorInterface
{
  static readonly category: ActorCategory =
    CategoryVectorsActorDescriptor.category;
  static override readonly keyShape: KeyShape = exactKey(
    CATEGORY_VECTORS_ACTOR_ID,
  );

  /** `id` (`this.key`) is always `"singleton"` — see `CATEGORY_VECTORS_ACTOR_ID`
   * in `@cellar-assistant/contracts`. Every row loads regardless of it. */
  protected async loadAggregate(
    _id: string,
  ): Promise<CategoryVectorsAggregate> {
    const rows = await this.db
      .select({
        id: categoryVectors.id,
        label: categoryVectors.label,
        labelType: categoryVectors.labelType,
        associatedCategories: categoryVectors.associatedCategories,
        metadata: categoryVectors.metadata,
        createdAt: categoryVectors.createdAt,
        updatedAt: categoryVectors.updatedAt,
      })
      .from(categoryVectors)
      .orderBy(asc(categoryVectors.label));
    return {
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        labelType: row.labelType,
        associatedCategories: row.associatedCategories ?? [],
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        createdAt: row.createdAt?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Every row, without its embedding — see the module doc's projection note. */
  async all(_ctx: Ctx): Promise<readonly CategoryVectorRow[]> {
    return this.requireAggregate().rows;
  }

  /**
   * Upserts on `label` (the table's own unique constraint,
   * `category_vectors_label_key`), so re-running a seed with an updated
   * embedding or description is the normal way to use this, not a special
   * case — §8.4 idempotency is the unique key itself. Admin/system only,
   * replacing `seedCategoryVectors` (§5).
   */
  async seed(
    ctx: Ctx,
    rows: readonly CategoryVectorSeedInput[],
  ): Promise<CategoryVectorSeedResult> {
    // System passes too: `requirePrivileged`, whatever the message says to a
    // request (for which "admin only" is the whole truth).
    requirePrivileged(ctx, "CategoryVectorsActor.seed is admin only");
    if (rows.length === 0) {
      throw new ValidationError("seed: at least one row is required");
    }
    for (const row of rows) {
      if (row.label.trim().length === 0) {
        throw new ValidationError("seed: label must not be blank");
      }
      if (row.vector.length === 0) {
        throw new ValidationError(`seed: ${row.label} has an empty vector`);
      }
    }

    await this.tx(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(categoryVectors)
          .values({
            label: row.label,
            labelType: row.labelType ?? "category",
            associatedCategories: [...(row.associatedCategories ?? [])],
            vector: [...row.vector],
            metadata: row.metadata ?? {},
          })
          .onConflictDoUpdate({
            target: categoryVectors.label,
            set: {
              labelType: row.labelType ?? "category",
              associatedCategories: [...(row.associatedCategories ?? [])],
              vector: [...row.vector],
              metadata: row.metadata ?? {},
              updatedAt: sql`now()`,
            },
          });
      }
    });
    await this.reload();

    return { seeded: rows.length };
  }
}
