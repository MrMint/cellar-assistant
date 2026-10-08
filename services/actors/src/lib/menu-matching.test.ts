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
  foldName,
  itemHitToCandidate,
  NAME_AUTO_MIN_SIMILARITY,
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
      autoBy: null,
      verify: [],
    });
  });

  describe("an identical name below the auto band", () => {
    const named = (
      name: string,
      similarity: number,
      lexicalSimilarity: number | null,
    ): MenuMatchCandidate => ({
      ...candidate(name, similarity, lexicalSimilarity),
      name,
    });

    /**
     * Measured on the local lane: exact catalog names at 0.829–0.888, every
     * one sent to a verifier that accepted none, so a menu matched nothing.
     */
    it("auto-suggests the one candidate the menu names exactly", () => {
      const plan = planCandidates(
        [
          named("Guinness Draught", 0.888, 1),
          named("Guinness Extra Stout", 0.807, 0.47),
          named("Murphy's Irish Stout", 0.76, null),
        ],
        ["Guinness Draught", "GUINNESS DRAUGHT (pint)"],
      );
      expect(keys(plan.auto)).toEqual(["Guinness Draught"]);
      expect(plan.autoBy).toBe("name");
      expect(plan.verify).toEqual([]);
    });

    it("matches the printed name too, folding case, accents and punctuation", () => {
      const plan = planCandidates(
        [
          named("Château Margaux 2015", 0.86, 1),
          named("Château Margaux 2016", 0.85, 0.8),
        ],
        ["", "chateau margaux, 2015"],
      );
      expect(keys(plan.auto)).toEqual(["Château Margaux 2015"]);
      expect(foldName("  Château-Margaux 2015! ")).toBe("chateau margaux 2015");
    });

    it("never for a name that only contains the line's", () => {
      const plan = planCandidates(
        [named("Pilsner Urquell", 0.83, 1), named("Bud Light", 0.6, null)],
        ["Pilsner"],
      );
      expect(plan.auto).toEqual([]);
      expect(plan.autoBy).toBeNull();
      expect(keys(plan.verify)).toEqual(["Pilsner Urquell", "Bud Light"]);
    });

    it("never when the vector disagrees", () => {
      const plan = planCandidates(
        [named("Saison Dupont", NAME_AUTO_MIN_SIMILARITY - 0.01, 1)],
        ["Saison Dupont"],
      );
      expect(plan.auto).toEqual([]);
    });

    it("never for a name the catalog has twice", () => {
      const plan = planCandidates(
        [named("Duvel", 0.85, 1), named("duvel", 0.8, 1)],
        ["Duvel"],
      );
      expect(plan.auto).toEqual([]);
    });

    it("never past a sibling neither the vector nor the name separates", () => {
      // "Caymus Cabernet Sauvignon" is identical to the line, but the vintage
      // contains the line's words just as well and the vector puts it level.
      const plan = planCandidates(
        [
          named("Caymus Cabernet Sauvignon", 0.87, 1),
          named("Caymus Cabernet Sauvignon 2021", 0.86, 1),
        ],
        ["Caymus Cabernet Sauvignon"],
      );
      expect(plan.auto).toEqual([]);
      expect(plan.verify).toHaveLength(2);
    });

    it("leaves a line with no names to compare to the verifier", () => {
      expect(
        planCandidates([named("Guinness Draught", 0.888, 1)]).auto,
      ).toEqual([]);
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
