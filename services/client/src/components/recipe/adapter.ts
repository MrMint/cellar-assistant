/**
 * New API shapes → the old recipe components' props.
 *
 * The restored components (`82450ad1:src/components/recipe/**`) keep their
 * snake_case prop types; these pure functions are the only place that knows
 * both sides, so they are what `adapter.test.ts` pins.
 *
 * No `"use client"`: the server pages call these.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { richTextFromReviewText } from "@/components/common/rich-text";
import type { ResultOf } from "@/lib/api/graphql";
import { RECIPE_PHOTO_STAGES } from "@/lib/api/recipe-photos";
import { formatVintage } from "@/utilities";
import type {
  RecipeDetailsFragment,
  RecipeGroupCardFragment,
  RecipeReviewFragment,
  RecipeVoteStateFragment,
} from "./fragments";

// ---------------------------------------------------------------------------
// Old prop shapes
// ---------------------------------------------------------------------------

export type RecipeType = "food" | "cocktail";

export type RecipeInstruction = {
  id: string;
  step_number: number;
  instruction_text: string;
  instruction_type?: string | null;
  equipment_needed?: string | null;
  time_minutes?: number | null;
};

/**
 * The old row had five typed item columns (`wine`, `beer`, `spirit`,
 * `coffee`, `generic_item`); sake and tea had none, so a sake ingredient
 * could not be linked. The API has one `item` over all six types.
 */
export type RecipeIngredient = {
  id: string;
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean | null;
  substitution_notes?: string | null;
  item?: {
    id: string;
    name: string;
    type: ApiItemType;
    vintage?: string | null;
  } | null;
  generic_item?: {
    id: string;
    name: string;
    category?: string | null;
    subcategory?: string | null;
    item_type?: string | null;
  } | null;
};

export type RecipeReview = {
  id: string;
  userId: string;
  score?: number;
  user: {
    displayName: string;
    avatarUrl: string;
  };
  /** Serialized Lexical state (`richTextFromReviewText`), or null. */
  text?: string | null;
  created_at: string;
};

export type RecipeVariation = {
  id: string;
  name: string;
  version?: number | null;
  difficulty_level?: number | null;
};

export type RecipeDetailsItem = {
  id: string;
  name: string;
  description?: string | null;
  type: RecipeType;
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  image_url?: string | null;
  version?: number | null;
  canonical_recipe_id?: string | null;
  instructions: RecipeInstruction[];
  ingredients: RecipeIngredient[];
  recipe_reviews?: RecipeReview[];
  canonical_recipe?: {
    id: string;
    name: string;
    type: string;
  } | null;
  recipe_variations?: RecipeVariation[];
};

export type RecipeGroupCardData = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  base_spirit?: string | null;
  tags?: string[] | null;
  canonical_recipe?: {
    id: string;
    name: string;
    description?: string | null;
    difficulty_level?: number | null;
    prep_time_minutes?: number | null;
    serving_size?: number | null;
    image_url?: string | null;
  } | null;
  recipes_aggregate: {
    aggregate: {
      count: number;
    };
  };
};

export type RecipeVoteType = "upvote" | "downvote";

export type RecipeVoteState = {
  upvotes: number;
  downvotes: number;
  netScore: number;
  userVote: RecipeVoteType | null;
};

export type RecipeVersionData = Omit<
  RecipeDetailsItem,
  "recipe_reviews" | "canonical_recipe" | "recipe_variations"
> & {
  created_at: string | null;
  created_by_user?: {
    id: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
} & RecipeVoteState;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type RecipeGroupCardNode = ResultOf<typeof RecipeGroupCardFragment>;
export type RecipeDetailsNode = ResultOf<typeof RecipeDetailsFragment>;
export type RecipeReviewNode = ResultOf<typeof RecipeReviewFragment>;
export type RecipeVoteStateNode = ResultOf<typeof RecipeVoteStateFragment>;

/** `Recipe.recipeGroup` as `RecipePageQuery` selects it. */
export type RecipeGroupContext = {
  id: string;
  name: string;
  recipeCount: number;
  canonicalRecipeId?: string | null;
  canonicalRecipe?: { id: string; name: string; type: string } | null;
  recipes: {
    edges: readonly {
      node: {
        id: string;
        name: string;
        version: number;
        difficultyLevel?: number | null;
      };
    }[];
  };
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** `RecipeType` is `food | cocktail` in the SDL too; anything else reads as a cocktail. */
export const recipeTypeOf = (type: string): RecipeType =>
  type === "food" ? "food" : "cocktail";

/** `/wines/<id>` etc. — the item routes the old list linked to. */
export const ingredientItemHref = (item: {
  id: string;
  type: ApiItemType;
}): string => `/${item.type.toLowerCase()}s/${item.id}`;

/** `GIN` / `brandy_cognac` → `Gin` / `Brandy Cognac`, the old card's rule. */
export const formatSpirit = (
  value: string | null | undefined,
): string | null =>
  value === null || value === undefined || value === ""
    ? null
    : value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

/** `recipeGroups` edge → the old `RecipeGroupCardData`. */
export const recipeGroupCardFromNode = (
  node: RecipeGroupCardNode,
): RecipeGroupCardData => {
  const canonical = node.canonicalRecipe ?? null;
  return {
    id: node.id,
    name: node.name,
    description: node.description ?? null,
    category: node.category,
    base_spirit: node.baseSpirit ?? null,
    tags: [...node.tags],
    canonical_recipe:
      canonical === null
        ? null
        : {
            id: canonical.id,
            name: canonical.name,
            description: canonical.description ?? null,
            difficulty_level: canonical.difficultyLevel ?? null,
            prep_time_minutes: canonical.prepTimeMinutes ?? null,
            serving_size: canonical.servingSize ?? null,
            // The canonical's picture, falling back to the group's own — the
            // old card read only the canonical's, which never loaded.
            image_url: canonical.imageUrl ?? node.imageUrl ?? null,
          },
    recipes_aggregate: { aggregate: { count: node.recipeCount } },
  };
};

const ingredientFromNode = (
  node: RecipeDetailsNode["ingredients"]["edges"][number]["node"],
): RecipeIngredient => {
  const item = node.item ?? null;
  const generic = node.genericItem ?? null;
  return {
    id: node.id,
    quantity: node.quantity ?? null,
    unit: node.unit ?? null,
    is_optional: node.isOptional,
    substitution_notes: node.substitutionNotes ?? null,
    item:
      item === null
        ? null
        : {
            id: item.id,
            name: item.name,
            type: item.type,
            vintage:
              "vintage" in item ? (formatVintage(item.vintage) ?? null) : null,
          },
    generic_item:
      generic === null
        ? null
        : {
            id: generic.id,
            name: generic.name,
            category: generic.category,
            subcategory: generic.subcategory ?? null,
            item_type: generic.kind,
          },
  };
};

const instructionFromNode = (
  node: RecipeDetailsNode["instructions"]["edges"][number]["node"],
): RecipeInstruction => ({
  id: node.id,
  step_number: node.stepNumber,
  instruction_text: node.instructionText,
  instruction_type: node.instructionType ?? null,
  equipment_needed: node.equipmentNeeded ?? null,
  time_minutes: node.timeMinutes ?? null,
});

/**
 * "Variation of" and "Other variations" — the old `canonical_recipe` and
 * `recipe_variations` relationships, which Hasura never exposed. From the
 * group: the canonical, when it is not this recipe; and every other version.
 */
export const variationsFromGroup = (
  recipeId: string,
  group: RecipeGroupContext | null | undefined,
): Pick<RecipeDetailsItem, "canonical_recipe" | "recipe_variations"> => {
  if (group === null || group === undefined) {
    return { canonical_recipe: null, recipe_variations: [] };
  }
  const canonical = group.canonicalRecipe ?? null;
  const canonicalId = canonical?.id ?? null;
  return {
    canonical_recipe:
      canonical !== null && canonical.id !== recipeId
        ? { id: canonical.id, name: canonical.name, type: canonical.type }
        : null,
    recipe_variations: group.recipes.edges
      .map((edge) => edge.node)
      .filter((node) => node.id !== recipeId && node.id !== canonicalId)
      .map((node) => ({
        id: node.id,
        name: node.name,
        version: node.version,
        difficulty_level: node.difficultyLevel ?? null,
      })),
  };
};

/** A review row → the old `RecipeReview`. A missing author still gets a row. */
export const reviewFromNode = (node: RecipeReviewNode): RecipeReview => ({
  id: node.id,
  userId: node.userId,
  score: node.score ?? undefined,
  user:
    node.user === null || node.user === undefined
      ? { displayName: "Unknown user", avatarUrl: "" }
      : {
          displayName: node.user.displayName,
          avatarUrl: node.user.avatarUrl ?? "",
        },
  text: richTextFromReviewText(node.text),
  created_at: node.createdAt,
});

/** `RecipeDetailsData` (+ the page's group and reviews) → `RecipeDetailsItem`. */
export const recipeDetailsFromNode = (
  node: RecipeDetailsNode,
  extras: {
    group?: RecipeGroupContext | null;
    reviews?: readonly RecipeReviewNode[];
  } = {},
): RecipeDetailsItem => ({
  id: node.id,
  name: node.name,
  description: node.description ?? null,
  type: recipeTypeOf(node.type),
  difficulty_level: node.difficultyLevel ?? null,
  prep_time_minutes: node.prepTimeMinutes ?? null,
  serving_size: node.servingSize ?? null,
  image_url: node.imageUrl ?? null,
  version: node.version,
  canonical_recipe_id: node.canonicalRecipeId ?? null,
  instructions: node.instructions.edges.map((edge) =>
    instructionFromNode(edge.node),
  ),
  ingredients: node.ingredients.edges.map((edge) =>
    ingredientFromNode(edge.node),
  ),
  recipe_reviews: (extras.reviews ?? []).map(reviewFromNode),
  ...variationsFromGroup(node.id, extras.group),
});

/** G27's four fields → the old component's tallies. */
export const voteStateFromNode = (
  node: RecipeVoteStateNode,
): RecipeVoteState => ({
  upvotes: node.upvotes,
  downvotes: node.downvotes,
  netScore: node.netScore,
  userVote: node.myVote ?? null,
});

/** One version of `RecipeVersionsPageQuery` → the old `RecipeVersionData`. */
export const versionFromNodes = (
  details: RecipeDetailsNode,
  votes: RecipeVoteStateNode,
): RecipeVersionData => {
  const {
    recipe_reviews: _reviews,
    canonical_recipe: _canonical,
    recipe_variations: _variations,
    ...rest
  } = recipeDetailsFromNode(details);
  return {
    ...rest,
    created_at: details.createdAt ?? null,
    created_by_user:
      details.createdBy === null || details.createdBy === undefined
        ? null
        : {
            id: details.createdBy.id,
            displayName: details.createdBy.displayName,
            avatarUrl: details.createdBy.avatarUrl ?? null,
          },
    ...voteStateFromNode(votes),
  };
};

/**
 * Lay a polled vote snapshot over the versions on screen. Versions the poll
 * did not return keep what they had; the order is the server's, which is
 * already net-score descending, oldest first on a tie.
 */
export const applyVoteSnapshot = (
  versions: readonly RecipeVersionData[],
  snapshot: ReadonlyMap<string, RecipeVoteState>,
): RecipeVersionData[] =>
  versions.map((version) => {
    const state = snapshot.get(version.id);
    return state === undefined ? version : { ...version, ...state };
  });

/**
 * The old tab order: net score descending, then oldest. The server already
 * returns `recipes` this way; re-sorting after a vote keeps the tabs honest
 * between polls.
 */
export const sortVersions = (
  versions: readonly RecipeVersionData[],
): RecipeVersionData[] =>
  [...versions].sort((a, b) => {
    if (a.netScore !== b.netScore) return b.netScore - a.netScore;
    const at = a.created_at === null ? 0 : Date.parse(a.created_at);
    const bt = b.created_at === null ? 0 : Date.parse(b.created_at);
    return at - bt;
  });

/**
 * The optimistic tally after a click — the old `handleVote` arithmetic:
 * the same arrow again withdraws, the other arrow moves the vote.
 */
export const nextVoteState = (
  current: RecipeVoteState,
  clicked: RecipeVoteType,
): RecipeVoteState => {
  let { upvotes, downvotes } = current;
  if (current.userVote === "upvote") upvotes -= 1;
  if (current.userVote === "downvote") downvotes -= 1;
  const userVote = current.userVote === clicked ? null : clicked;
  if (userVote === "upvote") upvotes += 1;
  if (userVote === "downvote") downvotes += 1;
  return { upvotes, downvotes, netScore: upvotes - downvotes, userVote };
};

/** `+3`, `0`, `-2` — the old score label. */
export const formatNetScore = (net: number): string =>
  net > 0 ? `+${net}` : `${net}`;

const textOf = (node: unknown): string => {
  if (typeof node !== "object" || node === null) return "";
  const record = node as { text?: unknown; children?: unknown };
  const own = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.children)
    ? record.children.map(textOf).join("")
    : "";
  return own + children;
};

/**
 * The editor's state, or `undefined` when it holds no words. An emptied
 * editor still serializes a paragraph; storing that would render as a blank
 * review body and count as "text" for the old dirty check.
 */
export const reviewTextForSave = (
  state: string | undefined,
): string | undefined => {
  if (state === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(state);
    const root = (parsed as { root?: unknown } | null)?.root;
    return textOf(root).trim() === "" ? undefined : state;
  } catch {
    return state.trim() === "" ? undefined : state;
  }
};

/**
 * The recipe-photo job's stage as the old progress bar's percentage: 20 % per
 * stage reached (`EXTRACT` … `RECIPE`). Real progress, where the old bar
 * jumped 10 → 50 → 100 on a timer.
 */
export const stageProgress = (stage: string): number => {
  const index = (RECIPE_PHOTO_STAGES as readonly string[]).indexOf(stage);
  return index < 0 ? 0 : ((index + 1) / RECIPE_PHOTO_STAGES.length) * 100;
};

/**
 * The ai-generator's "Processing Complete" line. The old one
 * (`82450ad1:src/components/recipe/RecipePhotoProcessor.tsx:185`) read
 * "Successfully created N recipe(s) with M ingredients"; a photo now makes
 * exactly one recipe (G30 not built), so N is 1, and M is the generated
 * recipe's ingredient count once its read-back arrives — until then (or if
 * it fails) the line stops after "1 recipe" rather than print a wrong count.
 */
export const recipeCreatedLine = (ingredientCount: number | null): string =>
  ingredientCount === null
    ? "Successfully created 1 recipe"
    : `Successfully created 1 recipe with ${ingredientCount} ingredients`;
