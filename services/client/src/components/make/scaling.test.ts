import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  baseServings,
  clampServings,
  ingredientName,
  MAX_SERVINGS,
  scaledAmount,
  scaleFactor,
  scaleQuantity,
} from "./scaling";

describe("Make mode scaling (ux-c L08)", () => {
  test("a recipe that says nothing serves one", () => {
    assert.equal(baseServings(null), 1);
    assert.equal(baseServings(undefined), 1);
    assert.equal(baseServings(0), 1);
    assert.equal(baseServings(4), 4);
  });

  test("servings are clamped to the stepper's range", () => {
    assert.equal(clampServings(0), 1);
    assert.equal(clampServings(99), MAX_SERVINGS);
    assert.equal(clampServings(Number.NaN), 1);
    assert.equal(clampServings(2.6), 3);
  });

  test("the factor is servings over what the recipe serves", () => {
    assert.equal(scaleFactor(3, 1), 3);
    assert.equal(scaleFactor(2, 4), 0.5);
    assert.equal(scaleFactor(6, 4), 1.5);
  });

  test("scaled quantities round to something a jigger can pour", () => {
    assert.equal(scaleQuantity(0.75, 3), 2.25);
    assert.equal(scaleQuantity(1, 1 / 3), 0.25);
    assert.equal(scaleQuantity(30, 3), 90);
    assert.equal(scaleQuantity(22.5, 1.5), 33.8);
  });

  test("measured lines scale; their printed text is kept at 1×", () => {
    const gin = { quantity: 30, unit: "ml", amount: "30 ml" };
    assert.equal(scaledAmount(gin, 1), "30 ml");
    assert.equal(scaledAmount(gin, 2), "60 ml");
    const oz = { quantity: 0.75, unit: "oz", amount: "¾ oz" };
    assert.equal(scaledAmount(oz, 2), "1½ oz");
  });

  test("a line with no number keeps its words and says how many times", () => {
    const dash = { quantity: null, unit: null, amount: "2 dashes" };
    assert.equal(scaledAmount(dash, 1), "2 dashes");
    assert.equal(scaledAmount(dash, 3), "2 dashes × 3");
    assert.equal(
      scaledAmount({ quantity: null, unit: null, amount: null }, 3),
      "",
    );
  });

  test("names come from the item, then the generic kind, then the label", () => {
    assert.equal(
      ingredientName({
        item: { id: "i", name: "Campari", type: "SPIRIT" },
        generic_item: null,
      }),
      "Campari",
    );
    assert.equal(
      ingredientName({ item: null, generic_item: { id: "g", name: "Gin" } }),
      "Gin",
    );
    assert.equal(
      ingredientName({ item: null, generic_item: null, kind_label: "Ice" }),
      "Ice",
    );
  });
});
