/**
 * Routing a scanned menu line to the right C1 search actor — B8.
 *
 * > `match` (system: vector match via `ItemSearchActor` / `RecipeSearchActor`,
 * > AI verification in the 0.4–0.9 band)  — §2.1
 *
 * Two things live here and nothing else:
 *
 *  1. **`routeFor`** — the pure decision. A `cocktail` line is matched against
 *     `recipe_vectors` through `RecipeSearchActor`; every other type against
 *     `item_vectors` through `ItemSearchActor`, narrowed to that one item type
 *     so a wine line never ranks against coffees. `unknown` searches all six.
 *     It is a pure function of the line so `menu-match-job-actor.test.ts` can
 *     assert the *routing* rather than merely that something matched.
 *  2. **`MenuSearcher`** — the seam that actually invokes those actors, so a
 *     test can drive the job without a sidecar. `daprMenuSearcher` is the
 *     production implementation.
 *
 * ## Why this is not a method on `MenuScanActor`
 *
 * §8.5: "Entity actors never call collection, view, or search actors
 * synchronously except `CellarActor` → `EmbeddingActor`." `MenuScanActor` is
 * an entity actor, and the outbox cannot carry a *result* back, so an
 * outbox-mediated search is not an option either. The caller is therefore
 * `MenuMatchJobActor`, and §8.5's "job → entity / registry / search" is the
 * edge that makes both halves of its work legal.
 *
 * ## Addressing a search actor
 *
 * A search actor's id *is* the hash of its input (§1.5), and
 * `SearchActorBase` re-derives that hash from the input it is handed and
 * refuses a mismatch. So the id must come from the same builder in
 * `@cellar-assistant/contracts` that `services/api` uses — never from a local
 * copy. Both of these searches are viewer-insensitive (§2.3), so the viewer
 * argument is `null` and the activation is shared with every other caller
 * searching for the same phrase, which is the point of the cache.
 */
import type {
  Ctx,
  ItemSearchHit,
  ItemSearchInput,
  ItemType,
  MatchSuggestionTarget,
  RecipeSearchHit,
  RecipeSearchInput,
  ScannedItemType,
} from "@cellar-assistant/contracts";
import {
  distanceFromSimilarity,
  ItemSearchActorDescriptor,
  itemSearchActorId,
  MATCH_MIN_CONFIDENCE,
  MENU_MATCH_MAX_CANDIDATES,
  RecipeSearchActorDescriptor,
  recipeSearchActorId,
  similarityFromDistance,
} from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

/** The widest distance a candidate may have and still clear `0.4`. */
export const MENU_MATCH_MAX_DISTANCE =
  distanceFromSimilarity(MATCH_MIN_CONFIDENCE);

/** `ScannedItemType` → the `ItemType` `ItemSearchActor` filters on. */
const ITEM_TYPE_OF: Partial<Record<ScannedItemType, ItemType>> = {
  wine: "WINE",
  beer: "BEER",
  spirit: "SPIRIT",
  coffee: "COFFEE",
  sake: "SAKE",
  tea: "TEA",
};

export type MenuMatchRoute =
  | { readonly kind: "RECIPE"; readonly input: RecipeSearchInput }
  | { readonly kind: "ITEM"; readonly input: ItemSearchInput };

/**
 * Which vector table this line is matched against, and with what input.
 *
 * Deliberately total over `ScannedItemType`: a type the extractor invents is
 * not silently dropped, it falls into the `unknown` branch and searches every
 * item type.
 */
export const routeFor = (
  itemType: ScannedItemType,
  searchText: string,
): MenuMatchRoute => {
  if (itemType === "cocktail") {
    return {
      kind: "RECIPE",
      input: {
        semanticQuery: searchText,
        // `recipes.type` is `food | cocktail`; a drink on a menu is never the
        // former, and narrowing here is what makes "a cocktail routes to
        // recipe matching" an assertion rather than a coincidence.
        type: "cocktail",
        maxDistance: MENU_MATCH_MAX_DISTANCE,
        limit: MENU_MATCH_MAX_CANDIDATES,
      },
    };
  }
  const narrowed = ITEM_TYPE_OF[itemType];
  return {
    kind: "ITEM",
    input: {
      text: searchText,
      itemTypes: narrowed === undefined ? null : [narrowed],
      maxDistance: MENU_MATCH_MAX_DISTANCE,
      limit: MENU_MATCH_MAX_CANDIDATES,
    },
  };
};

/** A search hit, converted to what a suggestion needs. */
export type MenuMatchCandidate = {
  /** Opaque handle the verifier echoes back. `WINE:<uuid>` / `RECIPE:<uuid>`. */
  readonly key: string;
  readonly name: string;
  /** 0–1. `1 - distance / 2`, the scale `confidence_score` stores. */
  readonly similarity: number;
  readonly target: MatchSuggestionTarget;
};

export const candidateKey = (target: MatchSuggestionTarget): string =>
  target.kind === "RECIPE"
    ? `RECIPE:${target.recipeId}`
    : `${target.item.type}:${target.item.id}`;

export const itemHitToCandidate = (hit: ItemSearchHit): MenuMatchCandidate => {
  const target: MatchSuggestionTarget = {
    kind: "ITEM",
    item: { type: hit.type, id: hit.id },
  };
  return {
    key: candidateKey(target),
    name: hit.name,
    similarity: similarityFromDistance(hit.distance),
    target,
  };
};

export const recipeHitToCandidate = (
  hit: RecipeSearchHit,
): MenuMatchCandidate => {
  const target: MatchSuggestionTarget = {
    kind: "RECIPE",
    recipeId: hit.recipeId,
  };
  return {
    key: candidateKey(target),
    name: hit.name,
    // A lexical-only recipe search returns no distance. Treat "the name
    // matched and we have no vector opinion" as exactly the top of the
    // verification band rather than as a confident match.
    similarity:
      hit.distance === null
        ? MATCH_MIN_CONFIDENCE
        : similarityFromDistance(hit.distance),
    target,
  };
};

/* -------------------------------------------------------------------------- */
/* The seam                                                                    */
/* -------------------------------------------------------------------------- */

export type MenuSearcher = {
  searchItems(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<readonly ItemSearchHit[]>;
  searchRecipes(
    ctx: Ctx,
    input: RecipeSearchInput,
  ): Promise<readonly RecipeSearchHit[]>;
};

/**
 * The production searcher: two sidecar hops onto C1's actors, each bounded by
 * its descriptor's `all` timeout.
 *
 * `all` rather than `results` — the caps above already bound the answer to
 * three rows, so paging it would be two round trips for the same data.
 */
export const daprMenuSearcher: MenuSearcher = {
  searchItems: (ctx, input) =>
    internal(ctx)(
      ItemSearchActorDescriptor,
      itemSearchActorId(input, null),
    ).all(input),
  searchRecipes: (ctx, input) =>
    internal(ctx)(
      RecipeSearchActorDescriptor,
      recipeSearchActorId(input, null),
    ).all(input),
};
