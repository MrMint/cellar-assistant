/**
 * F-114 (H-87): the recipe index's spirit chips are the kinds the recipes
 * hold, each with its count (`recipeBaseSpiritCounts`), never the whole bar
 * vocabulary.
 */
import { describe, expect, test } from "vitest";
import { spiritChips } from "./recipe-spirit-chips";

const edge = (baseSpirit: string, count: number) => ({
  node: { baseSpirit, count },
});

describe("spiritChips: only kinds present, with their counts", () => {
  test("one chip per kind the server counts, in its order, labelled", () => {
    expect(spiritChips([edge("gin", 4), edge("rye", 1)], null)).toEqual([
      { value: "gin", label: "Gin", count: 4 },
      { value: "rye", label: "Rye whiskey", count: 1 },
    ]);
  });

  test("a kind with no recipes is not a chip", () => {
    expect(spiritChips([edge("gin", 2), edge("mezcal", 0)], null)).toEqual([
      { value: "gin", label: "Gin", count: 2 },
    ]);
  });

  test("no counts yet: no chips (never the static list)", () => {
    expect(spiritChips([], null)).toEqual([]);
  });

  test("the chip you picked stays, even when the term leaves it at none", () => {
    expect(spiritChips([edge("gin", 2)], "rye")).toEqual([
      { value: "gin", label: "Gin", count: 2 },
      { value: "rye", label: "Rye whiskey", count: 0 },
    ]);
  });
});
