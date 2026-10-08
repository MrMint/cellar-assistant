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
  bandOf,
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
  /**
   * N08: how well the line's search text matched the candidate's **name**
   * (`ItemSearchHit.lexicalSimilarity`, on every item candidate; `null` for
   * a recipe). Evidence for the order, for the record and for telling a
   * winner from its siblings (`AUTO_LEXICAL_MARGIN`). On its own it never
   * lifts a candidate past the verifier; only a name *identical* to the
   * line's does that, with the vector agreeing (`planCandidates`).
   */
  readonly lexicalSimilarity?: number | null;
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
    // An item the name found that has no vector yet: "the name matched and
    // there is no vector opinion" is the bottom of the verification band, as
    // for a lexical-only recipe hit below — offered to the verifier, never
    // auto-suggested.
    similarity:
      hit.distance === null
        ? MATCH_MIN_CONFIDENCE
        : similarityFromDistance(hit.distance),
    lexicalSimilarity: hit.lexicalSimilarity ?? null,
    target,
  };
};

/**
 * What a line's candidates are for: suggesting as-is, or asking the verifier
 * about. `auto` is non-empty exactly when one candidate is a clear winner —
 * by vector similarity in the auto band, or by an identical name the vector
 * agrees with — and then `verify` is empty.
 */
export type CandidatePlan = {
  /** The one clear winner, or nothing. */
  readonly auto: readonly MenuMatchCandidate[];
  /** What made `auto` a winner; `null` when it is empty. */
  readonly autoBy: "vector" | "name" | null;
  /** Otherwise the first few in the search's order, for the verifier. */
  readonly verify: readonly MenuMatchCandidate[];
};

/**
 * The fewest vector similarity an identical name is auto-suggested with:
 * enough that the embedding agrees the line and the item are the same kind
 * of thing, not proof that they are the same bottle — the name is that.
 *
 * Measured on the local lane (nomic-embed-text, 2026-10-08), the catalog's
 * own "Guinness Draught", "Pilsner Urquell" and "Lagavulin 16 Year Old"
 * scored 0.888, 0.829 and 0.853 against menu lines with exactly those names
 * — every one under `MATCH_AUTO_CONFIDENCE`, so every one went to a verifier
 * that, on gemma3:4b, accepted none of them. A scanned menu matched nothing
 * at all. The nearest *other* beer was 0.807, 0.741 and 0.692.
 */
export const NAME_AUTO_MIN_SIMILARITY = 0.75;

/**
 * A name reduced to what a menu and a catalog both spell the same way: case,
 * accents, punctuation and spacing folded. "Château Margaux" and "chateau
 * margaux" are one name; "Lagavulin 16" and "Lagavulin 16 Year Old" are not.
 */
export const foldName = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Splits a line's search hits by band.
 *
 * **Auto** is decided by the vector similarity alone, wherever the candidate
 * sits in the list: a 0.95 match is confident even when the search ranked a
 * name match above it, and it is never sent to the verifier as if it were
 * ambiguous (the order of the hits must not matter to that). It must also be
 * a clear winner ({@link AUTO_MARGIN}) and then it is the one suggestion;
 * two candidates neither the vector nor the name can separate are siblings,
 * which is the verifier's job.
 *
 * **Auto by name** is the one way past the verifier from below the auto
 * band: a candidate whose name is identical to the line's, unambiguously
 * (`identicallyNamed`). A partial name match never does that.
 *
 * **Verify** keeps the search's own order rather than re-sorting by vector
 * similarity — `ItemSearchActor` ranked a phrase by vector and name together
 * (N08), and sorting by the vector half alone would undo exactly the cases
 * the name fixes: a sibling bottle the embedding puts a hair nearer than the
 * one the menu names. Which three are kept is all the verifier can choose
 * from, and the first is what it sees first. (`RecipeSearchActor`'s semantic
 * order is distance order, so a cocktail line is unchanged.)
 *
 * Drop-band candidates (`< 0.4`) take part in neither.
 */
export const planCandidates = (
  candidates: readonly MenuMatchCandidate[],
  lineNames: readonly string[] = [],
): CandidatePlan => {
  const kept = candidates.filter(
    (candidate) => bandOf(candidate.similarity) !== "drop",
  );
  const [best, ...rest] = [...kept].sort((a, b) => b.similarity - a.similarity);
  const clear =
    best !== undefined &&
    bandOf(best.similarity) === "auto" &&
    rest.every((other) => separated(best, other));
  if (clear) return { auto: [best], autoBy: "vector", verify: [] };

  const named = identicallyNamed(kept, lineNames);
  if (named !== null) return { auto: [named], autoBy: "name", verify: [] };

  return {
    auto: [],
    autoBy: null,
    verify: kept.slice(0, MENU_MATCH_MAX_CANDIDATES),
  };
};

/**
 * The verify-band candidate whose name **is** the line's — printed or
 * normalised — when that is unambiguous: the only candidate with that name,
 * at least {@link NAME_AUTO_MIN_SIMILARITY} by vector, and separated from
 * every other candidate as an auto-band winner must be (`separated`). Then
 * the verifier has nothing to decide: the menu names this product and the
 * catalog has one product by that name.
 *
 * What it does not admit, deliberately: a name that merely *contains* the
 * line ("Pilsner" for "Pilsner Urquell" — a house pilsner is not that), a
 * line naming a product the catalog has twice, and a sibling the vector puts
 * level with it and whose name matches the line as well (both "contain" it).
 * Those stay the verifier's.
 */
const identicallyNamed = (
  kept: readonly MenuMatchCandidate[],
  lineNames: readonly string[],
): MenuMatchCandidate | null => {
  const folded = new Set(lineNames.map(foldName).filter((name) => name !== ""));
  if (folded.size === 0) return null;
  const same = kept.filter((candidate) => folded.has(foldName(candidate.name)));
  const [only] = same;
  if (only === undefined || same.length > 1) return null;
  if (only.similarity < NAME_AUTO_MIN_SIMILARITY) return null;
  return kept.every((other) => other === only || separated(only, other))
    ? only
    : null;
};

/**
 * Whether `best` is told apart from `other` by the vector — at least
 * {@link AUTO_MARGIN} more similar — or, failing that, by the name — at
 * least {@link AUTO_LEXICAL_MARGIN} better a match for the line's text.
 */
const separated = (
  best: MenuMatchCandidate,
  other: MenuMatchCandidate,
): boolean =>
  best.similarity - other.similarity >= AUTO_MARGIN ||
  (best.lexicalSimilarity ?? 0) - (other.lexicalSimilarity ?? 0) >=
    AUTO_LEXICAL_MARGIN;

/**
 * How a line is suggested without the verifier (N08): the best candidate's
 * vector similarity is in the auto band, **and** every other candidate is
 * separated from it — by at least `AUTO_MARGIN` of vector similarity, or by
 * at least `AUTO_LEXICAL_MARGIN` of name match.
 *
 * Auto means *unambiguous*. The verifier exists to tell a bottle from its
 * siblings ("A different vintage, expression, or size … is not a match"), and
 * siblings are exactly what an embedding puts within a few hundredths of each
 * other — on the N05 eval with `nomic-embed-text`, 0.004 to 0.04. Before N08
 * the bare 0.9 band rarely fired; N08's richer embedded text raised
 * similarities, and a 2019 Caymus Special Selection then cleared it (0.902)
 * for a menu's "Caymus Cabernet Sauvignon 2021", the right bottle 0.012
 * behind and all three names matching the line equally. The vector cannot
 * separate those, nor the name, so it goes to the verifier. "Tanqueray London
 * Dry Gin" over Tanqueray No. Ten is as close by vector (0.021), but the name
 * matches one exactly and the other not at all, so it is still suggested
 * as-is. 0.05 of similarity is 0.1 of cosine distance.
 */
export const AUTO_MARGIN = 0.05;
export const AUTO_LEXICAL_MARGIN = 0.1;

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
