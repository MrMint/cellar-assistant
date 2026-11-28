import { describe, expect, it } from "vitest";
import {
  isPlaceCategory,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_TIERS,
} from "./place-categories.ts";

describe("PLACE_CATEGORIES (D15)", () => {
  it("is every tier, with no slug listed twice", () => {
    expect(PLACE_CATEGORIES).toEqual([
      ...PLACE_CATEGORY_TIERS.venues,
      ...PLACE_CATEGORY_TIERS.retail,
    ]);
    expect(new Set(PLACE_CATEGORIES).size).toBe(PLACE_CATEGORIES.length);
  });

  it("carries the six D15 added back", () => {
    for (const slug of [
      "wine_shop",
      "vineyard",
      "taproom",
      "coffee_roaster",
      "tea_shop",
      "izakaya",
    ]) {
      expect(isPlaceCategory(slug)).toBe(true);
    }
  });

  it("holds slugs only: lower snake case, never a label", () => {
    for (const slug of PLACE_CATEGORIES) {
      expect(slug).toMatch(/^[a-z][a-z_]*$/);
    }
    expect(isPlaceCategory("Wine Shop")).toBe(false);
  });
});
