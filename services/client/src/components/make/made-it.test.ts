/**
 * The Made it screen's "From your bar": the bottles a drink poured from, by
 * name, the swap said — and no level, since Made it changes no bottle (#677).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RecipeDetailsItem } from "@/components/recipe/adapter";
import { usedBottles } from "./MadeIt";

type Ingredient = RecipeDetailsItem["ingredients"][number];
const ing = (
  id: string,
  kind_label: string,
  availability: Ingredient["availability"],
) => ({ id, kind_label, availability }) as Ingredient;

describe("usedBottles", () => {
  test("bottles by name, swaps said, pantry and missing left out", () => {
    assert.deepEqual(
      usedBottles([
        ing("a", "White rum", {
          status: "SUBSTITUTE",
          source: "BOTTLE",
          label: "Demo Spiced Rum",
        }),
        ing("b", "Vodka", {
          status: "HAVE",
          source: "BOTTLE",
          label: "Demo Vodka",
        }),
        ing("c", "Lime", { status: "HAVE", source: "PANTRY", label: "Limes" }),
        ing("d", "Campari", { status: "MISSING" }),
      ]),
      [
        { id: "a", label: "Demo Spiced Rum", line: "Swap for white rum" },
        { id: "b", label: "Demo Vodka", line: "Vodka" },
      ],
    );
  });
});
