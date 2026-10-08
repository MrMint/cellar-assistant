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
  MATCH_MIN_CONFIDENCE,
  SCANNED_ITEM_TYPES,
  type ScannedItemType,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import type { MenuMatchCandidate } from "./menu-matching.ts";
import {
  AUTO_LEXICAL_MARGIN,
  AUTO_MARGIN,
  itemHitToCandidate,
  planCandidates,
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
  it.each(SCANNED_ITEM_TYPES.filter((type) => type !== "cocktail"))(
    "narrows a %s line to exactly its own item type",
    (type) => {
      const route = routeFor(type, "Something");
      expect(route.kind).toBe("ITEM");
      if (route.kind !== "ITEM") return;
      expect(route.input.itemTypes).toEqual(EXPECTED_ITEM_TYPES[type]);
    },
  );

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

describe("planCandidates (N08)", () => {
  const candidate = (
    id: string,
    similarity: number,
    lexicalSimilarity: number | null = null,
  ): MenuMatchCandidate => ({
    key: `WINE:${id}`,
    name: id,
    similarity,
    lexicalSimilarity,
    target: { kind: "ITEM", item: { type: "WINE", id } },
  });
  const keys = (list: readonly MenuMatchCandidate[]) => list.map((c) => c.name);

  it("keeps the search's order for the verifier instead of re-sorting by vector", () => {
    // The search fused vector and name: the named sibling first, though the
    // embedding put another a hair nearer.
    const plan = planCandidates([
      candidate("named", 0.8),
      candidate("nearer", 0.82),
      candidate("third", 0.7),
      candidate("fourth", 0.75),
    ]);
    expect(plan.auto).toEqual([]);
    expect(keys(plan.verify)).toEqual(["named", "nearer", "third"]);
  });

  it("auto-suggests the clear vector winner wherever it sits", () => {
    const plan = planCandidates([
      candidate("named", 0.8),
      candidate("surer", 0.97),
    ]);
    expect(keys(plan.auto)).toEqual(["surer"]);
    expect(plan.verify).toEqual([]);
  });

  /**
   * The N05 case: a sibling clears the auto band with the right bottle a
   * hair behind. Two candidates that close are what the verifier is for.
   */
  it("asks the verifier when the runner-up is within the margin, even in the auto band", () => {
    const close = planCandidates([
      candidate("sibling", 0.91),
      candidate("right", 0.9),
    ]);
    expect(close.auto).toEqual([]);
    expect(keys(close.verify)).toEqual(["sibling", "right"]);
    const nearMargin = planCandidates([
      candidate("best", 0.95),
      candidate("second", 0.95 - AUTO_MARGIN / 2),
    ]);
    expect(nearMargin.auto).toEqual([]);
    const clear = planCandidates([
      candidate("best", 0.95),
      candidate("second", 0.95 - AUTO_MARGIN - 0.001),
    ]);
    expect(keys(clear.auto)).toEqual(["best"]);
  });

  it("lets the name separate what the vector cannot — Tanqueray over No. Ten, not Caymus over Caymus", () => {
    const tanqueray = planCandidates([
      candidate("tanqueray", 0.903, 1),
      candidate("tanqueray-ten", 0.882, null),
    ]);
    expect(keys(tanqueray.auto)).toEqual(["tanqueray"]);

    const caymus = planCandidates([
      candidate("special-selection-2019", 0.902, 0.66),
      candidate("napa-2021", 0.89, 0.66),
      candidate("napa-2019", 0.886, 0.66),
    ]);
    expect(caymus.auto).toEqual([]);
    expect(caymus.verify).toHaveLength(3);
  });

  it("checks every close candidate, not just the runner-up", () => {
    // The runner-up is separated by name; the third is as close by vector
    // and matches the name as well as the best does.
    const plan = planCandidates([
      candidate("best", 0.92, 1),
      candidate("runner-up", 0.91, 0.5),
      candidate("third", 0.905, 1),
    ]);
    expect(plan.auto).toEqual([]);
    expect(AUTO_LEXICAL_MARGIN).toBeGreaterThan(0);
  });

  it("drops the drop band from both", () => {
    const plan = planCandidates([candidate("weak", 0.3), candidate("ok", 0.6)]);
    expect(keys(plan.verify)).toEqual(["ok"]);
    expect(planCandidates([candidate("weak", 0.3)])).toEqual({
      auto: [],
      verify: [],
    });
  });

  it("carries an item hit's lexical similarity onto the candidate", () => {
    expect(
      itemHitToCandidate({
        type: "WINE",
        id: "w",
        name: "W",
        distance: 0.4,
        lexicalSimilarity: 0.9,
      }).lexicalSimilarity,
    ).toBe(0.9);
    expect(
      itemHitToCandidate({ type: "WINE", id: "w", name: "W", distance: 0.4 })
        .lexicalSimilarity,
    ).toBeNull();
  });

  it("puts an item found by name with no vector at the bottom of the verify band", () => {
    const candidate = itemHitToCandidate({
      type: "TEA",
      id: "t",
      name: "Tie Guan Yin",
      distance: null,
      lexicalSimilarity: 1,
    });
    expect(candidate.similarity).toBe(MATCH_MIN_CONFIDENCE);
    expect(bandOf(candidate.similarity)).toBe("verify");
    expect(planCandidates([candidate]).verify).toHaveLength(1);
  });
});
