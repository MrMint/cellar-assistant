/**
 * The recipe aggregates as `services/api` sees them (migration plan §2.1
 * `RecipeActor` / `RecipeGroupActor`, workstream B6).
 *
 * Two actors, seven tables:
 *
 * - **`RecipeActor(recipeId)`** owns `recipes`, `recipe_ingredients`,
 *   `recipe_instructions`, `recipe_vectors`, `recipe_reviews`;
 * - **`RecipeGroupActor(groupId)`** owns `recipe_groups` and `recipe_votes`.
 *
 * A *group* is one drink ("Negroni"); a *recipe* is one version of it. Votes
 * are cast on a recipe but counted by the group, because what they decide is
 * the group's `canonical_recipe_id` — which is why `recipe_votes` belongs to
 * `RecipeGroupActor` and not to `RecipeActor` (§3's table→writer map says so
 * outright, and §2.1's "`vote` … recomputes `canonical_recipe_id` and `name`
 * in-turn" is the reason).
 *
 * ## `recipe_reviews` and `recipe_votes` had no rule at all
 *
 * `target-stack.md` §7 lists it among the live authorization holes: both
 * tables are absent from Hasura's metadata except as bare table
 * declarations — no insert, select, update or delete permission for any
 * role. What that produces is not an open door but a *dead feature*. Hasura
 * generates root fields only for tables a role can reach, so on the legacy
 * stack `recipe_reviews` and `recipe_votes` have none at all for role
 * `user`, and every call fails GraphQL validation before it reaches a
 * permission check: `field 'insert_recipe_reviews_one' not found in type:
 * 'mutation_root'`. Reviewing and voting on recipes has simply never worked
 * there.
 *
 * An earlier version of this comment said the server actions that write
 * these tables "do so with the admin secret". They do not, and the
 * difference is the whole point: `src/app/actions/recipes.ts` on `main`
 * imports `serverMutation` and nothing else — the caller's own JWT — so a
 * missing permission fails *closed*. Had it used the admin secret, a table
 * with no permissions would have been reachable by anyone. (Checked against
 * the running legacy Hasura, 2026-09-19: both root fields are absent for
 * role `user`.)
 *
 * So there was no *existing* rule to preserve, only one to choose. B6 chose the
 * one B2 applied to `item_reviews`, because it is the same kind of row:
 *
 *   - **insert** — any signed-in user (anonymous refused);
 *   - **update / delete** — the author only (`user_id`), plus admin/system;
 *   - **select** — any signed-in user, like every other catalog read here.
 *
 * `recipe_reviews` additionally carries `recipe_reviews_unique_user_recipe`
 * `(recipe_id, user_id)`, so "one review per person per recipe" is a database
 * fact, not a convention; `addReview` surfaces a second one as a
 * `ConflictError` naming `updateReview` rather than silently overwriting.
 * `recipe_votes` has the matching `(recipe_id, user_id)` unique constraint,
 * and `vote` is an upsert on it — changing your mind is the same call.
 *
 * ## Visibility: the catalog rule, not the four-branch one
 *
 * Neither actor has a `Visibility:` line in §2.1 and neither table carries a
 * `permission_type` column, so the four-branch rule has nothing to read.
 * Today's Hasura `select` filter on `recipes` and `recipe_groups` is `{}` for
 * the `user` role — every signed-in user, nobody else — which is exactly the
 * catalog rule B3 settled for `BrandActor` and B2 reused for `ItemActor`.
 * B6 applies it unchanged: **any signed-in viewer; anonymous refused.**
 *
 * ## Ingredients: six item types, plus a generic item, and `ItemActor` owns
 * both
 *
 * `recipe_ingredients` carries a seven-column polymorphic FK under
 * `CHECK (num_nonnulls(...) = 1)` — the six item tables plus `generic_items`.
 * B2 settled that a generic item **is not an `Item`** (no images, no vector,
 * no reviews, no brands, cannot be favourited, cannot sit in a cellar) and
 * that `ItemActor` is nonetheless its single writer, under the `generic:` key
 * prefix. `recipe_ingredients` is `generic_items`' only referent in the whole
 * schema, which makes this file the one place the two halves meet.
 *
 * The consequence for `RecipeActor.setIngredients` is the whole of §1.2: an
 * ingredient that needs a `generic_items` row that does not exist yet is
 * created by **calling `ItemActor(generic:<id>).createGeneric`**, never by
 * inserting the row here. `packages/db/src/writers.test.ts` is what proves it.
 *
 * **These DTOs are the wire shape, not the row shape.** `timestamptz` crosses
 * as an ISO-8601 string, `numeric` as a number. Note which timestamps are
 * nullable: `recipes`, `recipe_groups`, `recipe_ingredients` and
 * `recipe_instructions` all have `created_at`/`updated_at` **without**
 * `NOT NULL` (introspected, not hand-written), while `recipe_reviews` has both
 * `NOT NULL`. So only `RecipeReviewDto`'s two timestamps are bare strings.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { InstructionType, RecipeCategory } from "./enums.ts";
import { ValidationError } from "./errors.ts";
import {
  type CreateGenericItemInput,
  ITEM_TYPES,
  type ItemType,
  isItemType,
} from "./items.ts";
import type { Page, PageArgs } from "./page.ts";

/* -------------------------------------------------------------------------- */
/* Small closed sets that are `text` + CHECK in the database, not `pgEnum`      */
/* -------------------------------------------------------------------------- */

/**
 * `recipes_type_check`: `type = ANY (ARRAY['food', 'cocktail'])`. A `text`
 * column with a check constraint, deliberately left alone by §4's transform —
 * listed alphabetically here, the ordering convention every other enum in
 * `enums.ts` follows.
 */
export const RECIPE_TYPES = ["cocktail", "food"] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export const isRecipeType = (value: string): value is RecipeType =>
  (RECIPE_TYPES as readonly string[]).includes(value);

/** `recipe_votes_vote_type_check`: `vote_type = ANY (ARRAY['upvote', 'downvote'])`. */
export const RECIPE_VOTE_TYPES = ["downvote", "upvote"] as const;
export type RecipeVoteType = (typeof RECIPE_VOTE_TYPES)[number];

export const isRecipeVoteType = (value: string): value is RecipeVoteType =>
  (RECIPE_VOTE_TYPES as readonly string[]).includes(value);

/** What one vote is worth when the canonical recipe is recomputed. */
export const voteWeight = (voteType: RecipeVoteType): number =>
  voteType === "upvote" ? 1 : -1;

/* -------------------------------------------------------------------------- */
/* Ingredient references — `ItemRef`, widened by one                           */
/* -------------------------------------------------------------------------- */

/**
 * `ItemType` plus `"GENERIC"` — exactly the seven values
 * `recipe_ingredients`' `CHECK (num_nonnulls(beer_id, wine_id, spirit_id,
 * coffee_id, sake_id, tea_id, generic_item_id) = 1)` allows.
 *
 * Shaped like B7's `TierListEntryType` (`ItemType` plus `"PLACE"`) and for
 * the same reason: the extra case is a real row in a real table that the
 * `item_type` enum cannot name, so modelling it away would mean lying about
 * the schema.
 */
export const RECIPE_INGREDIENT_TYPES = [
  "GENERIC",
  ...ITEM_TYPES,
] as const satisfies readonly [string, ...ItemType[]];

export type RecipeIngredientType = (typeof RECIPE_INGREDIENT_TYPES)[number];

export const isRecipeIngredientType = (
  value: string,
): value is RecipeIngredientType =>
  (RECIPE_INGREDIENT_TYPES as readonly string[]).includes(value);

/** Whether this ingredient points at `generic_items` rather than an item table. */
export const isGenericIngredient = (
  ref: RecipeIngredientRef,
): ref is { readonly type: "GENERIC"; readonly id: string } =>
  ref.type === "GENERIC";

/** A typed reference to whatever one `recipe_ingredients` row points at. */
export type RecipeIngredientRef = {
  readonly type: RecipeIngredientType;
  readonly id: string;
};

/**
 * Narrow a `RecipeIngredientRef` to the six-type `ItemRef` space, or `null`
 * for a generic item. The one conversion `services/api` needs to hand an
 * ingredient to the `Item` DataLoader.
 */
export const ingredientItemType = (
  ref: RecipeIngredientRef,
): ItemType | null => (isItemType(ref.type) ? ref.type : null);

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type RecipeDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: RecipeType;
  /** Nullable and `ON DELETE SET NULL` — unlike the six item tables' creator. */
  readonly createdById: string | null;
  readonly recipeGroupId: string | null;
  /** `recipes.canonical_recipe_id`, a self-FK. Not the group's copy. */
  readonly canonicalRecipeId: string | null;
  /** `recipes_difficulty_level_check`: 1-5, or null. */
  readonly difficultyLevel: number | null;
  readonly prepTimeMinutes: number | null;
  readonly servingSize: number | null;
  readonly imageUrl: string | null;
  readonly version: number;
  /**
   * §6 B6: "`recipe_summary` view replaced by `ingredientCount` on the type".
   * Cheap — `loadAggregate` already reads every ingredient row on activate.
   */
  readonly ingredientCount: number;
  readonly instructionCount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export type RecipeIngredientDto = {
  readonly id: string;
  readonly recipeId: string;
  /** Which of the seven FK columns is set, and what it points at. */
  readonly ref: RecipeIngredientRef;
  /** `numeric` in Postgres; a number here. */
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly isOptional: boolean;
  readonly substitutionNotes: string | null;
  readonly createdAt: string | null;
};

export type RecipeInstructionDto = {
  readonly id: string;
  readonly recipeId: string;
  /** 1-based, and unique per recipe (`recipe_instructions_recipe_id_step_number_key`). */
  readonly stepNumber: number;
  readonly instructionText: string;
  readonly instructionType: InstructionType | null;
  readonly equipmentNeeded: string | null;
  readonly timeMinutes: number | null;
  readonly createdAt: string | null;
};

/**
 * One `recipe_reviews` row. `text` is a plain `text` column here — unlike
 * `item_reviews.text`, which is `json` (B2's report flags that asymmetry for
 * E1); nothing needs to parse it.
 */
export type RecipeReviewDto = {
  readonly id: string;
  readonly recipeId: string;
  readonly userId: string;
  /** `recipe_reviews_score_range`: a half-star from 0.5 to 5, or null. */
  readonly score: number | null;
  readonly text: string | null;
  /** `NOT NULL` in this table, unlike every other timestamp in this module. */
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RecipeScoreDto = {
  /** `null` with no scored reviews — not 0, which reads as "everyone hated it". */
  readonly average: number | null;
  readonly count: number;
};

export type DeletedRecipeReview = { readonly id: string };

export type DeletedRecipe = { readonly id: string };

export type DeletedRecipeGroup = { readonly id: string };

/**
 * One recipe's vote tally, plus *this viewer's* own vote (A7d item 4).
 *
 * `RecipeVersions` used to page `RecipeGroup.votes` 100 rows at a time and
 * tally in the browser, because `netScore` existed only on `RecipeVotePayload`
 * — the answer to a vote you had just cast. Fine at tens of votes, wrong at
 * thousands, and the page cap made it *silently* wrong rather than slow.
 *
 * `upvotes`/`downvotes` are here as well as `netScore` because a net of 0
 * cannot distinguish "nobody voted" from "ten each way", and a versions list
 * shows both differently.
 */
export type RecipeVoteSummaryDto = {
  readonly recipeId: string;
  readonly upvotes: number;
  readonly downvotes: number;
  /** `upvotes - downvotes`. */
  readonly netScore: number;
  /** The calling viewer's own vote, or `null` — including for anonymous. */
  readonly myVote: RecipeVoteType | null;
};

export type RecipeGroupDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: RecipeCategory;
  readonly baseSpirit: string | null;
  readonly tags: readonly string[];
  readonly imageUrl: string | null;
  readonly createdById: string | null;
  /** Recomputed in-turn by `vote`; `null` until a group has recipes and votes. */
  readonly canonicalRecipeId: string | null;
  readonly recipeCount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export type RecipeVoteDto = {
  readonly id: string;
  readonly recipeId: string;
  readonly userId: string;
  readonly voteType: RecipeVoteType;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/** What `vote` returns: the vote, plus what it did to the group. */
export type RecipeVoteResult = {
  readonly vote: RecipeVoteDto;
  readonly group: RecipeGroupDto;
  /** Net score of the voted-on recipe after the vote (upvotes − downvotes). */
  readonly netScore: number;
  /** Whether this call moved `canonical_recipe_id`. */
  readonly canonicalChanged: boolean;
};

/** What `removeVote` returns: the row it withdrew, and what that did. */
export type RemovedRecipeVote = {
  readonly recipeId: string;
  readonly userId: string;
  readonly canonicalChanged: boolean;
};

export type RegenerateRecipeVectorResult = {
  readonly recipeId: string;
  readonly skipped: boolean;
  readonly reason: string;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateRecipeInput = {
  readonly name: string;
  readonly type: RecipeType;
  readonly description?: string | null;
  readonly recipeGroupId?: string | null;
  readonly difficultyLevel?: number | null;
  readonly prepTimeMinutes?: number | null;
  readonly servingSize?: number | null;
  readonly imageUrl?: string | null;
};

export type UpdateRecipeInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly type?: RecipeType;
  readonly recipeGroupId?: string | null;
  readonly difficultyLevel?: number | null;
  readonly prepTimeMinutes?: number | null;
  readonly servingSize?: number | null;
  readonly imageUrl?: string | null;
};

/**
 * One ingredient, as `setIngredients` takes it. **Exactly one** of `ref` and
 * `newGenericItem` must be set — the input-level mirror of the table's own
 * `exactly_one_item_reference` check, which GraphQL cannot express as an
 * input union.
 *
 * `newGenericItem` is find-or-create by `(name, category)`: `RecipeActor`
 * looks for an existing `generic_items` row and otherwise calls
 * `ItemActor(generic:<newId>).createGeneric`. It never writes the row itself
 * (§1.2 — `generic_items`' writer is `ItemActor`).
 */
export type RecipeIngredientInput = {
  readonly ref?: RecipeIngredientRef | null;
  readonly newGenericItem?: NewGenericIngredientInput | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly isOptional?: boolean | null;
  readonly substitutionNotes?: string | null;
};

/** `CreateGenericItemInput` (B2), re-exported under the name this file uses. */
export type NewGenericIngredientInput = CreateGenericItemInput;

export type SetRecipeIngredientsInput = {
  /** The recipe's complete ingredient list. An empty array clears it. */
  readonly ingredients: readonly RecipeIngredientInput[];
};

export type RecipeInstructionInput = {
  readonly instructionText: string;
  readonly instructionType?: InstructionType | null;
  readonly equipmentNeeded?: string | null;
  readonly timeMinutes?: number | null;
};

export type SetRecipeInstructionsInput = {
  /**
   * The recipe's complete, ordered instruction list. `step_number` is the
   * 1-based array index — callers never supply it, which is what makes the
   * `(recipe_id, step_number)` unique constraint unhittable.
   */
  readonly instructions: readonly RecipeInstructionInput[];
};

export type AddRecipeReviewInput = {
  readonly score?: number | null;
  readonly text?: string | null;
  /** Mint it to make the call idempotent (§8.4). */
  readonly reviewId?: string | null;
};

export type UpdateRecipeReviewInput = {
  readonly score?: number | null;
  readonly text?: string | null;
};

export type CreateRecipeGroupInput = {
  readonly name: string;
  readonly category: RecipeCategory;
  readonly description?: string | null;
  readonly baseSpirit?: string | null;
  readonly tags?: readonly string[] | null;
  readonly imageUrl?: string | null;
};

export type UpdateRecipeGroupInput = {
  readonly name?: string;
  readonly category?: RecipeCategory;
  readonly description?: string | null;
  readonly baseSpirit?: string | null;
  readonly tags?: readonly string[] | null;
  readonly imageUrl?: string | null;
};

export type VoteOnRecipeInput = {
  readonly recipeId: string;
  readonly voteType: RecipeVoteType;
};

/* -------------------------------------------------------------------------- */
/* Validation shared by the actor and `services/api`'s argument marshalling        */
/* -------------------------------------------------------------------------- */

/**
 * `exactly_one_item_reference`, checked before Postgres sees it — a check
 * violation is a 500-shaped surprise, and "give me either an existing
 * reference or a new generic item, not both" is something a client can act on.
 */
export const requireOneIngredientSource = (
  input: RecipeIngredientInput,
): void => {
  const hasRef = input.ref !== undefined && input.ref !== null;
  const hasNew =
    input.newGenericItem !== undefined && input.newGenericItem !== null;
  if (hasRef === hasNew) {
    throw new ValidationError(
      "each ingredient needs exactly one of `ref` (an existing item or " +
        "generic item) or `newGenericItem` (find-or-create through " +
        `ItemActor); got ${hasRef ? "both" : "neither"}`,
    );
  }
};

/* -------------------------------------------------------------------------- */
/* Actor interfaces                                                            */
/* -------------------------------------------------------------------------- */

export type RecipeActorInterface = {
  get(ctx: Ctx): Promise<RecipeDto>;
  ingredients(ctx: Ctx, page: PageArgs): Promise<Page<RecipeIngredientDto>>;
  instructions(ctx: Ctx, page: PageArgs): Promise<Page<RecipeInstructionDto>>;
  reviews(ctx: Ctx, page: PageArgs): Promise<Page<RecipeReviewDto>>;
  /** Computed in memory from the loaded reviews; replaces `_aggregate` (§2.1). */
  score(ctx: Ctx): Promise<RecipeScoreDto>;

  /** Provisional-id pattern: the caller mints the id and addresses the actor by it. */
  create(ctx: Ctx, input: CreateRecipeInput): Promise<RecipeDto>;
  /** Creator only. */
  update(ctx: Ctx, input: UpdateRecipeInput): Promise<RecipeDto>;
  /** Creator only. Replaces the whole list in one transaction. */
  setIngredients(
    ctx: Ctx,
    input: SetRecipeIngredientsInput,
  ): Promise<readonly RecipeIngredientDto[]>;
  /** Creator only. Replaces the whole list; `step_number` is the array index. */
  setInstructions(
    ctx: Ctx,
    input: SetRecipeInstructionsInput,
  ): Promise<readonly RecipeInstructionDto[]>;

  /** Any signed-in user; one review per person (a unique constraint). */
  addReview(ctx: Ctx, input: AddRecipeReviewInput): Promise<RecipeReviewDto>;
  /** Author only — the `recipe_reviews` half of the §7 authorization gap. */
  updateReview(
    ctx: Ctx,
    reviewId: string,
    input: UpdateRecipeReviewInput,
  ): Promise<RecipeReviewDto>;
  /** Author only. */
  deleteReview(ctx: Ctx, reviewId: string): Promise<DeletedRecipeReview>;

  /**
   * Creator only (A7d item 7). One statement: every child of `recipes` is
   * `ON DELETE CASCADE`, so ingredients, instructions, reviews, votes and the
   * vector go with it — bounded, unlike `CellarActor.delete`'s `RESTRICT`ed
   * children, so this is the `TierListActor.delete` shape rather than the
   * refuse-if-non-empty one.
   *
   * Two pointers need handling and neither is a cross-writer write:
   *
   *   - `recipes.canonical_recipe_id` is a **self**-FK with no `ON DELETE`, so
   *     a sibling naming this recipe as canonical would raise a raw FK
   *     violation. `RecipeActor` owns `recipes`, so it nulls those in the same
   *     transaction.
   *   - `recipe_groups.canonical_recipe_id` is `ON DELETE SET NULL`, so the
   *     database clears it — but the *winner* then has to be recomputed, and
   *     `recipe_groups` is `RecipeGroupActor`'s table. That goes through the
   *     **outbox** (`recomputeCanonical`), not a second synchronous call.
   */
  delete(ctx: Ctx): Promise<DeletedRecipe>;

  /**
   * `system`, via the outbox (§5: `generateRecipeVector` → here). Naturally
   * idempotent: a delivery whose vector is already newer than everything it
   * embeds skips before calling the model, so a redelivery costs a `SELECT`.
   */
  regenerateVector(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<RegenerateRecipeVectorResult>;
};

export const RecipeActorDescriptor: ActorDescriptor<RecipeActorInterface> = {
  actorType: "RecipeActor",
  category: "entity",
  // The recipe-photo job's writes always waited 20s; the API waited its 15s
  // default for the same writes. Every write here enqueues the recipe's
  // `regenerateVector` (an embedding), directly or through its group.
  methods: {
    get: {},
    ingredients: {},
    instructions: {},
    reviews: {},
    score: {},
    create: { timeoutMs: 20_000, modelBacked: true },
    update: { modelBacked: true },
    setIngredients: { timeoutMs: 20_000, modelBacked: true },
    setInstructions: { timeoutMs: 20_000, modelBacked: true },
    addReview: {},
    updateReview: {},
    deleteReview: {},
    delete: { modelBacked: true },
    // An embedding through `EmbeddingActor.embedDocument` (90s), plus the
    // turn around it — `ItemActorDescriptor`'s number, for the same call.
    regenerateVector: { timeoutMs: 100_000 },
  },
};

export type RecipeGroupActorInterface = {
  get(ctx: Ctx): Promise<RecipeGroupDto>;
  /** Recipe ids, hydrated by `services/api`'s `Recipe` DataLoader (§1.5). */
  recipes(ctx: Ctx, page: PageArgs): Promise<Page<string>>;
  votes(ctx: Ctx, page: PageArgs): Promise<Page<RecipeVoteDto>>;

  create(ctx: Ctx, input: CreateRecipeGroupInput): Promise<RecipeGroupDto>;
  /** Creator only — today's `recipe_groups` update filter, verbatim. */
  update(ctx: Ctx, input: UpdateRecipeGroupInput): Promise<RecipeGroupDto>;

  /**
   * Any signed-in user, one vote per person per recipe (upsert on the unique
   * constraint). Recomputes `canonical_recipe_id` and `name` **in-turn**,
   * replacing the `update_canonical_recipe` PL/pgSQL trigger (§2.1, §3).
   */
  vote(ctx: Ctx, input: VoteOnRecipeInput): Promise<RecipeVoteResult>;

  /**
   * Withdraw **your own** vote. Not in §2.1; added because §7's gap covers
   * deleting a vote as much as casting one. Keyed `(recipeId, ctx.viewerId)`,
   * so there is no argument by which another user's vote could be named.
   */
  removeVote(ctx: Ctx, recipeId: string): Promise<RemovedRecipeVote>;

  /**
   * Vote tallies for the named members, plus the caller's own vote (A7d item
   * 4). Unknown or non-member ids are **omitted** rather than refused: this is
   * a read serving a batched resolver, and one stale id on a page should not
   * blank the page.
   *
   * Batched deliberately. `#snapshot()` already reads every vote for every
   * member, so answering for twenty versions costs exactly what answering for
   * one does — and `RecipeGroupActor` takes one turn at a time, so a per-recipe
   * method would have run those twenty in series.
   */
  voteSummaries(
    ctx: Ctx,
    recipeIds: readonly string[],
  ): Promise<readonly RecipeVoteSummaryDto[]>;

  /**
   * `system`, via the outbox. Re-derives `canonical_recipe_id` (and the
   * group's name) from the members and votes that exist *now*.
   *
   * Exists because `RecipeActor.delete` can remove the canonical member: the
   * FK sets the column to null, but choosing the next winner is this actor's
   * job and belongs in its own turn. Naturally idempotent — it compares the
   * recomputed winner against the stored one and writes only on a difference,
   * so a redelivery costs two `SELECT`s.
   */
  recomputeCanonical(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<RecipeGroupDto>;

  /**
   * Creator only (A7d item 7). **Refused while the group still has recipes.**
   *
   * `recipes.recipe_group_id` is `ON DELETE SET NULL`, so a permissive delete
   * would silently orphan every version of the drink — exactly the footgun
   * `CellarActor.delete` argues against, and the reason this is the cellar
   * shape rather than the tier-list one. Move or delete the versions first.
   */
  delete(ctx: Ctx): Promise<DeletedRecipeGroup>;
};

export const RecipeGroupActorDescriptor: ActorDescriptor<RecipeGroupActorInterface> =
  {
    actorType: "RecipeGroupActor",
    category: "entity",
    // As `RecipeActor`'s writes: 20s from the recipe-photo job, 15s from the
    // API, now one bound. `update` and the votes recompute the canonical
    // member, which enqueues its `regenerateVector`.
    methods: {
      get: {},
      recipes: {},
      votes: {},
      create: { timeoutMs: 20_000 },
      update: { modelBacked: true },
      vote: { modelBacked: true },
      removeVote: { modelBacked: true },
      voteSummaries: {},
      recomputeCanonical: {},
      delete: {},
    },
  };
