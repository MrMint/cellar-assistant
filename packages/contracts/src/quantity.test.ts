import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatQuantity,
  ingredientAmount,
  prettifyQuantityText,
} from "./quantity.ts";

describe("formatAmount: Unicode fractions, never invented ones", () => {
  it.each([
    [2, "2"],
    [0.5, "½"],
    [1.5, "1½"],
    [0.75, "¾"],
    [0.25, "¼"],
    [0.33, "⅓"],
    [0.333_333, "⅓"],
    [0.67, "⅔"],
    [2.125, "2⅛"],
    [0.875, "⅞"],
  ])("%s → %s", (value, expected) => {
    expect(formatAmount(value)).toBe(expected);
  });

  it("keeps a decimal no fraction is close to, rather than rounding into one", () => {
    expect(formatAmount(0.3)).toBe("0.3");
    expect(formatAmount(1.45)).toBe("1.45");
  });

  it("rounds float noise to the whole number it is", () => {
    expect(formatAmount(1.999_999)).toBe("2");
  });
});

describe("formatQuantity", () => {
  it("joins amount and unit", () => {
    expect(formatQuantity(1.5, "oz")).toBe("1½ oz");
    expect(formatQuantity(2, "dashes")).toBe("2 dashes");
  });

  it("keeps metric units decimal", () => {
    expect(formatQuantity(22.5, "ml")).toBe("22.5 ml");
    expect(formatQuantity(7.5, "cl")).toBe("7.5 cl");
  });

  it("prints what there is", () => {
    expect(formatQuantity(2, null)).toBe("2");
    expect(formatQuantity(null, "dash")).toBe("dash");
    expect(formatQuantity(null, null)).toBe("");
    expect(formatQuantity(undefined, "  ")).toBe("");
  });
});

describe("prettifyQuantityText", () => {
  it.each([
    ["1 1/2 oz", "1½ oz"],
    ["1-1/2 oz", "1½ oz"],
    ["3/4 oz", "¾ oz"],
    ["top with 1/2 oz soda", "top with ½ oz soda"],
    ["2  dashes", "2 dashes"],
  ])("%s → %s", (text, expected) => {
    expect(prettifyQuantityText(text)).toBe(expected);
  });

  it("leaves fractions it has no glyph for exactly as written", () => {
    expect(prettifyQuantityText("7/16 oz")).toBe("7/16 oz");
    expect(prettifyQuantityText("a splash")).toBe("a splash");
  });
});

describe("ingredientAmount", () => {
  it("prefers the printed text", () => {
    expect(
      ingredientAmount({ quantityText: "3/4 oz", quantity: 0.7, unit: "oz" }),
    ).toBe("¾ oz");
  });

  it("falls back to the numbers", () => {
    expect(
      ingredientAmount({ quantityText: " ", quantity: 0.75, unit: "oz" }),
    ).toBe("¾ oz");
    expect(ingredientAmount({ quantity: null, unit: null })).toBe("");
  });
});
