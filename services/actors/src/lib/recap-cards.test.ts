/**
 * L04 — card selection at each threshold's edge (threshold - 1 is skipped,
 * threshold is shown), stamp computation, and the "distinct things only"
 * rule: no card or stamp counts logs, frequency or volume.
 */
import type { ItemType, RecapLogRow } from "@cellar-assistant/contracts";
import {
  BREADTH_STAMP_KINDS,
  BREADTH_STAMP_TIERS,
  RECAP_CARD_KINDS,
  RECAP_CARD_THRESHOLDS,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import {
  computeStamps,
  displayValue,
  selectRecapCards,
  stampTier,
} from "./recap-cards.ts";

const TYPES: readonly ItemType[] = [
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
];

let serial = 0;
const item = (fields: Partial<RecapLogRow> = {}): RecapLogRow => {
  serial += 1;
  return {
    itemType: "WINE",
    itemId: `item-${serial}`,
    recipeId: null,
    name: `Item ${serial}`,
    style: null,
    region: null,
    score: null,
    inPeriod: true,
    ...fields,
  };
};
const recipe = (fields: Partial<RecapLogRow> = {}): RecapLogRow => {
  serial += 1;
  return {
    itemType: null,
    itemId: null,
    recipeId: `recipe-${serial}`,
    name: `Recipe ${serial}`,
    style: "should not count",
    region: "should not count",
    score: 5,
    inPeriod: true,
    ...fields,
  };
};
const times = <T>(n: number, make: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => make(i));

const kinds = (rows: readonly RecapLogRow[]) =>
  selectRecapCards(rows).map((card) => card.kind);
const cardOf = (rows: readonly RecapLogRow[], kind: string) =>
  selectRecapCards(rows).find((card) => card.kind === kind);

describe("selectRecapCards thresholds", () => {
  it("NEW_TO_YOU: skipped at threshold - 1, shown at threshold", () => {
    const n = RECAP_CARD_THRESHOLDS.NEW_TO_YOU;
    expect(kinds(times(n - 1, () => item()))).not.toContain("NEW_TO_YOU");
    const card = cardOf(
      times(n, () => item()),
      "NEW_TO_YOU",
    );
    expect(card?.count).toBe(n);
  });

  it("NEW_TO_YOU: an item logged before the period is not new", () => {
    const n = RECAP_CARD_THRESHOLDS.NEW_TO_YOU;
    const old = item({ inPeriod: false });
    const rows = [
      old,
      { ...old, inPeriod: true },
      ...times(n - 1, () => item()),
    ];
    expect(kinds(rows)).not.toContain("NEW_TO_YOU");
  });

  it("TYPES: skipped at threshold - 1, shown at threshold", () => {
    const n = RECAP_CARD_THRESHOLDS.TYPES;
    const rows = (count: number) =>
      times(count, (i) => item({ itemType: TYPES[i] }));
    expect(kinds(rows(n - 1))).not.toContain("TYPES");
    expect(cardOf(rows(n), "TYPES")?.count).toBe(n);
    expect(cardOf(rows(n), "TYPES")?.itemTypes).toEqual(TYPES.slice(0, n));
  });

  it("STYLES: skipped at threshold - 1, shown at threshold, new counted", () => {
    const n = RECAP_CARD_THRESHOLDS.STYLES;
    const rows = (count: number) =>
      times(count, (i) => item({ style: `Style ${i}` }));
    expect(kinds(rows(n - 1))).not.toContain("STYLES");
    const prior = item({ style: "Style 0", inPeriod: false });
    const card = cardOf([prior, ...rows(n)], "STYLES");
    expect(card?.count).toBe(n);
    expect(card?.newCount).toBe(n - 1);
  });

  it("F-50: STYLES chips use the taste profile's style labels, not raw values", () => {
    const n = RECAP_CARD_THRESHOLDS.STYLES;
    const raw = ["pu_erh", "INDIA_PALE_ALE", "mate"];
    const rows = times(n, (i) => item({ style: raw[i] ?? `Style ${i}` }));
    const chips = cardOf(rows, "STYLES")?.chips ?? [];
    expect(chips).toEqual(
      expect.arrayContaining(["Pu-erh", "India pale ale", "Maté"]),
    );
    expect(chips.join(" ")).not.toMatch(/_|[A-Z]{2,}/);
  });

  it("REGIONS: skipped at threshold - 1, shown at threshold", () => {
    const n = RECAP_CARD_THRESHOLDS.REGIONS;
    const rows = (count: number) =>
      times(count, (i) => item({ region: `Region ${i}` }));
    expect(kinds(rows(n - 1))).not.toContain("REGIONS");
    expect(cardOf(rows(n), "REGIONS")?.count).toBe(n);
  });

  it("RECIPES: skipped at threshold - 1, shown at threshold", () => {
    const n = RECAP_CARD_THRESHOLDS.RECIPES;
    expect(kinds(times(n - 1, () => recipe()))).not.toContain("RECIPES");
    expect(
      cardOf(
        times(n, () => recipe()),
        "RECIPES",
      )?.count,
    ).toBe(n);
  });

  it("TOP_RATED: skipped at threshold - 1, shown at threshold, best first", () => {
    const n = RECAP_CARD_THRESHOLDS.TOP_RATED;
    const rows = (count: number) =>
      times(count, (i) => item({ score: i + 1, name: `Scored ${i + 1}` }));
    expect(kinds(rows(n - 1))).not.toContain("TOP_RATED");
    const card = cardOf(rows(n), "TOP_RATED");
    expect(card?.count).toBe(n);
    expect(card?.chips[0]).toBe(`Scored ${n}`);
  });

  it("an empty period is an empty deck, not a padded one", () => {
    expect(selectRecapCards([])).toEqual([]);
    expect(
      selectRecapCards(times(20, () => item({ inPeriod: false }))),
    ).toEqual([]);
  });

  it("STAMP: shown when a tier is crossed in the period, not when held before", () => {
    const tier = BREADTH_STAMP_TIERS.STYLES[0] ?? 0;
    const before = times(tier - 1, (i) =>
      item({ style: `S${i}`, inPeriod: false }),
    );
    const crossing = [...before, item({ style: "Crossing" })];
    const stampCard = cardOf(crossing, "STAMP");
    expect(stampCard?.stamp).toEqual({ kind: "STYLES", count: tier, tier });
    const allBefore = [
      ...before,
      item({ style: "Crossing", inPeriod: false }),
      item({ style: "S0" }),
    ];
    expect(kinds(allBefore)).not.toContain("STAMP");
  });
});

describe("distinct things only", () => {
  it("the same item logged many times is one thing", () => {
    const one = item({ style: "Rioja", region: "Spain", score: 4 });
    const rows = times(50, () => ({ ...one }));
    expect(selectRecapCards(rows)).toEqual([]);
    expect(computeStamps(rows)).toEqual([]);
  });

  it("recipe logs count only toward recipes made", () => {
    const rows = times(BREADTH_STAMP_TIERS.RECIPES[0] ?? 0, () => recipe());
    expect(kinds(rows)).toEqual(["RECIPES", "STAMP"]);
    const stamps = computeStamps(rows);
    expect(stamps.map((stamp) => stamp.kind)).toEqual(["RECIPES"]);
  });

  it("a log with no target (deleted bottle or recipe) counts toward nothing", () => {
    const orphan: RecapLogRow = {
      itemType: null,
      itemId: null,
      recipeId: null,
      name: null,
      style: "x",
      region: "y",
      score: 5,
      inPeriod: true,
    };
    expect(selectRecapCards(times(30, () => ({ ...orphan })))).toEqual([]);
  });

  it("no card or stamp kind is a volume or frequency kind", () => {
    const forbidden =
      /LOG|DRINK|POUR|COUNT|TOTAL|VOLUME|STREAK|FREQ|DAY|WEEK|BOTTLE|GLASS|ML|LITRE/;
    for (const kind of [...BREADTH_STAMP_KINDS, ...RECAP_CARD_KINDS]) {
      expect(kind).not.toMatch(forbidden);
    }
    expect([...BREADTH_STAMP_KINDS]).toEqual([
      "STYLES",
      "REGIONS",
      "TYPES",
      "RECIPES",
    ]);
  });
});

describe("computeStamps", () => {
  it("earns each tier exactly at its threshold", () => {
    for (const kind of BREADTH_STAMP_KINDS) {
      const first = BREADTH_STAMP_TIERS[kind][0] ?? 0;
      expect(stampTier(kind, first - 1)).toBeNull();
      expect(stampTier(kind, first)).toBe(first);
    }
  });

  it("counts distinct styles per type, regions across types", () => {
    const rows = [
      ...times(5, (i) => item({ itemType: "WINE", style: `V${i}` })),
      item({ itemType: "BEER", style: "V0" }),
      ...times(5, (i) => item({ region: i % 2 === 0 ? "jura" : " Jura " })),
    ];
    const stamps = computeStamps(rows);
    expect(stamps.find((stamp) => stamp.kind === "STYLES")).toEqual({
      kind: "STYLES",
      count: 6,
      tier: 5,
    });
    expect(stamps.find((stamp) => stamp.kind === "REGIONS")).toBeUndefined();
  });

  it("TYPES at three distinct types", () => {
    const rows = times(3, (i) => item({ itemType: TYPES[i] }));
    expect(computeStamps(rows)).toEqual([{ kind: "TYPES", count: 3, tier: 3 }]);
  });
});

describe("displayValue", () => {
  it("humanises enum values and leaves free text", () => {
    expect(displayValue("JUNMAI_DAIGINJO")).toBe("Junmai Daiginjo");
  });
  it("W-17: cases proper nouns and style names as the item page does", () => {
    expect(displayValue("UNITED_STATES")).toBe("United States");
    expect(displayValue("INDIA_PALE_ALE")).toBe("India Pale Ale");
    expect(displayValue("oolong")).toBe("Oolong");
    expect(displayValue("Côte de Nuits")).toBe("Côte de Nuits");
    expect(displayValue("Saint-Julien")).toBe("Saint-Julien");
  });
});
