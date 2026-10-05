/**
 * `RecipeActor` — B6 (migration plan §2.1, §3, §5).
 *
 * > **`RecipeActor(recipeId)`**
 * > - Owns: `recipes`, `recipe_ingredients`, `recipe_instructions`,
 * >   `recipe_vectors`, `recipe_reviews`.
 * > - Methods: `get`, `create`, `update`, `setIngredients`, `setInstructions`,
 * >   `addReview`, `regenerateVector` (system, outbox).
 *
 * Five tables, all keyed on one `recipe_id`, all loaded on activate: a recipe
 * is a handful of ingredients and a handful of steps, so — same reasoning as
 * `CellarActor` and `TierListActor` — the whole aggregate fits in memory and
 * every read pages the cached lists rather than issuing a query.
 *
 * ## Authorization, including one hole this closes
 *
 * `docs/architecture/target-stack.md` §7: "`recipe_reviews` and `recipe_votes`
 * have no permissions in metadata and are written with elevated credentials."
 * That is not a rule to preserve — it is the absence of one. B6 adopts B2's
 * `item_reviews` rule verbatim, because a recipe review is the same kind of
 * row as an item review:
 *
 *   - `addReview` — any signed-in user; anonymous refused;
 *   - `updateReview` / `deleteReview` — **the author only**, plus admin/system.
 *
 * Everything else follows today's Hasura metadata exactly: `recipes`' select
 * filter is `{}` for the `user` role (the catalog rule — any signed-in viewer,
 * anonymous refused, as B3 settled for `BrandActor`), and its update/delete
 * filters are `created_by_id = session user`, which is what `#requireCreator`
 * is. `recipe_ingredients` and `recipe_instructions` gate on
 * `recipe.created_by_id` in the same metadata, so `setIngredients` and
 * `setInstructions` are creator-only too.
 *
 * `recipes.created_by_id` is **nullable** and `ON DELETE SET NULL` (unlike the
 * six item tables' `NOT NULL` creator), so a recipe whose author's account is
 * gone has no creator at all. `#requireCreator` refuses everyone but an admin
 * in that case rather than treating "no owner" as "everyone's" — the same
 * decision `ItemActor.updateGeneric` made for `generic_items`.
 *
 * ## Generic items: called for, never written (§1.2)
 *
 * B2 settled that `generic_items` is a **key namespace of `ItemActor`**, not an
 * `ItemType`, and that `ItemActor` is its single writer. `recipe_ingredients`
 * is the only table in the schema that references `generic_items`, so this
 * actor is the only thing that ever needs one created — and it does that by
 * calling `ItemActor(generic:<id>).createGeneric`, never by inserting the row.
 * The call goes through an injected seam (`EnsureGenericItem`, defaulted to a
 * real sidecar hop) so the no-Dapr harness can drive it, exactly the way
 * `BrandRegistryActor` injects `BrandActor.create`.
 *
 * `packages/db/src/writers.test.ts` is what actually proves the rule: it scans
 * this module for `.insert(genericItems)` / `.update(...)` / `.delete(...)` and
 * fails if one appears. `recipe-actor.test.ts` proves the other half — that
 * the row really does get created, through the seam, and that the ingredient
 * ends up pointing at it.
 *
 * **§8.5 note, deliberate and worth ratifying.** §8.5's call graph says an
 * entity actor may call `FileActor`, `BudgetActor`, `EmbeddingActor`,
 * `BrandRegistryActor` and `BarcodeActor` synchronously, and "other entity
 * actors **only via the outbox**". `ItemActor.createGeneric` is a sixth
 * synchronous edge and is not on that list. It is taken anyway, for three
 * reasons: it is a single `INSERT … ON CONFLICT DO NOTHING` with no external
 * call in it (`no-external-calls.test.ts` pins that for `ItemActor`); it
 * cannot cycle back into `RecipeActor`, so reentrancy — the reason the rule
 * exists — is not in play; and routing it through the outbox would mean the
 * ingredient row could not be written in the same transaction as its own FK
 * target's existence, turning a two-millisecond insert into a state machine.
 * `recipe-actor.test.ts` pins the target list statically so a *seventh* edge
 * cannot be added silently.
 *
 * ## The vector: outbox-driven, and it watches the group too
 *
 * §5 routes `generateRecipeVector` (a Hasura event trigger on `recipes`) here,
 * "via outbox". `create`, `update`, `setIngredients` and `setInstructions`
 * enqueue `regenerateVector` in the same transaction as their write, and only
 * when the text that would be embedded actually changed — the recipe-shaped
 * version of B2's "a `notes` update does not enqueue".
 *
 * The freshness check compares the vector against `max(recipes.updated_at,
 * recipe_groups.updated_at)`, not against `recipes.updated_at` alone. That is
 * not defensive coding: a recipe's embedding text includes its group's name,
 * category, base spirit and tags (the old `_embedding-generator.ts` did too),
 * and `RecipeGroupActor.vote` changes the group's name when the canonical
 * recipe moves — without touching any `recipes` row. Comparing against the
 * recipe alone would make every one of those regenerations a silent no-op.
 *
 * The embedding text built here is a faithful but *lean* port of
 * `functions/generateRecipeVector/_embedding-generator.ts`: same inputs, same
 * ordering, minus that file's keyword-expansion tables
 * (`_embedding-config.ts`). Those tables are search *tuning*, and recipe
 * search is C1's; see the B6 report.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddRecipeReviewInput,
  CreateGenericItemInput,
  CreateRecipeInput,
  Ctx,
  DeletedRecipe,
  DeletedRecipeReview,
  GenericItemDto,
  InstructionType,
  Page,
  PageArgs,
  RecipeActorInterface,
  RecipeDto,
  RecipeIngredientDto,
  RecipeIngredientInput,
  RecipeIngredientRef,
  RecipeIngredientType,
  RecipeInstructionDto,
  RecipeReviewDto,
  RecipeScoreDto,
  RecipeType,
  RegenerateRecipeVectorResult,
  SetRecipeIngredientsInput,
  SetRecipeInstructionsInput,
  UpdateRecipeInput,
  UpdateRecipeReviewInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  GENERIC_ITEM_KINDS,
  INSTRUCTION_TYPES,
  ITEM_TYPES,
  ItemActorDescriptor,
  isGenericItemKind,
  isRecipeIngredientType,
  isRecipeType,
  NotFoundError,
  offsetPage,
  RecipeActorDescriptor,
  requireOneIngredientSource,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  genericItems,
  recipeGroups,
  recipeIngredients,
  recipeInstructions,
  recipeReviews,
  recipes,
  recipeVectors,
} from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy, isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import {
  daprEmbedDocument,
  type EmbedDocument,
} from "../lib/embedding-client.ts";
import {
  requirePrivileged,
  requireSignedIn,
  requireViewer,
} from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  ingredientRefOf,
  ingredientRowToDto,
} from "../lib/recipe-ingredients.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";
import {
  embeddingModel,
  halfvec,
  NO_IMAGES,
  regenerateIfStale,
  type StoredVector,
  storedVector,
} from "../lib/vectors.ts";

/* -------------------------------------------------------------------------- */
/* Rows and the aggregate                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `recipe_ingredients` has a **defined** order (A7d item 6): required first,
 * then by the referenced thing's name, then by id.
 *
 * What it replaces was `created_at asc, id asc`, which looks stable and is not.
 * `setIngredients` deletes the list and re-inserts it as one multi-row
 * `INSERT`, and `now()` is transaction-stable in Postgres — so **every row
 * shares an identical `created_at`** and the whole ordering fell through to
 * `id asc`, a fresh `randomUUID()` per row. The same recipe therefore listed
 * its ingredients in a different order after every edit, which is the defect
 * D6 reported.
 *
 * The rule is the one D6 imposed client-side, moved to where it belongs.
 * There is no `display_order` column on this table (unlike
 * `recipe_instructions.step_number`), so the caller's array order is not
 * recoverable; adding one is a migration, not an API fix. Required-then-
 * alphabetical is deterministic for a given row set, which is what "defined"
 * has to mean here.
 *
 * `is_optional` is nullable, hence the `coalesce`. The name comes from seven
 * correlated subqueries rather than seven `LEFT JOIN`s so that the `SELECT`
 * list — and therefore `RecipeIngredientRow` — is untouched; each is a primary
 * key lookup, and `exactly_one_item_reference` guarantees exactly one of them
 * is not null. `nulls last` covers a row whose referent was deleted from under
 * it, and `id asc` is the final tiebreak so the sort is total.
 */
const INGREDIENT_ORDER = sql`
  coalesce(${recipeIngredients.isOptional}, false) asc,
  lower(coalesce(
    ${sql.join(
      ITEM_TYPES.map((type) => {
        const table = ITEM_TABLES[type];
        return sql`(select ${table.name} from ${table}
          where ${table.id} = ${ARCS.recipeIngredients.column(type)})`;
      }),
      sql`,
    `,
    )},
    (select g.name from ${genericItems} g
      where g.id = ${recipeIngredients.genericItemId})
  )) asc nulls last,
  ${recipeIngredients.id} asc
`;

type RecipeRow = typeof recipes.$inferSelect;
type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
type RecipeInstructionRow = typeof recipeInstructions.$inferSelect;
type RecipeReviewRow = typeof recipeReviews.$inferSelect;

/**
 * The group fields a recipe's embedding text reads, plus the timestamp the
 * vector-freshness check compares against. A read of `RecipeGroupActor`'s
 * table — reads across aggregates are fine, §1.2 is about writes.
 */
type OwningGroup = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly baseSpirit: string | null;
  readonly tags: readonly string[];
  readonly updatedAt: Date | null;
};

/**
 * **The owning group is deliberately not here.** §1.3 says an actor caches its
 * aggregate on activate, and §1.2 says every table has one writer — put
 * together, an actor may cache only what it *owns*. `recipe_groups` belongs to
 * `RecipeGroupActor`, which renames it whenever voting moves the canonical
 * recipe, touching no `recipes` row. A cached copy here would go stale with
 * nothing to invalidate it, and the one method that reads it —
 * `regenerateVector` — would then skip exactly the regenerations that change
 * was supposed to cause. It is read fresh, inside that method, instead.
 */
export type RecipeAggregate = {
  readonly recipe: RecipeRow;
  readonly ingredients: readonly RecipeIngredientRow[];
  /** `step_number asc` — the order they are meant to be read in. */
  readonly instructions: readonly RecipeInstructionRow[];
  readonly reviews: readonly RecipeReviewRow[];
  readonly vector: StoredVector | null;
};

/* -------------------------------------------------------------------------- */
/* Injected seams (§8.5)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `ItemActor(generic:<id>).createGeneric` — how an ingredient that names a
 * `generic_items` row nobody has created yet gets one, without this actor
 * writing another aggregate's table (§1.2). Injected so the no-sidecar harness
 * can substitute an in-process `ItemActor` sharing the test's transaction,
 * exactly as `BrandRegistryActor` does for `BrandActor.create`.
 */
export type EnsureGenericItem = (
  ctx: Ctx,
  genericItemId: string,
  input: CreateGenericItemInput,
) => Promise<GenericItemDto>;

/** `generic:<uuid>` — `ItemActor`'s seventh key namespace (B2). */
const genericItemKey = (id: string): string => `generic:${id}`;

export const daprEnsureGenericItem: EnsureGenericItem = (
  ctx,
  genericItemId,
  input,
) =>
  internal(ctx)(
    ItemActorDescriptor,
    genericItemKey(genericItemId),
  ).createGeneric(input);

/* -------------------------------------------------------------------------- */
/* Column maps                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `recipe_ingredients`' seven-column polymorphic FK: the six-column item arc
 * (`../lib/item-arcs.ts`) plus `generic_item_id`, under one
 * `num_nonnulls(...) = 1` check. There is no generated `type` column here
 * (unlike `tier_list_items`), so the read side derives the ref from whichever
 * column is non-null.
 */
const INGREDIENTS = ARCS.recipeIngredients;

/** The insert fragment for one ingredient ref — the arc's, or the generic's. */
const ingredientValues = (
  ref: RecipeIngredientRef,
): { readonly [property: string]: string } =>
  ref.type === "GENERIC"
    ? { genericItemId: ref.id }
    : INGREDIENTS.values({ type: ref.type, id: ref.id });

/**
 * One validated ingredient: the row to insert, plus the two fields
 * `ingredientSignature` reads. Carrying the ref alongside the row value keeps
 * change detection out of the business of re-deriving it from seven nullable
 * columns of an object that has not been written yet.
 */
type ResolvedIngredient = {
  readonly ref: RecipeIngredientRef;
  readonly isOptional: boolean;
  readonly value: typeof recipeIngredients.$inferInsert;
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const requiredIso = (value: Date): string => value.toISOString();

const requireName = (name: string, what: string): string => {
  const trimmed = name.trim();
  if (trimmed === "") throw new ValidationError(`${what} must not be blank`);
  if (trimmed.length > 300) {
    throw new ValidationError(`${what} must be 300 characters or less`);
  }
  return trimmed;
};

const requireRecipeType = (value: string): RecipeType => {
  if (!isRecipeType(value)) {
    throw new ValidationError(
      `recipes.type must be one of cocktail|food (recipes_type_check), got ${value}`,
    );
  }
  return value;
};

/** `recipes_difficulty_level_check`: 1-5. */
const requireDifficulty = (value: number | null): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError(
      `difficultyLevel must be an integer between 1 and 5, got ${value}`,
    );
  }
  return value;
};

const requirePositiveOrNull = (
  value: number | null,
  what: string,
): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${what} must be a non-negative integer`);
  }
  return value;
};

/** `recipe_reviews_score_range`: half-stars from 0.5 to 5, or null. */
const requireScore = (score: number | null | undefined): number | null => {
  if (score === null || score === undefined) return null;
  const doubled = score * 2;
  if (!Number.isInteger(doubled) || score < 0.5 || score > 5) {
    throw new ValidationError(
      `score must be a half-step between 0.5 and 5, got ${score}`,
    );
  }
  return score;
};

const requireInstructionType = (
  value: string | null | undefined,
): InstructionType | null => {
  if (value === null || value === undefined) return null;
  if (!(INSTRUCTION_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(
      `instructionType must be one of ${INSTRUCTION_TYPES.join("|")}, got ${value}`,
    );
  }
  return value as InstructionType;
};

const instructionRowToDto = (
  row: RecipeInstructionRow,
): RecipeInstructionDto => ({
  id: row.id,
  recipeId: row.recipeId,
  stepNumber: row.stepNumber,
  instructionText: row.instructionText,
  instructionType: row.instructionType as InstructionType | null,
  equipmentNeeded: row.equipmentNeeded,
  timeMinutes: row.timeMinutes,
  createdAt: iso(row.createdAt),
});

const reviewRowToDto = (row: RecipeReviewRow): RecipeReviewDto => ({
  id: row.id,
  recipeId: row.recipeId,
  userId: row.userId,
  score: row.score,
  text: row.text,
  createdAt: requiredIso(row.createdAt),
  updatedAt: requiredIso(row.updatedAt),
});

/**
 * The `recipes` columns the embedding text is built from — B2's
 * `EMBEDDING_FIELDS`, for recipes. `image_url` and `version` are the
 * embedding-inert ones: editing either writes a row and enqueues nothing,
 * which is this workstream's version of "a `notes` update does not enqueue".
 */
const EMBEDDING_FIELDS: readonly string[] = [
  "name",
  "description",
  "type",
  "difficultyLevel",
  "prepTimeMinutes",
  "servingSize",
  "recipeGroupId",
];

/**
 * What `setIngredients` compares to decide whether a `regenerateVector` row is
 * worth writing. Deliberately *not* the embedding text itself: that needs
 * ingredient **names**, which live in seven other tables and would turn every
 * write into seven extra reads. Quantity, unit and substitution notes are
 * absent because the embedding text never read them.
 *
 * Computed on both sides *before* the transaction opens, so the outbox row can
 * go inside it (§1.4) rather than being decided after the fact.
 */
const ingredientSignature = (
  entries: readonly { ref: RecipeIngredientRef; isOptional: boolean }[],
): string =>
  JSON.stringify(
    entries
      .map((entry) => `${entry.ref.type}:${entry.ref.id}:${entry.isOptional}`)
      .sort(),
  );

const instructionSignature = (
  entries: readonly {
    stepNumber: number;
    instructionText: string;
    instructionType: InstructionType | null;
  }[],
): string =>
  JSON.stringify(
    entries.map((entry) => [
      entry.stepNumber,
      entry.instructionText,
      entry.instructionType,
    ]),
  );

/** Deduplication key for a find-or-create generic item: the unique index. */
const genericKey = (name: string, category: string): string =>
  `${name}\0${category}`;

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class RecipeActor
  extends EntityActorBase<RecipeAggregate>
  implements RecipeActorInterface
{
  static readonly category: ActorCategory = RecipeActorDescriptor.category;

  readonly #ensureGenericItem: EnsureGenericItem;
  readonly #embed: EmbedDocument;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    ensureGenericItem: EnsureGenericItem = daprEnsureGenericItem,
    embed: EmbedDocument = daprEmbedDocument,
  ) {
    super(daprClient, id, db);
    this.#ensureGenericItem = ensureGenericItem;
    this.#embed = embed;
  }

  protected async loadAggregate(id: string): Promise<RecipeAggregate | null> {
    if (!isUuid(id)) return null;

    const [recipe] = await this.db
      .select()
      .from(recipes)
      .where(eq(recipes.id, id));
    if (recipe === undefined) return null;

    const [ingredients, instructions, reviews, vectors] = await Promise.all([
      this.db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, id))
        .orderBy(INGREDIENT_ORDER),
      this.db
        .select()
        .from(recipeInstructions)
        .where(eq(recipeInstructions.recipeId, id))
        .orderBy(sql`${recipeInstructions.stepNumber} asc`),
      this.db
        .select()
        .from(recipeReviews)
        .where(eq(recipeReviews.recipeId, id))
        .orderBy(
          sql`${recipeReviews.createdAt} desc, ${recipeReviews.id} desc`,
        ),
      this.db
        .select({
          id: recipeVectors.id,
          updatedAt: recipeVectors.updatedAt,
          embeddingModel: recipeVectors.embeddingModel,
          embeddingImages: recipeVectors.embeddingImages,
        })
        .from(recipeVectors)
        .where(eq(recipeVectors.recipeId, id))
        .orderBy(sql`${recipeVectors.id} asc`),
    ]);

    return {
      recipe,
      ingredients,
      instructions,
      reviews,
      vector: storedVector(vectors),
    };
  }

  async #readGroup(groupId: string | null): Promise<OwningGroup | null> {
    if (groupId === null) return null;
    const [row] = await this.db
      .select({
        id: recipeGroups.id,
        name: recipeGroups.name,
        description: recipeGroups.description,
        category: recipeGroups.category,
        baseSpirit: recipeGroups.baseSpirit,
        tags: recipeGroups.tags,
        updatedAt: recipeGroups.updatedAt,
      })
      .from(recipeGroups)
      .where(eq(recipeGroups.id, groupId));
    if (row === undefined) return null;
    return { ...row, tags: row.tags ?? [] };
  }

  /* ---------------------------------------------------------------------- */
  /* Policy                                                                  */
  /* ---------------------------------------------------------------------- */

  // Reads are catalog data: today's `recipes` select filter is `{}` for the
  // `user` role, which is "any signed-in user, nobody else" —
  // `requireSignedIn` (`../lib/guards.ts`), the rule B3 settled for
  // `BrandActor` and B2 reused for `ItemActor`.

  /**
   * Today's `recipes` update/delete filter, verbatim. A recipe whose creator
   * is `null` (the column is `ON DELETE SET NULL`) belongs to nobody, and only
   * an admin may touch it — `ItemActor.updateGeneric`'s decision for the same
   * shape of column.
   */
  #requireCreator(ctx: Ctx, aggregate: RecipeAggregate, what: string): void {
    if (bypassesPolicy(ctx)) return;
    if (aggregate.recipe.createdById === null) {
      throw new ForbiddenError(
        `recipe ${this.key} has no creator; only an admin may ${what}`,
      );
    }
    if (isOwner(ctx, aggregate.recipe.createdById)) return;
    throw new ForbiddenError(`recipe ${this.key} is not yours to ${what}`);
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<RecipeDto> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a recipe");
    return this.#toDto(aggregate);
  }

  async ingredients(
    ctx: Ctx,
    page: PageArgs,
  ): Promise<Page<RecipeIngredientDto>> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a recipe's ingredients");
    return offsetPage(aggregate.ingredients.map(ingredientRowToDto), page);
  }

  async instructions(
    ctx: Ctx,
    page: PageArgs,
  ): Promise<Page<RecipeInstructionDto>> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a recipe's instructions");
    return offsetPage(aggregate.instructions.map(instructionRowToDto), page);
  }

  async reviews(ctx: Ctx, page: PageArgs): Promise<Page<RecipeReviewDto>> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a recipe's reviews");
    return offsetPage(aggregate.reviews.map(reviewRowToDto), page);
  }

  /** Computed in memory from the loaded reviews — replaces `_aggregate`. */
  async score(ctx: Ctx): Promise<RecipeScoreDto> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a recipe's score");
    const scored = aggregate.reviews.filter(
      (row): row is RecipeReviewRow & { score: number } => row.score !== null,
    );
    if (scored.length === 0) return { average: null, count: 0 };
    const total = scored.reduce((sum, row) => sum + row.score, 0);
    return { average: total / scored.length, count: scored.length };
  }

  /* ---------------------------------------------------------------------- */
  /* The recipe itself                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Provisional-id pattern: the caller mints `recipeId` and addresses this
   * actor by it before any row exists.
   *
   * **Idempotent on `this.key`** (§8.4) — a re-delivered create (from
   * `RecipePhotoJobActor`, C4) addresses the same actor id and gets the
   * existing row back rather than a second recipe.
   */
  async create(ctx: Ctx, input: CreateRecipeInput): Promise<RecipeDto> {
    // The caller gate first (`lib/guards.ts`), so an anonymous request is
    // `Forbidden` whatever id it names — it used to be told `Validation` about
    // a malformed key before being told it may not create at all.
    const createdById = requireSignedIn(ctx, "create a recipe");
    requireUuid(this.key, "recipeId");
    const existing = this.aggregate;
    if (existing !== null) return this.#toDto(existing);

    const name = requireName(input.name, "a recipe's name");
    const type = requireRecipeType(input.type);
    const recipeGroupId =
      input.recipeGroupId === undefined || input.recipeGroupId === null
        ? null
        : requireUuid(input.recipeGroupId, "recipeGroupId");

    await this.tx(async (tx) => {
      await tx
        .insert(recipes)
        .values({
          id: this.key,
          name,
          type,
          description: input.description ?? null,
          recipeGroupId,
          difficultyLevel: requireDifficulty(input.difficultyLevel ?? null),
          prepTimeMinutes: requirePositiveOrNull(
            input.prepTimeMinutes ?? null,
            "prepTimeMinutes",
          ),
          servingSize: requirePositiveOrNull(
            input.servingSize ?? null,
            "servingSize",
          ),
          imageUrl: input.imageUrl ?? null,
          createdById,
        })
        .onConflictDoNothing({ target: recipes.id });
      // §1.4: the write and its follow-up commit together. A new recipe has
      // no vector, so this is unconditional — unlike `update`.
      await this.#enqueueRegenerate(tx, "create", ctx);
    });

    await this.reload();
    return this.#toDto(this.requireAggregate());
  }

  /** Creator only (today's `recipes` update filter). */
  async update(ctx: Ctx, input: UpdateRecipeInput): Promise<RecipeDto> {
    const aggregate = this.requireAggregate();
    this.#requireCreator(ctx, aggregate, "update");

    const patch: Partial<typeof recipes.$inferInsert> = {};
    if (input.name !== undefined) {
      patch.name = requireName(input.name, "a recipe's name");
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.type !== undefined) patch.type = requireRecipeType(input.type);
    if (input.recipeGroupId !== undefined) {
      patch.recipeGroupId =
        input.recipeGroupId === null
          ? null
          : requireUuid(input.recipeGroupId, "recipeGroupId");
    }
    if (input.difficultyLevel !== undefined) {
      patch.difficultyLevel = requireDifficulty(input.difficultyLevel);
    }
    if (input.prepTimeMinutes !== undefined) {
      patch.prepTimeMinutes = requirePositiveOrNull(
        input.prepTimeMinutes,
        "prepTimeMinutes",
      );
    }
    if (input.servingSize !== undefined) {
      patch.servingSize = requirePositiveOrNull(
        input.servingSize,
        "servingSize",
      );
    }
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (Object.keys(patch).length === 0) return this.#toDto(aggregate);

    // B2's change-detection shape: compare each patched field against the
    // loaded row, so a same-value rewrite enqueues nothing.
    const before = aggregate.recipe as unknown as Record<string, unknown>;
    const embeddingChanged = Object.entries(patch).some(
      ([field, value]) =>
        EMBEDDING_FIELDS.includes(field) &&
        String(value) !== String(before[field]),
    );

    await this.tx(async (tx) => {
      await tx
        .update(recipes)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(recipes.id, this.key));
      if (embeddingChanged) await this.#enqueueRegenerate(tx, "update", ctx);
    });
    await this.reload();
    return this.#toDto(this.requireAggregate());
  }

  /* ---------------------------------------------------------------------- */
  /* Ingredients                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Creator only. Replaces the recipe's **complete** ingredient list in one
   * transaction — the same "this argument is the full membership" contract
   * B7's `reorderBand` uses, and for the same reason: a partial update API
   * over a polymorphic child table is where silent drops come from.
   *
   * Naturally idempotent (§8.4's second branch): the method is a replacement,
   * so applying the same input twice leaves the same rows. Row ids differ
   * between the two applications, which is why the outbox row is enqueued on
   * a *content* signature rather than on "we wrote something".
   *
   * Generic ingredients are resolved **before** the transaction opens, because
   * `ItemActor.createGeneric` commits in its own transaction. A recipe write
   * that then fails leaves an unreferenced `generic_items` row behind — the
   * same trade `BrandRegistryActor` makes, and the right one for a catalog
   * row that find-or-create will hand to the next caller.
   */
  async setIngredients(
    ctx: Ctx,
    input: SetRecipeIngredientsInput,
  ): Promise<readonly RecipeIngredientDto[]> {
    const aggregate = this.requireAggregate();
    this.#requireCreator(ctx, aggregate, "set its ingredients");

    const resolved = await this.#resolveIngredients(ctx, input.ingredients);
    const changed =
      ingredientSignature(
        aggregate.ingredients.map((row) => ({
          ref: ingredientRefOf(row),
          isOptional: row.isOptional ?? false,
        })),
      ) !== ingredientSignature(resolved);

    await this.tx(async (tx) => {
      await tx
        .delete(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, this.key));
      if (resolved.length > 0) {
        await tx
          .insert(recipeIngredients)
          .values(resolved.map((entry) => entry.value));
      }
      await tx
        .update(recipes)
        .set({ updatedAt: new Date() })
        .where(eq(recipes.id, this.key));
      if (changed) await this.#enqueueRegenerate(tx, "setIngredients", ctx);
    });

    await this.reload();
    return this.requireAggregate().ingredients.map(ingredientRowToDto);
  }

  /**
   * Validates every ingredient, then turns each one into a row value —
   * calling `ItemActor` for any `newGenericItem` that has no row yet.
   *
   * Find-or-create is by `(name, category)`, which is exactly
   * `idx_generic_items_name_category`, the unique index `ItemActor.createGeneric`
   * translates a violation of into `ConflictError`. Two identical
   * `newGenericItem` entries in one call resolve to one row, and a concurrent
   * creator that wins the race is converged on rather than surfaced.
   */
  async #resolveIngredients(
    ctx: Ctx,
    inputs: readonly RecipeIngredientInput[],
  ): Promise<ResolvedIngredient[]> {
    const resolvedGenerics = new Map<string, string>();
    const values: ResolvedIngredient[] = [];

    for (const ingredient of inputs) {
      requireOneIngredientSource(ingredient);

      let ref: RecipeIngredientRef;
      if (ingredient.ref !== undefined && ingredient.ref !== null) {
        const type = ingredient.ref.type;
        if (!isRecipeIngredientType(type)) {
          throw new ValidationError(
            `not a recipe-ingredient type: ${type} (expected GENERIC or one of the six item types)`,
          );
        }
        ref = { type, id: requireUuid(ingredient.ref.id, "ingredient.ref.id") };
      } else {
        const generic = ingredient.newGenericItem;
        if (generic === undefined || generic === null) {
          // `requireOneIngredientSource` already ruled this out; the compiler
          // has not read it.
          throw new ValidationError("ingredient has no source");
        }
        const id = await this.#resolveGenericItem(
          ctx,
          generic,
          resolvedGenerics,
        );
        ref = { type: "GENERIC", id };
      }

      const isOptional = ingredient.isOptional ?? false;
      values.push({
        ref,
        isOptional,
        value: {
          id: randomUUID(),
          recipeId: this.key,
          quantity:
            ingredient.quantity === undefined || ingredient.quantity === null
              ? null
              : String(ingredient.quantity),
          unit: ingredient.unit ?? null,
          isOptional,
          substitutionNotes: ingredient.substitutionNotes ?? null,
          ...ingredientValues(ref),
        },
      });
    }

    return values;
  }

  /**
   * `generic_items` is **read** here and **written** by `ItemActor` — §1.2's
   * single-writer rule in one method. The read is the "find" half of
   * find-or-create, which `ItemActor` cannot serve: `getGeneric` is keyed by
   * id, and an id is the thing being resolved.
   */
  async #resolveGenericItem(
    ctx: Ctx,
    input: CreateGenericItemInput,
    memo: Map<string, string>,
  ): Promise<string> {
    const name = requireName(input.name, "a generic item's name");
    const category = requireName(input.category, "a generic item's category");
    if (!isGenericItemKind(input.kind)) {
      throw new ValidationError(
        `generic item kind must be one of ${GENERIC_ITEM_KINDS.join("|")}, got ${input.kind}`,
      );
    }

    const key = genericKey(name, category);
    const memoized = memo.get(key);
    if (memoized !== undefined) return memoized;

    const found = await this.#findGenericItem(name, category);
    if (found !== null) {
      memo.set(key, found);
      return found;
    }

    const newId = randomUUID();
    try {
      const created = await this.#ensureGenericItem(ctx, newId, {
        ...input,
        name,
        category,
      });
      memo.set(key, created.id);
      return created.id;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      // Someone else created `(name, category)` between the find and the
      // create — `idx_generic_items_name_category` is the tripwire. Converge
      // on the winner, exactly as `BrandRegistryActor.resolve` does.
      const winner = await this.#findGenericItem(name, category);
      if (winner === null) throw error;
      memo.set(key, winner);
      return winner;
    }
  }

  async #findGenericItem(
    name: string,
    category: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ id: genericItems.id })
      .from(genericItems)
      .where(
        and(eq(genericItems.name, name), eq(genericItems.category, category)),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /* ---------------------------------------------------------------------- */
  /* Instructions                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Creator only, and the same full-replacement contract as `setIngredients`.
   * `step_number` is the 1-based array index rather than a caller-supplied
   * value, which is what makes `recipe_instructions_recipe_id_step_number_key`
   * unhittable — today's API lets a client write two step 3s in two mutations.
   */
  async setInstructions(
    ctx: Ctx,
    input: SetRecipeInstructionsInput,
  ): Promise<readonly RecipeInstructionDto[]> {
    const aggregate = this.requireAggregate();
    this.#requireCreator(ctx, aggregate, "set its instructions");

    const values = input.instructions.map((instruction, index) => ({
      id: randomUUID(),
      recipeId: this.key,
      stepNumber: index + 1,
      instructionText: requireName(
        instruction.instructionText,
        "an instruction's text",
      ),
      instructionType: requireInstructionType(instruction.instructionType),
      equipmentNeeded: instruction.equipmentNeeded ?? null,
      timeMinutes: requirePositiveOrNull(
        instruction.timeMinutes ?? null,
        "timeMinutes",
      ),
    }));

    const changed =
      instructionSignature(
        aggregate.instructions.map((row) => ({
          stepNumber: row.stepNumber,
          instructionText: row.instructionText,
          instructionType: row.instructionType as InstructionType | null,
        })),
      ) !== instructionSignature(values);

    await this.tx(async (tx) => {
      await tx
        .delete(recipeInstructions)
        .where(eq(recipeInstructions.recipeId, this.key));
      if (values.length > 0) {
        await tx.insert(recipeInstructions).values(values);
      }
      await tx
        .update(recipes)
        .set({ updatedAt: new Date() })
        .where(eq(recipes.id, this.key));
      if (changed) await this.#enqueueRegenerate(tx, "setInstructions", ctx);
    });

    await this.reload();
    return this.requireAggregate().instructions.map(instructionRowToDto);
  }

  /* ---------------------------------------------------------------------- */
  /* Reviews — the `recipe_reviews` half of target-stack §7's gap            */
  /* ---------------------------------------------------------------------- */

  /**
   * Any signed-in user. One review per person per recipe is a database fact
   * (`recipe_reviews_unique_user_recipe`), so a second `addReview` from the
   * same viewer is a `ConflictError` naming `updateReview` rather than a
   * silent overwrite — the caller's intent ("add") and the outcome ("replace")
   * are different things.
   *
   * Idempotent on `input.reviewId` (§8.4): the same id twice returns the first
   * row.
   */
  async addReview(
    ctx: Ctx,
    input: AddRecipeReviewInput,
  ): Promise<RecipeReviewDto> {
    const aggregate = this.requireAggregate();
    const userId = requireViewer(ctx, "review a recipe");

    const reviewId = requireUuid(input.reviewId ?? randomUUID(), "reviewId");
    const byId = aggregate.reviews.find((row) => row.id === reviewId);
    if (byId !== undefined) return reviewRowToDto(byId);

    const mine = aggregate.reviews.find((row) => row.userId === userId);
    if (mine !== undefined) {
      throw new ConflictError(
        `you already reviewed recipe ${this.key} (review ${mine.id}); ` +
          "use updateReview to change it",
        "REVIEW_ALREADY_EXISTS",
      );
    }

    const score = requireScore(input.score);
    await this.tx(async (tx) => {
      await tx
        .insert(recipeReviews)
        .values({
          id: reviewId,
          recipeId: this.key,
          userId,
          score,
          text: input.text ?? null,
        })
        .onConflictDoNothing({ target: recipeReviews.id });
    });

    await this.reload();
    const written = this.requireAggregate().reviews.find(
      (row) => row.id === reviewId,
    );
    if (written === undefined) {
      throw new ConflictError(`recipe review ${reviewId} was not written`);
    }
    return reviewRowToDto(written);
  }

  /**
   * **Author only.** There was no rule here before (target-stack §7) — this
   * is the one B6 chose, matching `ItemActor.updateReview` exactly.
   */
  async updateReview(
    ctx: Ctx,
    reviewId: string,
    input: UpdateRecipeReviewInput,
  ): Promise<RecipeReviewDto> {
    reviewId = requireUuid(reviewId, "reviewId");
    const aggregate = this.requireAggregate();
    const row = aggregate.reviews.find((review) => review.id === reviewId);
    if (row === undefined) {
      throw new NotFoundError(
        `review ${reviewId} is not on recipe ${this.key}`,
      );
    }
    if (!isOwner(ctx, row.userId)) {
      throw new ForbiddenError(
        `review ${reviewId} is not yours`,
        "NOT_REVIEW_AUTHOR",
      );
    }

    const patch: { score?: number | null; text?: string | null } = {};
    if (input.score !== undefined) patch.score = requireScore(input.score);
    if (input.text !== undefined) patch.text = input.text;
    if (Object.keys(patch).length === 0) return reviewRowToDto(row);

    await this.tx(async (tx) => {
      await tx
        .update(recipeReviews)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(recipeReviews.id, reviewId));
    });
    await this.reload();
    const updated = this.requireAggregate().reviews.find(
      (review) => review.id === reviewId,
    );
    if (updated === undefined) {
      throw new ConflictError(`review ${reviewId} vanished mid-update`);
    }
    return reviewRowToDto(updated);
  }

  /** **Author only** — the other half of the §7 gap. */
  async deleteReview(ctx: Ctx, reviewId: string): Promise<DeletedRecipeReview> {
    reviewId = requireUuid(reviewId, "reviewId");
    const aggregate = this.requireAggregate();
    const row = aggregate.reviews.find((review) => review.id === reviewId);
    if (row === undefined) {
      throw new NotFoundError(
        `review ${reviewId} is not on recipe ${this.key}`,
      );
    }
    if (!isOwner(ctx, row.userId)) {
      throw new ForbiddenError(
        `review ${reviewId} is not yours`,
        "NOT_REVIEW_AUTHOR",
      );
    }

    await this.tx(async (tx) => {
      await tx.delete(recipeReviews).where(eq(recipeReviews.id, reviewId));
    });
    await this.reload();
    return { id: reviewId };
  }

  /* ---------------------------------------------------------------------- */
  /* Deleting the recipe                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * **Creator only** (A7d item 7). B6 flagged this method's absence; D6
   * cleaned its smoke rows with `psql` for want of it.
   *
   * `TierListActor.delete`'s shape, not `CellarActor.delete`'s, because the
   * children are bounded: `recipe_ingredients`, `recipe_instructions`,
   * `recipe_reviews`, `recipe_vectors` and `recipe_votes` all cascade from
   * `recipes`, so one statement removes a recipe and everything hanging off
   * it. §1.5's "no unbounded read" is satisfied by the row count being a
   * recipe's worth, not a user's.
   *
   * Two pointers, handled differently on purpose:
   *
   *   1. `recipes.canonical_recipe_id` is a self-FK with **no `ON DELETE`**
   *      (`recipes_canonical_recipe_id_recipes_id_fkey`), so a sibling naming
   *      this recipe would abort the delete with a raw Postgres FK violation —
   *      a 500, not a typed error. `RecipeActor` is `recipes`' single writer,
   *      so it clears those itself, in the same transaction.
   *   2. `recipe_groups.canonical_recipe_id` is `ON DELETE SET NULL`, so the
   *      database clears it — but *picking the next winner* reads votes and
   *      writes `recipe_groups`, which is `RecipeGroupActor`'s table. That is
   *      an **outbox** row (`recomputeCanonical`), not a second synchronous
   *      call: §8.5 has no `RecipeActor → RecipeGroupActor` edge, and a
   *      delete that fails because a *different* actor was busy would be the
   *      wrong failure.
   *
   * The outbox row is enqueued only when the recipe actually had a group. An
   * ungrouped recipe has nothing to recompute.
   */
  async delete(ctx: Ctx): Promise<DeletedRecipe> {
    const aggregate = this.requireAggregate();
    this.#requireCreator(ctx, aggregate, "delete a recipe");
    const groupId = aggregate.recipe.recipeGroupId;

    await this.tx(async (tx) => {
      await tx
        .update(recipes)
        .set({ canonicalRecipeId: null })
        .where(eq(recipes.canonicalRecipeId, this.key));
      await tx.delete(recipes).where(eq(recipes.id, this.key));
      if (groupId !== null) {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["RecipeGroupActor.recomputeCanonical"],
          {
            targetId: groupId,
            payload: { reason: "member deleted", recipeId: this.key },
          },
          { attributeTo: ctx },
        );
      }
    });

    // The activation outlives the row, and Dapr will route the next call for
    // this id here. `null` makes `requireAggregate()` raise `NotFoundError`,
    // which is what a caller asking for a deleted recipe should get.
    this.setAggregate(null);
    return { id: this.key };
  }

  /* ---------------------------------------------------------------------- */
  /* Vector                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * `system`, via the outbox (§2.1, §5). Replaces the `generate_recipe_vector`
   * Hasura event trigger on `recipes`.
   *
   * **Idempotent without an idempotency key** (§8.4's "naturally idempotent"
   * branch): a delivery whose vector is already newer than everything the
   * embedding text is built from returns `skipped` *before* calling the model,
   * so a redelivery costs a `SELECT` rather than an embedding. "Everything"
   * includes the owning group's `updated_at` — see the module doc for why that
   * is load-bearing and not belt-and-braces.
   */
  async regenerateVector(
    ctx: Ctx,
    _payload: Record<string, unknown> = {},
  ): Promise<RegenerateRecipeVectorResult> {
    const aggregate = this.requireAggregate();
    requirePrivileged(
      ctx,
      `only a system or admin caller may regenerate the vector of recipe ${this.key}`,
    );

    const { recipe, vector } = aggregate;
    // Fresh, not cached — see `RecipeAggregate`'s doc.
    const group = await this.#readGroup(recipe.recipeGroupId);
    // A recipe has no image source to embed — `recipes.image_url` is a free
    // URL, not a file (and null on every row today) — and legacy embedded
    // recipes as text alone, so the image set is always `none`.
    const model = embeddingModel();
    const outcome = await regenerateIfStale(
      vector,
      [recipe.updatedAt, group?.updatedAt],
      {
        embed: async () => {
          const text = await this.#embeddingText(aggregate, group);
          return {
            text,
            embedded: await this.#embed(ctx, { text, imageFileIds: [] }),
          };
        },
        // An upsert on `recipe_vectors_one_per_recipe`'s unique `recipe_id`,
        // for the reason `ItemActor.regenerateVector` gives: a double insert
        // from two activations overwrites instead of failing. `updated_at` is
        // the database's clock, like the inputs it is compared against.
        write: ({ text, embedded }) =>
          this.tx(async (tx) => {
            const identity = {
              vector: halfvec(embedded.vector),
              embeddingText: text,
              updatedAt: sql`now()`,
              embeddingModel: embedded.model,
              embeddingImages: NO_IMAGES,
            };
            await tx
              .insert(recipeVectors)
              .values({ recipeId: this.key, ...identity })
              .onConflictDoUpdate({
                target: recipeVectors.recipeId,
                set: identity,
              });
          }),
      },
      model === null ? null : { model: model.key, images: NO_IMAGES },
    );
    if (outcome === "fresh") {
      return {
        recipeId: this.key,
        skipped: true,
        reason: "vector is newer than the recipe and its group",
      };
    }

    await this.reload();
    return {
      recipeId: this.key,
      skipped: false,
      reason:
        outcome === "first vector"
          ? "first vector"
          : outcome === "embedding changed"
            ? "embedding changed"
            : "recipe or group changed",
    };
  }

  /**
   * A lean port of `functions/generateRecipeVector/_embedding-generator.ts`:
   * the same inputs in the same order, minus that file's keyword-expansion
   * tables. Ingredient **names** are read here rather than held on the
   * aggregate — they live in seven other tables and only this method needs
   * them, so paying for the reads once per regeneration beats paying on every
   * activation.
   */
  async #embeddingText(
    aggregate: RecipeAggregate,
    group: OwningGroup | null,
  ): Promise<string> {
    const parts: string[] = [aggregate.recipe.name, "recipe", "how to make"];
    if (aggregate.recipe.type === "cocktail") {
      parts.push("drink recipe", "cocktail recipe");
    } else if (aggregate.recipe.type === "food") {
      parts.push("food recipe", "dish recipe");
    }
    if (aggregate.recipe.description !== null) {
      parts.push(aggregate.recipe.description);
    }
    parts.push(aggregate.recipe.type);

    if (group !== null) {
      parts.push(group.name);
      if (group.description !== null) parts.push(group.description);
      parts.push(group.category);
      if (group.baseSpirit !== null) parts.push(group.baseSpirit);
      parts.push(...group.tags);
    }

    parts.push(...(await this.#ingredientNames(aggregate.ingredients)));
    if (aggregate.ingredients.some((row) => row.isOptional === true)) {
      parts.push("optional ingredient");
    }

    for (const instruction of aggregate.instructions) {
      parts.push(instruction.instructionText);
      if (instruction.instructionType !== null) {
        parts.push(instruction.instructionType);
      }
    }

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const part of parts) {
      const trimmed = String(part).trim();
      if (trimmed === "") continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      unique.push(trimmed);
    }
    return unique.join(" ").replace(/\s+/g, " ").trim();
  }

  /** One `select` per referenced table, skipped for a table with no ingredient. */
  async #ingredientNames(
    ingredients: readonly RecipeIngredientRow[],
  ): Promise<string[]> {
    const byType = new Map<RecipeIngredientType, string[]>();
    for (const row of ingredients) {
      const ref = ingredientRefOf(row);
      const ids = byType.get(ref.type) ?? [];
      ids.push(ref.id);
      byType.set(ref.type, ids);
    }

    const names: string[] = [];
    for (const [type, ids] of byType) {
      const table = type === "GENERIC" ? genericItems : ITEM_TABLES[type];
      const rows = await this.db
        .select({ name: table.name })
        .from(table)
        .where(inArray(table.id, ids));
      for (const row of rows) names.push(row.name);
    }
    return names;
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /** Inside a transaction: the §1.4 shape, write and follow-up together. */
  async #enqueueRegenerate(
    tx: DbOrTx,
    reason: string,
    ctx: Ctx,
  ): Promise<void> {
    await enqueueOutbox(
      tx,
      OUTBOX_TARGETS["RecipeActor.regenerateVector"],
      {
        targetId: this.key,
        // §1.4 / §1.7: an outbox payload is a `Record<string, unknown>`, never a
        // bare scalar — `OutboxActor.deliver` invokes `method(systemCtx, payload)`.
        payload: { reason },
      },
      { attributeTo: ctx },
    );
  }

  #toDto(aggregate: RecipeAggregate): RecipeDto {
    const row = aggregate.recipe;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: requireRecipeType(row.type),
      createdById: row.createdById,
      recipeGroupId: row.recipeGroupId,
      canonicalRecipeId: row.canonicalRecipeId,
      difficultyLevel: row.difficultyLevel,
      prepTimeMinutes: row.prepTimeMinutes,
      servingSize: row.servingSize,
      imageUrl: row.imageUrl,
      version: row.version ?? 1,
      // §6 B6: what replaces the `recipe_summary` view.
      ingredientCount: aggregate.ingredients.length,
      instructionCount: aggregate.instructions.length,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }
}
