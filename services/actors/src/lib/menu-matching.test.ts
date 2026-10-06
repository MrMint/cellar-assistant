/**
 * `routeFor` and the hit → candidate conversions, as pure functions — no
 * database, so these run whether or not the stack is up.
 *
 * `menu-match-job-actor.test.ts` covers the routing through the job, but only
 * for a handful of types; a mutation dropping `tea` from `ITEM_TYPE_OF`
 * survived every suite (a tea line would then have searched all six item
 * types). The table below is total over `SCANNED_ITEM_TYPES`, so a type added
 * there without a route here fails.
 */
import {
  bandOf,
  ITEM_TYPES,
  type ItemType,
  MATCH_AUTO_CONFIDENCE,
  SCANNED_ITEM_TYPES,
  type ScannedItemType,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import {
  itemHitToCandidate,
  recipeHitToCandidate,
  routeFor,
} from "./menu-matching.ts";

/** What each scanned type must be narrowed to — written out, not derived. */
const EXPECTED_ITEM_TYPES: Record<ScannedItemType, ItemType[] | null> = {
  wine: ["WINE"],
  beer: ["BEER"],
  spirit: ["SPIRIT"],
  coffee: ["COFFEE"],
  sake: ["SAKE"],
  tea: ["TEA"],
  // `cocktail` goes to recipe search (asserted separately); `unknown` searches
  // every item type.
  cocktail: null,
  unknown: null,
};

describe("routeFor", () => {
  it.each(
    SCANNED_ITEM_TYPES.filter((type) => type !== "cocktail"),
  )("narrows a %s line to exactly its own item type", (type) => {
    const route = routeFor(type, "Something");
    expect(route.kind).toBe("ITEM");
    if (route.kind !== "ITEM") return;
    expect(route.input.itemTypes).toEqual(EXPECTED_ITEM_TYPES[type]);
  });

  it("gives every item type a scanned type that routes to it alone", () => {
    const narrowed = SCANNED_ITEM_TYPES.flatMap((type) => {
      const route = routeFor(type, "x");
      return route.kind === "ITEM" && route.input.itemTypes?.length === 1
        ? route.input.itemTypes
        : [];
    });
    expect([...narrowed].sort()).toEqual([...ITEM_TYPES].sort());
  });

  it("sends a cocktail to recipe search", () => {
    expect(routeFor("cocktail", "Negroni").kind).toBe("RECIPE");
  });
});

describe("hit → candidate", () => {
  it("scores an item hit by 1 - distance / 2", () => {
    expect(
      itemHitToCandidate({
        type: "TEA",
        id: "t",
        name: "Sencha",
        distance: 0.1,
      }).similarity,
    ).toBeCloseTo(0.95, 10);
  });

  /**
   * A lexical-only recipe hit carries no distance. It must land at the top of
   * the *verification* band, never in the auto band: a name match with no
   * vector opinion is exactly the ambiguous case the verifier exists for.
   */
  it("puts a recipe hit with no distance in the verify band, not auto", () => {
    const candidate = recipeHitToCandidate({
      recipeId: "r",
      name: "Negroni",
      description: null,
      type: "cocktail",
      recipeGroupId: null,
      distance: null,
    });
    expect(bandOf(candidate.similarity)).toBe("verify");
    expect(candidate.similarity).toBeLessThan(MATCH_AUTO_CONFIDENCE);
  });
});
