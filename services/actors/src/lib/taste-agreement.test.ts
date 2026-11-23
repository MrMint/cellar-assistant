import {
  AGREEMENT_MIN_SHARED,
  type ItemType,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import {
  agreementOf,
  archetypeOf,
  fallbackLine,
  scoresAgree,
  styleStats,
  type TasteRating,
  typeCounts,
} from "./taste-agreement.ts";

let next = 0;
const rate = (
  type: ItemType,
  score: number,
  style: string | null = null,
  itemId = `item-${++next}`,
): TasteRating => ({ type, itemId, score, style });

const many = (
  count: number,
  type: ItemType,
  score: number,
  style: string | null,
): TasteRating[] =>
  Array.from({ length: count }, () => rate(type, score, style));

describe("archetypeOf", () => {
  it("is null below ten ratings, whatever the styles", () => {
    const nine = [
      ...many(5, "WINE", 4.5, "Nebbiolo"),
      ...many(4, "BEER", 2, "Lager"),
    ];
    expect(archetypeOf(nine)).toBeNull();
    expect(fallbackLine(nine.length, null, 2)).toBe(
      "Rate 1 more item to see your archetype.",
    );
  });

  it("is null with fewer than two styles rated twice", () => {
    const ratings = [
      ...many(10, "WINE", 4, "Nebbiolo"),
      rate("BEER", 2, "Lager"),
    ];
    expect(archetypeOf(ratings)).toBeNull();
  });

  it("fixes the archetype from fixed ratings and styles: an explorer", () => {
    // 12 ratings across three types, mean 3.5, no style holding 40%.
    const ratings = [
      ...many(3, "WINE", 4.5, "Nebbiolo"),
      ...many(2, "WINE", 3, "Merlot"),
      ...many(3, "SPIRIT", 4, "Islay"),
      ...many(2, "COFFEE", 3, "WASHED"),
      ...many(2, "COFFEE", 2, "NATURAL"),
    ];
    const archetype = archetypeOf(ratings);
    expect(archetype?.key).toBe("EXPLORER");
    expect(archetype?.title).toBe("Cross-cellar explorer");
    expect(archetype?.loves.map((s) => s.label)).toEqual(["Nebbiolo", "Islay"]);
    expect(archetype?.lessKeen.map((s) => s.label)).toEqual([
      "NATURAL",
      "Merlot",
    ]);
    expect(fallbackLine(ratings.length, archetype ?? null, 3)).toBe(
      "You rate Nebbiolo and Islay highest and NATURAL lowest, across 3 types.",
    );
  });

  it("takes the rules in order: generous before devoted", () => {
    const ratings = [
      ...many(8, "WINE", 4.5, "Nebbiolo"),
      ...many(2, "WINE", 4.5, "Syrah"),
    ];
    expect(archetypeOf(ratings)?.key).toBe("GENEROUS");
  });

  it("names a hard-to-impress palate", () => {
    const ratings = [
      ...many(5, "BEER", 2, "Lager"),
      ...many(5, "BEER", 3, "Stout"),
    ];
    expect(archetypeOf(ratings)?.key).toBe("EXACTING");
  });

  it("names a devoted palate by its style", () => {
    const ratings = [
      ...many(5, "WINE", 4, "Riesling"),
      ...many(3, "WINE", 3, "Merlot"),
      ...many(2, "WINE", 3.5, "Syrah"),
    ];
    expect(archetypeOf(ratings)?.title).toBe("Devoted to Riesling");
  });

  it("names a decisive palate, then falls back to the top type", () => {
    const decisive = [
      ...many(3, "WINE", 5, "Riesling"),
      ...many(3, "WINE", 3, "Merlot"),
      ...many(3, "WINE", 2, "Syrah"),
      ...many(1, "BEER", 4, null),
    ];
    expect(archetypeOf(decisive)?.key).toBe("DECISIVE");

    const focused = [
      ...many(3, "WINE", 4, "Riesling"),
      ...many(3, "WINE", 3.5, "Merlot"),
      ...many(3, "WINE", 3, "Syrah"),
      ...many(1, "BEER", 3.5, null),
    ];
    expect(archetypeOf(focused)?.title).toBe("Wine first");
  });

  it("counts types and styles from the rows alone", () => {
    const ratings = [
      rate("WINE", 4, "Nebbiolo"),
      rate("WINE", 5, "Nebbiolo"),
      rate("BEER", 3, " "),
    ];
    expect(typeCounts(ratings)).toEqual([
      { type: "WINE", count: 2 },
      { type: "BEER", count: 1 },
    ]);
    expect(styleStats(ratings)).toEqual([
      { type: "WINE", label: "Nebbiolo", count: 2, average: 4.5 },
    ]);
  });
});

describe("agreementOf", () => {
  const pair = (count: number, agreeing: number) => {
    const mine: TasteRating[] = [];
    const theirs: TasteRating[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `shared-${i}`;
      mine.push(rate("WINE", 4, null, id));
      theirs.push(rate("WINE", i < agreeing ? 4.5 : 2.5, null, id));
    }
    // Rated by one side only: never shared.
    mine.push(rate("WINE", 4, null, "only-mine"));
    theirs.push(rate("BEER", 4, null, "only-theirs"));
    return { mine, theirs };
  };

  it("agrees within half a star, not beyond", () => {
    expect(scoresAgree(4, 4.5)).toBe(true);
    expect(scoresAgree(4, 3.5)).toBe(true);
    expect(scoresAgree(4, 3)).toBe(false);
  });

  it("counts 7 of 9 shared, never a percentage", () => {
    const { mine, theirs } = pair(9, 7);
    expect(agreementOf(mine, theirs)).toEqual({
      shared: 9,
      agreed: 7,
      byType: [{ type: "WINE", shared: 9, agreed: 7 }],
    });
  });

  it("withholds agreement at N-1 shared and shows it at N", () => {
    const below = pair(AGREEMENT_MIN_SHARED - 1, AGREEMENT_MIN_SHARED - 1);
    expect(agreementOf(below.mine, below.theirs)).toEqual({
      shared: AGREEMENT_MIN_SHARED - 1,
      agreed: null,
      byType: [],
    });
    const at = pair(AGREEMENT_MIN_SHARED, 2);
    expect(agreementOf(at.mine, at.theirs).agreed).toBe(2);
  });

  it("matches items by type as well as id", () => {
    const mine = [rate("WINE", 4, null, "x")];
    const theirs = [rate("BEER", 4, null, "x")];
    expect(agreementOf(mine, theirs).shared).toBe(0);
  });
});
