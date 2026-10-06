/**
 * The recipe aggregates' GraphQL surface — B6 (migration plan §2.1, §8.3).
 *
 * Every field here is one `RecipeActor` or `RecipeGroupActor` call, the shape
 * `cellar.ts` and `tier-list.ts` established: a root query names an actor id,
 * child lists are connections **on the object** (§1.5, "child lists are paged
 * from the owner"), and each mutation is an imperative command mapped onto
 * exactly one interface method.
 *
 * ## `Recipe` is loadable; `RecipeGroup.recipes` is a list of ids
 *
 * §1.5: "Collection actors return either ids or full projections … ids for
 * owned lists whose entity actors are cheap and likely warm", and "Pothos
 * resolves ids through a DataLoader that batches into parallel entity-actor
 * calls". `RecipeGroupActor.recipes` returns recipe **ids**, and `Recipe` is a
 * `loadableObject`, so a versions list is one batched fan-out rather than N
 * sequential round trips. This is the pattern `tier-list.ts` could not use for
 * `Place` (the ref has to come from `loadableObjectRef`, which meant editing
 * another workstream's file); here the type is new, so it is loadable from the
 * start.
 *
 * ## `RecipeIngredient` has two sibling reference fields, not a union
 *
 * `recipe_ingredients` points at one of six item tables **or** at
 * `generic_items` — and B2 settled that a generic item is *not* an `Item`.
 * `Item` is itself a GraphQL interface, and a union's members must be object
 * types, so `Item | GenericItem` is not expressible without re-exporting the
 * six concrete item types. The same two-sibling-field shape B7 chose for
 * `TierListItem` (`item` / `place`) is used here:
 *
 *   - `refType` — always present, the discriminator;
 *   - `item` — the `Item` interface, non-null exactly when `refType` is not
 *     `GENERIC`, resolved through `item.ts`'s DataLoader;
 *   - `genericItem` — non-null exactly when `refType` is `GENERIC`, resolved
 *     through `ItemActor`'s `generic:` key namespace.
 *
 * ## `ingredientCount` replaces a view
 *
 * §6 B6: "`recipe_summary` view replaced by `ingredientCount` on the type."
 * The view was `SELECT id, name, type, COUNT(ingredients)`; the count is now a
 * field on `Recipe`, computed in the actor from rows it already has loaded.
 */
import { randomUUID } from "node:crypto";
import type {
  AddRecipeReviewInput as AddRecipeReviewInputType,
  CreateRecipeGroupInput as CreateRecipeGroupInputType,
  CreateRecipeInput as CreateRecipeInputType,
  DeletedRecipe,
  DeletedRecipeGroup,
  DeletedRecipeReview,
  GenericItemKind,
  InstructionType,
  RecipeCategory,
  RecipeDto,
  RecipeGroupDto,
  RecipeIngredientDto,
  RecipeIngredientInput as RecipeIngredientInputType,
  RecipeIngredientType,
  RecipeInstructionDto,
  RecipeInstructionInput,
  RecipeReviewDto,
  RecipeScoreDto,
  RecipeType,
  RecipeVoteDto,
  RecipeVoteResult,
  RecipeVoteSummaryDto,
  RecipeVoteType,
  RemovedRecipeVote,
  UpdateRecipeGroupInput as UpdateRecipeGroupInputType,
  UpdateRecipeInput as UpdateRecipeInputType,
  UpdateRecipeReviewInput as UpdateRecipeReviewInputType,
} from "@cellar-assistant/contracts";
import {
  DEFAULT_RECIPE_GROUP_ORDER,
  genericItemActorId,
  ItemActorDescriptor,
  ingredientItemType,
  itemActorId,
  normalizeRecipeGroupOrder,
  normalizeRecipeGroupTerm,
  offsetPage,
  RECIPE_GROUP_ORDERS,
  RECIPE_INGREDIENT_TYPES,
  RECIPE_TYPES,
  RECIPE_VOTE_TYPES,
  RecipeActorDescriptor,
  RecipeGroupActorDescriptor,
  RecipeGroupsCollectionActorDescriptor,
  recipeGroupsCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { InstructionTypeEnum, RecipeCategoryEnum } from "./enums.ts";
import { GenericItemKindEnum, GenericItemType, ItemInterface } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

const RecipeTypeEnum = builder.enumType("RecipeType", {
  description:
    "`recipes_type_check` — a `text` column with a check constraint, not a " +
    "Postgres enum (§4 left it alone).",
  values: RECIPE_TYPES,
});

const RecipeIngredientTypeEnum = builder.enumType("RecipeIngredientType", {
  description:
    "What one `recipe_ingredients` row points at: one of the six Item types, " +
    "or GENERIC — a `generic_items` row, which is deliberately not an Item.",
  values: RECIPE_INGREDIENT_TYPES,
});

const RecipeVoteTypeEnum = builder.enumType("RecipeVoteType", {
  description: "`recipe_votes_vote_type_check`.",
  values: RECIPE_VOTE_TYPES,
});

const RecipeGroupOrderEnum = builder.enumType("RecipeGroupOrder", {
  description:
    "How `recipeGroups` is ordered. NEWEST — newest created first, ties by " +
    "id, a group with no creation time last — is the default, as the old " +
    "`/recipes` page was (UI parity #15). NAME is alphabetical, ties by id. " +
    "A cursor belongs to the order that minted it.",
  values: RECIPE_GROUP_ORDERS,
});

/* -------------------------------------------------------------------------- */
/* Satellites                                                                  */
/* -------------------------------------------------------------------------- */

const RecipeScoreType = builder
  .objectRef<RecipeScoreDto>("RecipeScore")
  .implement({
    description:
      "A recipe's rating. `average` is null with no scored reviews — not 0, " +
      "which would read as 'everyone hated it'.",
    fields: (t) => ({
      average: t.exposeFloat("average", { nullable: true }),
      count: t.exposeInt("count"),
    }),
  });

export const RecipeIngredientType_ = builder
  .objectRef<RecipeIngredientDto>("RecipeIngredient")
  .implement({
    description:
      "One ingredient. Exactly one of `item` and `genericItem` is non-null — " +
      "the table's own `exactly_one_item_reference` check, in the schema.",
    fields: (t) => ({
      id: t.exposeID("id"),
      recipeId: t.exposeID("recipeId"),
      refType: t.field({
        type: RecipeIngredientTypeEnum,
        resolve: (row) => row.ref.type,
      }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        description: "Non-null exactly when refType is not GENERIC.",
        resolve: (row) => {
          const type = ingredientItemType(row.ref);
          return type === null ? null : itemActorId({ type, id: row.ref.id });
        },
      }),
      genericItem: t.field({
        type: GenericItemType,
        nullable: true,
        description: "Non-null exactly when refType is GENERIC.",
        resolve: (row, _args, context) =>
          row.ref.type === "GENERIC"
            ? context
                .actor(ItemActorDescriptor, genericItemActorId(row.ref.id))
                .getGeneric()
            : null,
      }),
      quantity: t.exposeFloat("quantity", { nullable: true }),
      unit: t.exposeString("unit", { nullable: true }),
      isOptional: t.exposeBoolean("isOptional"),
      substitutionNotes: t.exposeString("substitutionNotes", {
        nullable: true,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    }),
  });

export const RecipeIngredientConnection = builder.connectionObject(
  { type: RecipeIngredientType_, name: "RecipeIngredientConnection" },
  { name: "RecipeIngredientEdge" },
);

const RecipeInstructionType = builder
  .objectRef<RecipeInstructionDto>("RecipeInstruction")
  .implement({
    description:
      "One step. `stepNumber` is 1-based and assigned by the server from the " +
      "order you send, so `(recipe_id, step_number)` can never collide.",
    fields: (t) => ({
      id: t.exposeID("id"),
      recipeId: t.exposeID("recipeId"),
      stepNumber: t.exposeInt("stepNumber"),
      instructionText: t.exposeString("instructionText"),
      instructionType: t.field({
        type: InstructionTypeEnum,
        nullable: true,
        resolve: (row) => row.instructionType,
      }),
      equipmentNeeded: t.exposeString("equipmentNeeded", { nullable: true }),
      timeMinutes: t.exposeInt("timeMinutes", { nullable: true }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    }),
  });

const RecipeInstructionConnection = builder.connectionObject(
  { type: RecipeInstructionType, name: "RecipeInstructionConnection" },
  { name: "RecipeInstructionEdge" },
);

export const RecipeReviewType = builder
  .objectRef<RecipeReviewDto>("RecipeReview")
  .implement({
    description:
      "One `recipe_reviews` row. Anyone signed in may add one (at most one " +
      "per recipe); only its author may change or delete it.",
    fields: (t) => ({
      id: t.exposeID("id"),
      recipeId: t.exposeID("recipeId"),
      userId: t.exposeID("userId"),
      score: t.exposeFloat("score", {
        nullable: true,
        description: "A half-star from 0.5 to 5, or null for a text-only note.",
      }),
      text: t.exposeString("text", { nullable: true }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const RecipeReviewConnection = builder.connectionObject(
  { type: RecipeReviewType, name: "RecipeReviewConnection" },
  { name: "RecipeReviewEdge" },
);

/* -------------------------------------------------------------------------- */
/* Recipe                                                                      */
/* -------------------------------------------------------------------------- */

/** One batch, N parallel `RecipeActor.get` calls (§1.5). */
const loadRecipes = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (RecipeDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<RecipeDto | Error> => {
      try {
        return await context.actor(RecipeActorDescriptor, key).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

/**
 * The `Recipe.netScore` / `Recipe.myVote` batch key (A7d item 4).
 *
 * Both halves are needed: the tally lives on `RecipeGroupActor`, so the key
 * has to name the group to address, and the recipe to pick out of its answer.
 * `\u0000` is the separator because it cannot occur in a uuid and cannot occur
 * in anything a client sends — a `:` or `|` would be a parsing question.
 *
 * An ungrouped recipe gets `null`, which the loader answers without a hop.
 */
const voteSummaryKey = (recipe: RecipeDto): string =>
  recipe.recipeGroupId === null
    ? ""
    : `${recipe.recipeGroupId}\u0000${recipe.id}`;

/**
 * One `RecipeGroupActor.voteSummaries` call **per group** per request, for
 * every key in the tick, in key order.
 *
 * `undefined` for a key means "no tally": an ungrouped recipe, a recipe the
 * group did not return (a stale id), or an anonymous viewer. The callers turn
 * that into `0` and `null`, which is the honest reading of each — a recipe
 * with nowhere for votes to live has a net score of zero, not an error, and a
 * page should not blank because one id went stale mid-request.
 *
 * **Anonymous costs nothing.** `voteSummaries` refuses an anonymous ctx, so
 * calling it only to swallow the refusal was a sidecar hop per group for a
 * known answer; the loader answers `undefined` for every key without one.
 *
 * **Four fields, one call per group.** `netScore`, `myVote`, `upvotes` and
 * `downvotes` (UI parity G27) are four loadables over the same key, and each
 * runs its own batch in the same tick with the same key set. The call is
 * memoised on the request context by group and recipe set, so the second,
 * third and fourth loader reuse the first's promise rather than taking three
 * more turns on a single `RecipeGroupActor(groupId)` activation.
 *
 * A group whose call fails does **not** take the field down: the batch is
 * per-group, and a failed group yields `undefined` for its own keys only. That
 * is deliberate — a tally is a decoration on a versions list, and a
 * `RecipeGroupActor` that is briefly unavailable should not null a `Recipe`.
 */
const voteSummaryCalls = new WeakMap<
  ApiContext,
  Map<string, Promise<readonly RecipeVoteSummaryDto[]>>
>();

const voteSummariesOnce = (
  context: ApiContext,
  groupId: string,
  recipeIds: readonly string[],
): Promise<readonly RecipeVoteSummaryDto[]> => {
  let calls = voteSummaryCalls.get(context);
  if (calls === undefined) {
    calls = new Map();
    voteSummaryCalls.set(context, calls);
  }
  const key = `${groupId}\u0000${[...recipeIds].sort().join(",")}`;
  const cached = calls.get(key);
  if (cached !== undefined) return cached;
  const pending = context
    .actor(RecipeGroupActorDescriptor, groupId)
    .voteSummaries([...recipeIds]);
  calls.set(key, pending);
  return pending;
};

const loadVoteSummaries = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (RecipeVoteSummaryDto | undefined)[]> => {
  if (context.ctx.viewerId === null) return keys.map(() => undefined);
  const byGroup = new Map<string, Set<string>>();
  for (const key of keys) {
    const separator = key.indexOf("\u0000");
    if (separator < 0) continue;
    const groupId = key.slice(0, separator);
    const recipeId = key.slice(separator + 1);
    const wanted = byGroup.get(groupId);
    if (wanted === undefined) byGroup.set(groupId, new Set([recipeId]));
    else wanted.add(recipeId);
  }

  const found = new Map<string, RecipeVoteSummaryDto>();
  await Promise.all(
    [...byGroup].map(async ([groupId, recipeIds]) => {
      let summaries: readonly RecipeVoteSummaryDto[];
      try {
        summaries = await voteSummariesOnce(context, groupId, [...recipeIds]);
      } catch {
        return;
      }
      for (const summary of summaries) {
        found.set(`${groupId}\u0000${summary.recipeId}`, summary);
      }
    }),
  );

  return keys.map((key) => found.get(key));
};

/**
 * `Recipe` and `RecipeGroup` reference each other, so both refs are declared
 * before either is implemented. Implementing inline would make each type's
 * inferred shape depend on the other's and collapse both to `any` (TS7022) —
 * the standard Pothos answer to a cycle, and the reason the two `.implement()`
 * calls below look like an extra step.
 */
export const RecipeType_ = builder.loadableObjectRef<RecipeDto, string>(
  "Recipe",
  { load: loadRecipes, toKey: (recipe) => recipe.id },
);

const RecipeGroupType = builder.objectRef<RecipeGroupDto>("RecipeGroup");

RecipeType_.implement({
  description:
    "One version of a drink or dish. Visible to any signed-in viewer; only " +
    "its creator may edit it.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    type: t.field({ type: RecipeTypeEnum, resolve: (r) => r.type }),
    createdById: t.exposeID("createdById", {
      nullable: true,
      description:
        "Nullable and `ON DELETE SET NULL`, unlike the six item tables.",
    }),
    recipeGroupId: t.exposeID("recipeGroupId", { nullable: true }),
    canonicalRecipeId: t.exposeID("canonicalRecipeId", { nullable: true }),
    difficultyLevel: t.exposeInt("difficultyLevel", { nullable: true }),
    prepTimeMinutes: t.exposeInt("prepTimeMinutes", { nullable: true }),
    servingSize: t.exposeInt("servingSize", { nullable: true }),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    version: t.exposeInt("version"),
    ingredientCount: t.exposeInt("ingredientCount", {
      description:
        "What replaces the `recipe_summary` view (plan §6 B6). Computed in " +
        "the actor from rows it already holds.",
    }),
    instructionCount: t.exposeInt("instructionCount"),
    createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),

    recipeGroup: t.field({
      type: RecipeGroupType,
      nullable: true,
      description: "The group this is a version of, if it belongs to one.",
      resolve: (recipe, _args, context) =>
        recipe.recipeGroupId === null
          ? null
          : context
              .actor(RecipeGroupActorDescriptor, recipe.recipeGroupId)
              .get(),
    }),

    score: t.field({
      type: RecipeScoreType,
      description: "Computed in the actor from the loaded reviews.",
      resolve: (recipe, _args, context) =>
        context.actor(RecipeActorDescriptor, recipe.id).score(),
    }),

    /**
     * A7d item 4. `netScore` and `myVote` are the two numbers a versions list
     * draws, and neither existed on `Recipe`: `netScore` lived only on
     * `RecipeVotePayload` — the answer to a vote you had *just cast* — so
     * `RecipeVersions` paged `RecipeGroup.votes` 100 rows at a time and
     * tallied in the browser. That is fine at tens of votes, wrong at
     * thousands, and **silently** wrong rather than slow once a recipe passes
     * the page cap, which is the same defect A7c removed from `isFavorite`.
     *
     * Both are `t.loadable`, keyed `groupId\u0000recipeId`, so a page of
     * twenty versions costs **one** `RecipeGroupActor` turn per group rather
     * than twenty in series — which matters more than usual here, because
     * `RecipeGroupActor(groupId)` is a single activation taking one turn at a
     * time. Selecting both fields used to cost two batched calls; with
     * `upvotes`/`downvotes` (G27) that would have been four, so the call is
     * now memoised per request (`voteSummariesOnce`) and any combination of
     * the four costs one.
     *
     * The tally cannot come from `RecipeActor`: `recipe_votes` is
     * `RecipeGroupActor`'s table (`TABLE_WRITERS`), and §1.3 lets an actor
     * cache only what it writes — so `RecipeActor` deliberately does not load
     * votes at all.
     *
     * An **ungrouped** recipe (`recipe_group_id` is nullable and `ON DELETE
     * SET NULL`) has no vote home: `netScore` is 0 and `myVote` is null,
     * without a sidecar hop.
     */
    netScore: t.loadable({
      type: "Int",
      description:
        "Upvotes minus downvotes. `0` for a recipe in no group — there is " +
        "nowhere for a vote on it to live — and for an anonymous viewer. One " +
        "`RecipeGroupActor` call per group per request, shared with " +
        "`myVote`, `upvotes` and `downvotes`.",
      resolve: (recipe) => voteSummaryKey(recipe),
      load: async (keys: string[], context: ApiContext) => {
        const summaries = await loadVoteSummaries(keys, context);
        return summaries.map((summary) => summary?.netScore ?? 0);
      },
    }),

    myVote: t.loadable({
      type: RecipeVoteTypeEnum,
      nullable: true,
      description:
        "The viewer's own vote on this version, or null — including for an " +
        "anonymous viewer, and for a recipe in no group.",
      resolve: (recipe) => voteSummaryKey(recipe),
      load: async (keys: string[], context: ApiContext) => {
        const summaries = await loadVoteSummaries(keys, context);
        return summaries.map((summary) => summary?.myVote ?? null);
      },
    }),

    /**
     * UI parity G27 — the versions tab's separate up and down counts
     * (`RecipeVoteButtons`). The old query asked for `votes_aggregate` twice
     * without aliases, so "down" was always 0; `voteSummaries` already counts
     * both, and the memo in `voteSummariesOnce` keeps all four tally fields
     * at one call per group.
     */
    upvotes: t.loadable({
      type: "Int",
      description:
        "How many upvotes this version has. `0` for a recipe in no group, " +
        "and for an anonymous viewer (votes are for signed-in viewers).",
      resolve: (recipe) => voteSummaryKey(recipe),
      load: async (keys: string[], context: ApiContext) => {
        const summaries = await loadVoteSummaries(keys, context);
        return summaries.map((summary) => summary?.upvotes ?? 0);
      },
    }),

    downvotes: t.loadable({
      type: "Int",
      description:
        "How many downvotes this version has. `0` for a recipe in no group, " +
        "and for an anonymous viewer.",
      resolve: (recipe) => voteSummaryKey(recipe),
      load: async (keys: string[], context: ApiContext) => {
        const summaries = await loadVoteSummaries(keys, context);
        return summaries.map((summary) => summary?.downvotes ?? 0);
      },
    }),

    ingredients: t.field({
      type: RecipeIngredientConnection,
      description:
        "Required ingredients first, then by the referenced item's name, " +
        "then by id (A7d item 6). The order used to be `created_at asc, id " +
        "asc`, which was not an order at all: `setIngredients` re-inserts " +
        "the whole list in one statement, so every row shares a `created_at` " +
        "and the sort fell through to a fresh random uuid per row — the same " +
        "recipe listed its ingredients differently after every edit. " +
        "`recipe_ingredients` has no authored display-order column, so this " +
        "is the rule the frontend was applying client-side, moved to the " +
        "server where every client gets it.",
      args: t.arg.connectionArgs(),
      resolve: async (recipe, args, context) =>
        connectionFromPage(
          await context
            .actor(RecipeActorDescriptor, recipe.id)
            .ingredients(toPageArgs(args)),
        ),
    }),

    instructions: t.field({
      type: RecipeInstructionConnection,
      description: "`step_number asc`.",
      args: t.arg.connectionArgs(),
      resolve: async (recipe, args, context) =>
        connectionFromPage(
          await context
            .actor(RecipeActorDescriptor, recipe.id)
            .instructions(toPageArgs(args)),
        ),
    }),

    reviews: t.field({
      type: RecipeReviewConnection,
      args: t.arg.connectionArgs(),
      resolve: async (recipe, args, context) =>
        connectionFromPage(
          await context
            .actor(RecipeActorDescriptor, recipe.id)
            .reviews(toPageArgs(args)),
        ),
    }),
  }),
});

const RecipeConnection = builder.connectionObject(
  { type: RecipeType_, name: "RecipeConnection" },
  { name: "RecipeEdge" },
);

/* -------------------------------------------------------------------------- */
/* RecipeGroup                                                                 */
/* -------------------------------------------------------------------------- */

const RecipeVoteTypeRef = builder
  .objectRef<RecipeVoteDto>("RecipeVote")
  .implement({
    description:
      "One person's vote on one recipe. At most one per person per recipe; " +
      "voting again replaces it.",
    fields: (t) => ({
      id: t.exposeID("id"),
      recipeId: t.exposeID("recipeId"),
      userId: t.exposeID("userId"),
      voteType: t.field({
        type: RecipeVoteTypeEnum,
        resolve: (v) => v.voteType,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),
    }),
  });

const RecipeVoteConnection = builder.connectionObject(
  { type: RecipeVoteTypeRef, name: "RecipeVoteConnection" },
  { name: "RecipeVoteEdge" },
);

RecipeGroupType.implement({
  description:
    "One drink, with its versions. `canonicalRecipeId` is derived from " +
    "votes — highest net score, oldest wins ties — and is recomputed inside " +
    "the actor's turn rather than by a database trigger.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name", {
      description:
        "Follows the canonical recipe's name whenever voting moves it.",
    }),
    description: t.exposeString("description", { nullable: true }),
    category: t.field({ type: RecipeCategoryEnum, resolve: (g) => g.category }),
    baseSpirit: t.exposeString("baseSpirit", { nullable: true }),
    tags: t.exposeStringList("tags"),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    createdById: t.exposeID("createdById", { nullable: true }),
    canonicalRecipeId: t.exposeID("canonicalRecipeId", { nullable: true }),
    recipeCount: t.exposeInt("recipeCount"),
    createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),

    canonicalRecipe: t.field({
      type: RecipeType_,
      nullable: true,
      description: "Resolved through the `Recipe` DataLoader.",
      resolve: (group) => group.canonicalRecipeId,
    }),

    recipes: t.field({
      type: RecipeConnection,
      description:
        "Every version, ordered the way the canonical is chosen: net vote " +
        "score descending, then oldest. The first entry is the canonical.",
      args: t.arg.connectionArgs(),
      resolve: async (group, args, context) =>
        connectionFromPage(
          await context
            .actor(RecipeGroupActorDescriptor, group.id)
            .recipes(toPageArgs(args)),
        ),
    }),

    votes: t.field({
      type: RecipeVoteConnection,
      args: t.arg.connectionArgs(),
      resolve: async (group, args, context) =>
        connectionFromPage(
          await context
            .actor(RecipeGroupActorDescriptor, group.id)
            .votes(toPageArgs(args)),
        ),
    }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Command payloads                                                            */
/* -------------------------------------------------------------------------- */

const DeletedRecipeReviewType = builder
  .objectRef<DeletedRecipeReview>("DeletedRecipeReview")
  .implement({
    description: "The id of a recipe review that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

const RemovedRecipeVoteType = builder
  .objectRef<RemovedRecipeVote>("RemovedRecipeVote")
  .implement({
    description: "The vote that was withdrawn, and what it did to the group.",
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      userId: t.exposeID("userId"),
      canonicalChanged: t.exposeBoolean("canonicalChanged"),
    }),
  });

const RecipeVoteResultType = builder
  .objectRef<RecipeVoteResult>("RecipeVotePayload")
  .implement({
    description:
      "The vote, the group as it now stands, and whether this call moved the " +
      "canonical recipe.",
    fields: (t) => ({
      vote: t.field({ type: RecipeVoteTypeRef, resolve: (r) => r.vote }),
      group: t.field({ type: RecipeGroupType, resolve: (r) => r.group }),
      netScore: t.exposeInt("netScore", {
        description: "Upvotes minus downvotes on the voted-on recipe.",
      }),
      canonicalChanged: t.exposeBoolean("canonicalChanged"),
    }),
  });

type IngredientListPayload = {
  readonly recipeId: string;
  readonly ingredients: readonly RecipeIngredientDto[];
};

const IngredientListPayloadType = builder
  .objectRef<IngredientListPayload>("RecipeIngredientsPayload")
  .implement({
    description: "The recipe's complete ingredient list after the write.",
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      recipe: t.field({ type: RecipeType_, resolve: (p) => p.recipeId }),
      ingredients: t.field({
        type: RecipeIngredientConnection,
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(offsetPage(payload.ingredients, toPageArgs(args))),
      }),
    }),
  });

type InstructionListPayload = {
  readonly recipeId: string;
  readonly instructions: readonly RecipeInstructionDto[];
};

const InstructionListPayloadType = builder
  .objectRef<InstructionListPayload>("RecipeInstructionsPayload")
  .implement({
    description: "The recipe's complete instruction list after the write.",
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      recipe: t.field({ type: RecipeType_, resolve: (p) => p.recipeId }),
      instructions: t.field({
        type: RecipeInstructionConnection,
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(
            offsetPage(payload.instructions, toPageArgs(args)),
          ),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const RecipeIngredientRefInput = builder.inputType("RecipeIngredientRefInput", {
  description: "An existing item or generic item, by type and id.",
  fields: (t) => ({
    type: t.field({ type: RecipeIngredientTypeEnum, required: true }),
    id: t.id({ required: true }),
  }),
});

const NewGenericIngredientInput = builder.inputType(
  "NewGenericIngredientInput",
  {
    description:
      "Find-or-create a `generic_items` row by (name, category). The row is " +
      "created by `ItemActor`, its single writer — never by the recipe.",
    fields: (t) => ({
      name: t.string({ required: true }),
      category: t.string({ required: true }),
      subcategory: t.string({ required: false }),
      kind: t.field({ type: GenericItemKindEnum, required: true }),
      description: t.string({ required: false }),
      isSubstitutable: t.boolean({ required: false }),
    }),
  },
);

const RecipeIngredientInput = builder.inputType("RecipeIngredientInput", {
  description:
    "Exactly one of `ref` and `newGenericItem` — the input-level mirror of " +
    "`exactly_one_item_reference`, which GraphQL cannot express as an input " +
    "union.",
  fields: (t) => ({
    ref: t.field({ type: RecipeIngredientRefInput, required: false }),
    newGenericItem: t.field({
      type: NewGenericIngredientInput,
      required: false,
    }),
    quantity: t.float({ required: false }),
    unit: t.string({ required: false }),
    isOptional: t.boolean({ required: false }),
    substitutionNotes: t.string({ required: false }),
  }),
});

const RecipeInstructionInputType = builder.inputType("RecipeInstructionInput", {
  description:
    "One step. `stepNumber` is not an input: the server numbers the list " +
    "from the order you send.",
  fields: (t) => ({
    instructionText: t.string({ required: true }),
    instructionType: t.field({ type: InstructionTypeEnum, required: false }),
    equipmentNeeded: t.string({ required: false }),
    timeMinutes: t.int({ required: false }),
  }),
});

const CreateRecipeInput = builder.inputType("CreateRecipeInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    type: t.field({ type: RecipeTypeEnum, required: true }),
    description: t.string({ required: false }),
    recipeGroupId: t.id({ required: false }),
    difficultyLevel: t.int({ required: false, description: "1-5." }),
    prepTimeMinutes: t.int({ required: false }),
    servingSize: t.int({ required: false }),
    imageUrl: t.string({ required: false }),
  }),
});

const UpdateRecipeInput = builder.inputType("UpdateRecipeInput", {
  description: "Only the fields you pass are written. Creator only.",
  fields: (t) => ({
    name: t.string({ required: false }),
    description: t.string({ required: false }),
    type: t.field({ type: RecipeTypeEnum, required: false }),
    recipeGroupId: t.id({ required: false }),
    difficultyLevel: t.int({ required: false }),
    prepTimeMinutes: t.int({ required: false }),
    servingSize: t.int({ required: false }),
    imageUrl: t.string({ required: false }),
  }),
});

const AddRecipeReviewInput = builder.inputType("AddRecipeReviewInput", {
  fields: (t) => ({
    score: t.float({ required: false, description: "A half-star, 0.5 to 5." }),
    text: t.string({ required: false }),
    reviewId: t.id({
      required: false,
      description: "Mint it yourself to make the call idempotent (§8.4).",
    }),
  }),
});

const UpdateRecipeReviewInput = builder.inputType("UpdateRecipeReviewInput", {
  description: "Author only.",
  fields: (t) => ({
    score: t.float({ required: false }),
    text: t.string({ required: false }),
  }),
});

const CreateRecipeGroupInput = builder.inputType("CreateRecipeGroupInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    category: t.field({ type: RecipeCategoryEnum, required: true }),
    description: t.string({ required: false }),
    baseSpirit: t.string({ required: false }),
    tags: t.stringList({ required: false }),
    imageUrl: t.string({ required: false }),
  }),
});

const UpdateRecipeGroupInput = builder.inputType("UpdateRecipeGroupInput", {
  description:
    "Creator only. `canonicalRecipeId` is deliberately absent — it is derived " +
    "from votes, and pinning it by hand would be silently undone.",
  fields: (t) => ({
    name: t.string({ required: false }),
    category: t.field({ type: RecipeCategoryEnum, required: false }),
    description: t.string({ required: false }),
    baseSpirit: t.string({ required: false }),
    tags: t.stringList({ required: false }),
    imageUrl: t.string({ required: false }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Argument marshalling                                                        */
/* -------------------------------------------------------------------------- */

const toCreateRecipeInput = (input: {
  name: string;
  type: RecipeType;
  description?: string | null;
  recipeGroupId?: string | null;
  difficultyLevel?: number | null;
  prepTimeMinutes?: number | null;
  servingSize?: number | null;
  imageUrl?: string | null;
}): CreateRecipeInputType => ({
  name: input.name,
  type: input.type,
  description: input.description ?? null,
  recipeGroupId: present(input.recipeGroupId)
    ? String(input.recipeGroupId)
    : null,
  difficultyLevel: input.difficultyLevel ?? null,
  prepTimeMinutes: input.prepTimeMinutes ?? null,
  servingSize: input.servingSize ?? null,
  imageUrl: input.imageUrl ?? null,
});

const UPDATE_RECIPE = {
  name: "keep",
  description: "clearable",
  type: "keep",
  recipeGroupId: { policy: "clearable", map: String },
  difficultyLevel: "clearable",
  prepTimeMinutes: "clearable",
  servingSize: "clearable",
  imageUrl: "clearable",
} satisfies PatchPolicy<typeof UpdateRecipeInput.$inferInput>;

const UPDATE_RECIPE_REVIEW = {
  score: "clearable",
  text: "clearable",
} satisfies PatchPolicy<typeof UpdateRecipeReviewInput.$inferInput>;

const toIngredientInput = (input: {
  ref?: { type: RecipeIngredientType; id: string } | null;
  newGenericItem?: {
    name: string;
    category: string;
    subcategory?: string | null;
    kind: GenericItemKind;
    description?: string | null;
    isSubstitutable?: boolean | null;
  } | null;
  quantity?: number | null;
  unit?: string | null;
  isOptional?: boolean | null;
  substitutionNotes?: string | null;
}): RecipeIngredientInputType => ({
  ...(present(input.ref)
    ? { ref: { type: input.ref.type, id: String(input.ref.id) } }
    : {}),
  ...(present(input.newGenericItem)
    ? {
        newGenericItem: {
          name: input.newGenericItem.name,
          category: input.newGenericItem.category,
          subcategory: input.newGenericItem.subcategory ?? null,
          kind: input.newGenericItem.kind,
          description: input.newGenericItem.description ?? null,
          isSubstitutable: input.newGenericItem.isSubstitutable ?? null,
        },
      }
    : {}),
  quantity: input.quantity ?? null,
  unit: input.unit ?? null,
  isOptional: input.isOptional ?? null,
  substitutionNotes: input.substitutionNotes ?? null,
});

const toInstructionInput = (input: {
  instructionText: string;
  instructionType?: InstructionType | null;
  equipmentNeeded?: string | null;
  timeMinutes?: number | null;
}): RecipeInstructionInput => ({
  instructionText: input.instructionText,
  instructionType: input.instructionType ?? null,
  equipmentNeeded: input.equipmentNeeded ?? null,
  timeMinutes: input.timeMinutes ?? null,
});

const toCreateGroupInput = (input: {
  name: string;
  category: RecipeCategory;
  description?: string | null;
  baseSpirit?: string | null;
  tags?: readonly string[] | null;
  imageUrl?: string | null;
}): CreateRecipeGroupInputType => ({
  name: input.name,
  category: input.category,
  description: input.description ?? null,
  baseSpirit: input.baseSpirit ?? null,
  tags: input.tags ?? null,
  imageUrl: input.imageUrl ?? null,
});

const UPDATE_RECIPE_GROUP = {
  name: "keep",
  category: "keep",
  description: "clearable",
  baseSpirit: "clearable",
  tags: "clearable",
  imageUrl: "clearable",
} satisfies PatchPolicy<typeof UpdateRecipeGroupInput.$inferInput>;

/* -------------------------------------------------------------------------- */
/* Root fields                                                                 */
/* -------------------------------------------------------------------------- */

builder.queryField("recipe", (t) =>
  t.field({
    type: RecipeType_,
    description:
      "One recipe by id. `NotFoundError` covers both 'no such recipe' and " +
      "'not yours to see' (§1.6).",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(RecipeActorDescriptor, String(args.id)).get(),
  }),
);

builder.queryField("recipeGroup", (t) =>
  t.field({
    type: RecipeGroupType,
    description: "One recipe group by id, with its versions and their votes.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(RecipeGroupActorDescriptor, String(args.id)).get(),
  }),
);

const RecipeGroupConnection = builder.connectionObject(
  { type: RecipeGroupType, name: "RecipeGroupConnection" },
  { name: "RecipeGroupEdge" },
);

builder.queryField("recipeGroups", (t) =>
  t.field({
    type: RecipeGroupConnection,
    description:
      "`/recipes` — the recipe-group index, newest first (or by name, " +
      "`orderBy`), optionally filtered by category or base spirit (C3's " +
      "`RecipeGroupsCollectionActor`, §2.2). A **projection**: every field " +
      "the card renders is a `recipe_groups` column or its recipe count, so " +
      "a page of ids would be N cold `RecipeGroupActor` activations (§1.5). " +
      "`term` narrows the list the way the old page's search box did; " +
      "ranked free text over recipes is `recipeSearch`.",
    args: {
      ...t.arg.connectionArgs(),
      category: t.arg({ type: RecipeCategoryEnum, required: false }),
      baseSpirit: t.arg.string({ required: false }),
      term: t.arg.string({
        required: false,
        description:
          "Case-insensitive substring of the group's name or description, " +
          "or of any of its versions' names (UI parity G26). Trimmed; blank " +
          "is no filter; at most 200 characters. Order and paging are " +
          "unchanged, and `totalCount` counts the matches.",
      }),
      orderBy: t.arg({
        type: RecipeGroupOrderEnum,
        required: false,
        defaultValue: DEFAULT_RECIPE_GROUP_ORDER,
        description:
          "NEWEST (the default) or NAME. Pass `after` only from a page of " +
          "the same order; a cursor from the other is a `VALIDATION` error " +
          "or, NAME given a NEWEST cursor, a page from the wrong place.",
      }),
    },
    errors: {},
    resolve: async (_root, args, context) => {
      // The filter *is* the actor id, so it is built once and used twice.
      const filter = {
        category: args.category ?? null,
        baseSpirit: args.baseSpirit ?? null,
        term: normalizeRecipeGroupTerm(args.term),
        orderBy: normalizeRecipeGroupOrder(args.orderBy),
      };
      return connectionFromPage(
        await context
          .actor(
            RecipeGroupsCollectionActorDescriptor,
            recipeGroupsCollectionActorId(filter),
          )
          .list(filter, toPageArgs(args)),
      );
    },
  }),
);

builder.mutationField("createRecipe", (t) =>
  t.field({
    type: RecipeType_,
    description:
      "Mints the id and addresses `RecipeActor(id)` before any row exists — " +
      "the provisional-id pattern every `create` uses.",
    errors: {},
    args: { input: t.arg({ type: CreateRecipeInput, required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeActorDescriptor, randomUUID())
        .create(toCreateRecipeInput(args.input)),
  }),
);

builder.mutationField("updateRecipe", (t) =>
  t.field({
    type: RecipeType_,
    description: "Creator only.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateRecipeInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeActorDescriptor, String(args.recipeId))
        .update(
          patch(args.input, UPDATE_RECIPE) satisfies UpdateRecipeInputType,
        ),
  }),
);

builder.mutationField("setRecipeIngredients", (t) =>
  t.field({
    type: IngredientListPayloadType,
    description:
      "Replaces the recipe's complete ingredient list in one transaction. " +
      "An ingredient naming a `newGenericItem` is find-or-created through " +
      "`ItemActor`, the single writer of `generic_items`.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      ingredients: t.arg({
        type: [RecipeIngredientInput],
        required: true,
        description: "The full list. An empty array clears it.",
      }),
    },
    resolve: async (_root, args, context): Promise<IngredientListPayload> => {
      const recipeId = String(args.recipeId);
      const ingredients = await context
        .actor(RecipeActorDescriptor, recipeId)
        .setIngredients({
          ingredients: args.ingredients.map(toIngredientInput),
        });
      return { recipeId, ingredients };
    },
  }),
);

builder.mutationField("setRecipeInstructions", (t) =>
  t.field({
    type: InstructionListPayloadType,
    description:
      "Replaces the recipe's complete instruction list in one transaction. " +
      "Steps are numbered 1..n from the order you send.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      instructions: t.arg({
        type: [RecipeInstructionInputType],
        required: true,
      }),
    },
    resolve: async (_root, args, context): Promise<InstructionListPayload> => {
      const recipeId = String(args.recipeId);
      const instructions = await context
        .actor(RecipeActorDescriptor, recipeId)
        .setInstructions({
          instructions: args.instructions.map(toInstructionInput),
        });
      return { recipeId, instructions };
    },
  }),
);

builder.mutationField("addRecipeReview", (t) =>
  t.field({
    type: RecipeReviewType,
    description:
      "Any signed-in user, at most one review per recipe. Reviewing again is " +
      "a `ConflictError` — use `updateRecipeReview`.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      input: t.arg({ type: AddRecipeReviewInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context.actor(RecipeActorDescriptor, String(args.recipeId)).addReview({
        score: args.input.score ?? null,
        text: args.input.text ?? null,
        ...(present(args.input.reviewId)
          ? { reviewId: String(args.input.reviewId) }
          : {}),
      } satisfies AddRecipeReviewInputType),
  }),
);

builder.mutationField("updateRecipeReview", (t) =>
  t.field({
    type: RecipeReviewType,
    description: "Author only — not the recipe's creator, not an admin's peer.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      reviewId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateRecipeReviewInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeActorDescriptor, String(args.recipeId))
        .updateReview(
          String(args.reviewId),
          patch(
            args.input,
            UPDATE_RECIPE_REVIEW,
          ) satisfies UpdateRecipeReviewInputType,
        ),
  }),
);

builder.mutationField("deleteRecipeReview", (t) =>
  t.field({
    type: DeletedRecipeReviewType,
    description: "Author only.",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      reviewId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeActorDescriptor, String(args.recipeId))
        .deleteReview(String(args.reviewId)),
  }),
);

builder.mutationField("createRecipeGroup", (t) =>
  t.field({
    type: RecipeGroupType,
    errors: {},
    args: { input: t.arg({ type: CreateRecipeGroupInput, required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeGroupActorDescriptor, randomUUID())
        .create(toCreateGroupInput(args.input)),
  }),
);

builder.mutationField("updateRecipeGroup", (t) =>
  t.field({
    type: RecipeGroupType,
    description: "Creator only.",
    errors: {},
    args: {
      recipeGroupId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateRecipeGroupInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeGroupActorDescriptor, String(args.recipeGroupId))
        .update(
          patch(
            args.input,
            UPDATE_RECIPE_GROUP,
          ) satisfies UpdateRecipeGroupInputType,
        ),
  }),
);

builder.mutationField("voteOnRecipe", (t) =>
  t.field({
    type: RecipeVoteResultType,
    description:
      "Any signed-in user, on a recipe in this group. Voting again replaces " +
      "your vote; the canonical recipe is recomputed in the same turn.",
    errors: {},
    args: {
      recipeGroupId: t.arg.id({ required: true }),
      recipeId: t.arg.id({ required: true }),
      voteType: t.arg({ type: RecipeVoteTypeEnum, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeGroupActorDescriptor, String(args.recipeGroupId))
        .vote({
          recipeId: String(args.recipeId),
          voteType: args.voteType as RecipeVoteType,
        }),
  }),
);

builder.mutationField("removeRecipeVote", (t) =>
  t.field({
    type: RemovedRecipeVoteType,
    description:
      "Withdraws **your own** vote. There is no argument by which another " +
      "user's vote could be named.",
    errors: {},
    args: {
      recipeGroupId: t.arg.id({ required: true }),
      recipeId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeGroupActorDescriptor, String(args.recipeGroupId))
        .removeVote(String(args.recipeId)),
  }),
);

/* -------------------------------------------------------------------------- */
/* Deletes (A7d item 7)                                                        */
/* -------------------------------------------------------------------------- */

const DeletedRecipeType = builder
  .objectRef<DeletedRecipe>("DeletedRecipe")
  .implement({
    description: "The id of a recipe that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

const DeletedRecipeGroupType = builder
  .objectRef<DeletedRecipeGroup>("DeletedRecipeGroup")
  .implement({
    description: "The id of a recipe group that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

builder.mutationField("deleteRecipe", (t) =>
  t.field({
    type: DeletedRecipeType,
    description:
      "Creator only. Cascades its ingredients, instructions, reviews, votes " +
      "and vector in one statement. If it was its group's canonical " +
      "version, the group picks a new one asynchronously (an outbox row, " +
      "not part of this call), so a read immediately after may still see " +
      "the old `canonicalRecipeId`.",
    errors: {},
    args: { recipeId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(RecipeActorDescriptor, String(args.recipeId)).delete(),
  }),
);

builder.mutationField("deleteRecipeGroup", (t) =>
  t.field({
    type: DeletedRecipeGroupType,
    description:
      "Creator only, and **only while the group is empty**. " +
      "`recipes.recipe_group_id` is `ON DELETE SET NULL`, so deleting a " +
      "group with versions in it would orphan them rather than remove them " +
      "— a `ConflictError` says so instead. Delete or re-group the versions " +
      "first (`deleteRecipe`).",
    errors: {},
    args: { recipeGroupId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(RecipeGroupActorDescriptor, String(args.recipeGroupId))
        .delete(),
  }),
);
