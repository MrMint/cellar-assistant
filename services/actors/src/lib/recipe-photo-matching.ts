/**
 * Turning an extracted recipe into actor calls — C4's half of
 * `functions/_utils/recipe-database`.
 *
 * Two kinds of thing live here and nothing else:
 *
 *  1. **pure decisions** — `ingredientSearchText`, `declaredItemType`,
 *     `ingredientItemTypes`, `normaliseInstructionType`, `genericFallback`,
 *     `pickIngredientMatch`.
 *     Pure so `recipe-photo-job-actor.test.ts` can assert the *routing* rather
 *     than merely that something was written, which is the lesson B8 recorded;
 *  2. **the seams** onto the actors that own the rows, so the harness drives
 *     the whole chain with no sidecar and no network.
 *
 * ## §8.5 is why this is a job at all
 *
 * Building a recipe from a photo needs a **search** (does an item like this
 * already exist?) and then **entity writes** (`RecipeGroupActor`,
 * `RecipeActor`, `ItemActor`). §8.5 forbids an entity actor from calling a
 * search actor synchronously and the outbox cannot carry an answer back, so
 * the only caller that may do both is a job — exactly B8's argument for
 * `MenuMatchJobActor`.
 *
 * ## What the old pipeline did that this deliberately does not
 *
 * `_utils/recipe-database/item-creators.ts` created **specific** items —
 * `wines`, `beers`, `spirits`, `coffees` — with a brand, when the model was
 * confident enough. That is not expressible in the target schema, and not
 * because of a rule: `wines.item_onboarding_id`, and the same column on
 * `beers`, `spirits` and `coffees`, is **NOT NULL** (`ItemActor.create`
 * enforces it as `requireOnboarding`). A recipe photo is not an onboarding, so
 * there is no onboarding id to supply and never will be. `generic_items` has
 * no such column — and no brand column either, which is why this port resolves
 * no brands: a `brands` row created here would be referenced by nothing.
 *
 * The consequence is *better* data, not worse. The old path wrote a `wines`
 * row per "2 oz red wine" on a photo, and — because its mutation variables did
 * not match its mutation signature — dropped style, variety, country and the
 * brand link while doing it. Here an ingredient either **matches an item that
 * already exists** (through `ItemSearchActor`, which is the vector search the
 * old `findBestItemMatch` was reaching for) or becomes a `generic_items` row,
 * which is what "2 oz red wine" actually is.
 */
import type {
  CreateRecipeGroupInput,
  CreateRecipeInput,
  Ctx,
  ExtractedRecipeIngredient,
  ExtractedRecipeInstruction,
  InstructionType,
  ItemSearchHit,
  ItemSearchInput,
  ItemType,
  NewGenericIngredientInput,
  RecipeDto,
  RecipeGroupDto,
  RecipeIngredientDto,
  RecipeIngredientInput,
  RecipeIngredientRef,
  RecipeInstructionDto,
  SetRecipeIngredientsInput,
  SetRecipeInstructionsInput,
} from "@cellar-assistant/contracts";
import {
  distanceFromSimilarity,
  ItemSearchActorDescriptor,
  isGenericItemKind,
  isItemType,
  itemSearchActorId,
  RecipeActorDescriptor,
  RecipeGroupActorDescriptor,
} from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How close a vector hit must be to stand in for the ingredient.
 *
 * `0.8` is `functions/_utils/item-matching`'s `confidenceThreshold` for a
 * specific match, kept verbatim — the one number in the old pipeline that was
 * actually tuned. Below it the ingredient becomes a generic item, which is a
 * cheap, correct answer rather than a wrong link to somebody's bottle.
 */
export const INGREDIENT_MATCH_MIN_SIMILARITY = 0.8;

export const INGREDIENT_MATCH_MAX_DISTANCE = distanceFromSimilarity(
  INGREDIENT_MATCH_MIN_SIMILARITY,
);

/** Candidates asked of the search per ingredient. */
export const INGREDIENT_SEARCH_LIMIT = 5;

/* -------------------------------------------------------------------------- */
/* Pure decisions                                                              */
/* -------------------------------------------------------------------------- */

const clean = (value: string | null | undefined): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * The phrase the vector search runs with: brand first, then name, because
 * "Angostura aromatic bitters" ranks very differently from "bitters".
 */
export const ingredientSearchText = (
  ingredient: ExtractedRecipeIngredient,
): string => {
  const brand = clean(ingredient.brandName);
  const name = clean(ingredient.name);
  if (brand === "" || name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }
  return `${brand} ${name}`;
};

/**
 * The `ItemType` a model's free-text `itemType` names, or `null`.
 *
 * `RECIPE_PHOTO_SCHEMA` asks for the singular — `wine`, `spirit`, … — but a
 * model does not always answer in the form it was asked for, and the prompt
 * itself asked for the plural table names (`wines`, `spirits`) until this
 * accepted both. Before that, every value the prompt requested fell through
 * to `null` here: the search widened to all six tables, so "2 oz bourbon" was
 * vector-searched against coffees and teas, and `genericFallback` filed every
 * one as `ingredient`. The suite stayed green because its fixtures used the
 * singular, which the prompt never asked for.
 *
 * Case-insensitive, and one trailing `s` is dropped only when what remains is
 * an `ItemType`, so nothing outside the six can be manufactured.
 */
export const declaredItemType = (
  raw: string | null | undefined,
): ItemType | null => {
  const declared = clean(raw).toUpperCase();
  if (isItemType(declared)) return declared;
  const singular = declared.endsWith("S") ? declared.slice(0, -1) : "";
  return isItemType(singular) ? singular : null;
};

/**
 * Which item tables to search. The model's `itemType` is free text, so
 * anything {@link declaredItemType} does not recognise widens to all six
 * rather than narrowing to nothing.
 */
export const ingredientItemTypes = (
  ingredient: ExtractedRecipeIngredient,
): readonly ItemType[] => {
  const declared = declaredItemType(ingredient.itemType);
  return declared === null ? [] : [declared];
};

export const ingredientSearchInput = (
  ingredient: ExtractedRecipeIngredient,
): ItemSearchInput => ({
  text: ingredientSearchText(ingredient),
  itemTypes: ingredientItemTypes(ingredient),
  maxDistance: INGREDIENT_MATCH_MAX_DISTANCE,
  limit: INGREDIENT_SEARCH_LIMIT,
});

/**
 * The closest hit that clears the threshold, or `null`.
 *
 * `ItemSearchActor` already caps by `maxDistance`, but a seam is a seam: the
 * decision is re-made here so a fake searcher in a test cannot smuggle a
 * far-away hit into a recipe.
 */
export const pickIngredientMatch = (
  hits: readonly ItemSearchHit[],
): ItemSearchHit | null => {
  let best: ItemSearchHit | null = null;
  for (const hit of hits) {
    if (hit.distance > INGREDIENT_MATCH_MAX_DISTANCE) continue;
    if (best === null || hit.distance < best.distance) best = hit;
  }
  return best;
};

export const ingredientRefFromHit = (
  hit: ItemSearchHit,
): RecipeIngredientRef => ({ type: hit.type, id: hit.id });

/**
 * The generic item an unmatched ingredient becomes.
 *
 * `RecipeActor.setIngredients` find-or-creates it by `(name, category)` —
 * `idx_generic_items_name_category` — through `ItemActor.createGeneric`, so
 * two recipes naming "simple syrup" converge on one row and this actor writes
 * nothing itself (§1.2).
 */
export const genericFallback = (
  ingredient: ExtractedRecipeIngredient,
): NewGenericIngredientInput => {
  // The same reading the search narrows on, so `spirits` and `spirit` agree
  // here too. Every item type is a generic kind (sake and tea since
  // `20260928043100_generic_items_sake_tea_kinds`); a raw `ingredient` is a
  // kind and is kept; anything else falls to `ingredient`.
  const declaredKind =
    declaredItemType(ingredient.itemType)?.toLowerCase() ??
    clean(ingredient.itemType).toLowerCase();
  const kind = isGenericItemKind(declaredKind) ? declaredKind : "ingredient";
  const category = clean(ingredient.category);
  return {
    name: clean(ingredient.name),
    category: category === "" ? kind : category,
    kind,
    ...(clean(ingredient.brandName) === ""
      ? {}
      : { description: `as printed: ${clean(ingredient.brandName)}` }),
    isSubstitutable: ingredient.isOptional === true ? true : null,
  };
};

/**
 * `recipe_instructions.instruction_type`'s check constraint knows six values;
 * the old prompt emitted a dozen verbs. This is
 * `recipe-group-creation.ts`'s mapping, verbatim, with the unknown case
 * falling to `mix` as it did.
 */
const INSTRUCTION_SYNONYMS: Readonly<Record<string, InstructionType>> = {
  add: "mix",
  build: "mix",
  chill: "chill",
  combine: "mix",
  cook: "cook",
  finish: "garnish",
  garnish: "garnish",
  mix: "mix",
  muddle: "prep",
  pour: "mix",
  prep: "prep",
  serve: "serve",
  shake: "mix",
  stir: "mix",
  strain: "mix",
};

export const normaliseInstructionType = (
  raw: string | null | undefined,
): InstructionType => INSTRUCTION_SYNONYMS[clean(raw).toLowerCase()] ?? "mix";

export const instructionInput = (
  instruction: ExtractedRecipeInstruction,
): SetRecipeInstructionsInput["instructions"][number] => ({
  instructionText: clean(instruction.instructionText),
  instructionType: normaliseInstructionType(instruction.instructionType),
  equipmentNeeded: instruction.equipmentNeeded ?? null,
  timeMinutes: instruction.timeMinutes ?? null,
});

/** An ingredient row's non-reference half. */
export const ingredientQuantities = (
  ingredient: ExtractedRecipeIngredient,
): Omit<RecipeIngredientInput, "ref" | "newGenericItem"> => ({
  quantity: ingredient.quantity ?? null,
  unit: ingredient.unit ?? null,
  isOptional: ingredient.isOptional ?? false,
  substitutionNotes: ingredient.substitutionNotes ?? null,
});

/* -------------------------------------------------------------------------- */
/* Seams (§8.5: job → search, job → entity)                                    */
/* -------------------------------------------------------------------------- */

/** `ItemSearchActor.all` — the whole capped set, paged by the caller. */
export type IngredientSearcher = (
  ctx: Ctx,
  input: ItemSearchInput,
) => Promise<readonly ItemSearchHit[]>;

/**
 * A search actor's id **is** the hash of its input (§1.5) and
 * `SearchActorBase` refuses a mismatch, so the id must come from the shared
 * builder in contracts. Item search is viewer-insensitive (§2.3), hence the
 * `null` viewer — the activation is shared with every other caller looking for
 * the same phrase, which is the point of the cache.
 */
export const daprIngredientSearcher: IngredientSearcher = (ctx, input) =>
  internal(ctx)(ItemSearchActorDescriptor, itemSearchActorId(input, null)).all(
    input,
  );

/** The four writes, all onto actors that own their rows. */
export type RecipeWriter = {
  createGroup(
    ctx: Ctx,
    groupId: string,
    input: CreateRecipeGroupInput,
  ): Promise<RecipeGroupDto>;
  createRecipe(
    ctx: Ctx,
    recipeId: string,
    input: CreateRecipeInput,
  ): Promise<RecipeDto>;
  setIngredients(
    ctx: Ctx,
    recipeId: string,
    input: SetRecipeIngredientsInput,
  ): Promise<readonly RecipeIngredientDto[]>;
  setInstructions(
    ctx: Ctx,
    recipeId: string,
    input: SetRecipeInstructionsInput,
  ): Promise<readonly RecipeInstructionDto[]>;
};

/** Each bounded by its method's timeout on the owning actor's descriptor. */
export const daprRecipeWriter: RecipeWriter = {
  createGroup: (ctx, groupId, input) =>
    internal(ctx)(RecipeGroupActorDescriptor, groupId).create(input),
  createRecipe: (ctx, recipeId, input) =>
    internal(ctx)(RecipeActorDescriptor, recipeId).create(input),
  setIngredients: (ctx, recipeId, input) =>
    internal(ctx)(RecipeActorDescriptor, recipeId).setIngredients(input),
  setInstructions: (ctx, recipeId, input) =>
    internal(ctx)(RecipeActorDescriptor, recipeId).setInstructions(input),
};
