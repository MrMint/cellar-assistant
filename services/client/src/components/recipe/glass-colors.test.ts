/**
 * B03's ingredient → hue table, pinned: every phrase resolves to its own hue
 * (so no row is shadowed by an earlier, shorter one), the fallback is the
 * neutral hue, and five familiar drinks pour the colours the Main board shows.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type GlassIngredient,
  glassColors,
  HUE_COLOR,
  HUES,
  hueOfText,
  INGREDIENT_HUES,
  ingredientHue,
  volumeOf,
} from "./glass-colors";
import { RecipePlate, RecipeThumb } from "./RecipePlate";

const line = (
  name: string,
  quantity: number | null,
  unit: string | null,
  role: string | null = null,
): GlassIngredient => ({
  quantity,
  unit,
  role,
  generic_item: { name },
});

describe("ingredient → hue table", () => {
  for (const [phrase, hue] of INGREDIENT_HUES) {
    test(`"${phrase}" → ${hue}`, () => {
      assert.equal(hueOfText(phrase), hue);
      // Case, accents and punctuation do not matter.
      assert.equal(hueOfText(` ${phrase.toUpperCase()} juice.`), hue);
    });
  }

  test("each phrase appears once", () => {
    const phrases = INGREDIENT_HUES.map(([phrase]) => phrase);
    assert.equal(new Set(phrases).size, phrases.length);
  });

  test("the table's size, so an added or dropped row is deliberate", () => {
    assert.equal(INGREDIENT_HUES.length, 94);
  });

  test("fallback: an unknown ingredient is the neutral hue", () => {
    assert.equal(hueOfText("Falernum"), "neutral");
    assert.equal(hueOfText(""), "neutral");
    assert.equal(ingredientHue({}), "neutral");
    assert.equal(
      ingredientHue({ item: { name: "Mystery bottle", type: "SPIRIT" } }),
      "neutral",
    );
  });

  test("whole words, and accents folded", () => {
    assert.equal(hueOfText("Ginger syrup"), "clear"); // not gin, the syrup
    assert.equal(hueOfText("Blue Curaçao"), "blue");
    assert.equal(hueOfText("Curaçao"), "clear");
    assert.equal(hueOfText("Tequila añejo"), "gold");
  });

  test("the bar kind outranks the bottle's own name; then the bottle's type", () => {
    assert.equal(
      ingredientHue({
        kind_label: "Sweet vermouth",
        item: { name: "Carpano Antica", type: "WINE" },
      }),
      "red",
    );
    assert.equal(
      ingredientHue({ item: { name: "Rothaus Tannenzäpfle", type: "BEER" } }),
      "amber",
    );
    assert.equal(
      ingredientHue({ item: { name: "Dassai 45", type: "SAKE" } }),
      "clear",
    );
  });

  test("every hue is drawn from tokens, never a raw colour", () => {
    assert.deepEqual(Object.keys(HUE_COLOR).sort(), [...HUES].sort());
    for (const value of Object.values(HUE_COLOR)) {
      assert.match(value, /var\(--ca-[a-z0-9-]+\)/);
      assert.doesNotMatch(value, /#|rgb|hsl/);
    }
  });
});

describe("glassColors", () => {
  test("Negroni: red body, red top (gin is clear, so it never leads)", () => {
    assert.deepEqual(
      glassColors([
        line("Campari", 1, "oz"),
        line("Gin", 1, "oz"),
        line("Sweet vermouth", 1, "oz"),
        line("Orange peel", 1, null, "garnish"),
      ]),
      { base: "red", top: "clear" },
    );
  });

  test("Margarita: citrus body over a clear top", () => {
    assert.deepEqual(
      glassColors([
        line("Tequila", 2, "oz"),
        line("Lime juice", 1, "oz"),
        line("Cointreau", 1, "oz"),
      ]),
      { base: "citrus", top: "clear" },
    );
  });

  test("Old Fashioned: amber body, the bitters' red as the top", () => {
    assert.deepEqual(
      glassColors([
        line("Angostura bitters", 2, "dashes"),
        line("Bourbon", 2, "oz"),
        line("Simple syrup", 1, "tsp"),
      ]),
      { base: "amber", top: "red" },
    );
  });

  test("Espresso Martini: coffee body, clear top", () => {
    assert.deepEqual(
      glassColors([
        line("Vodka", 2, "oz"),
        line("Espresso", 1, "oz"),
        line("Coffee liqueur", 0.5, "oz"),
      ]),
      { base: "coffee", top: "clear" },
    );
  });

  test("Mojito: the bigger pour leads, the next hue is the top", () => {
    assert.deepEqual(
      glassColors([
        line("Lime juice", 1, "oz"),
        line("Mint leaves", 8, null),
        line("White rum", 2, "oz"),
        line("Soda water", 2, "oz"),
      ]),
      { base: "green", top: "citrus" },
    );
  });

  test("one hue fills both; nothing at all is neutral", () => {
    assert.deepEqual(glassColors([line("Campari", 2, "oz")]), {
      base: "red",
      top: "red",
    });
    assert.deepEqual(glassColors([]), { base: "neutral", top: "neutral" });
    assert.deepEqual(glassColors(null), { base: "neutral", top: "neutral" });
    assert.deepEqual(glassColors([line("Falernum", 1, "oz")]), {
      base: "neutral",
      top: "neutral",
    });
  });

  test("equal pours resolve by the order they came in (deterministic)", () => {
    const a = [line("Aperol", 1, "oz"), line("Campari", 1, "oz")];
    assert.deepEqual(glassColors(a), { base: "orange", top: "red" });
    assert.deepEqual(glassColors([...a].reverse()), {
      base: "red",
      top: "orange",
    });
  });

  test("volumes: units, a missing quantity, a garnish", () => {
    assert.equal(volumeOf(line("x", 2, "oz")), 60);
    assert.equal(volumeOf(line("x", 3, "cl")), 30);
    assert.equal(volumeOf(line("x", 1, "Tbsp.")), 15);
    assert.equal(volumeOf(line("x", null, "oz")), 30);
    assert.equal(volumeOf(line("x", 2, "sprigs")), 20);
    assert.equal(volumeOf(line("x", 2, "oz", "garnish")), 0);
  });
});

describe("RecipePlate", () => {
  test("the kit's recipe face: a label plate with the tumbler and the name", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePlate, {
        name: "Negroni",
        type: "cocktail",
        ingredients: [line("Campari", 1, "oz"), line("Gin", 1, "oz")],
      }),
    );
    assert.match(html, /data-slot="label-plate"/);
    assert.match(html, /data-face="recipe"/);
    assert.match(html, /lucide-kit-tumbler/);
    assert.match(html, />Negroni</);
    assert.doesNotMatch(html, /data-glass=/, "no coupe any more");
  });

  test("labelled, the plate is an image named by the recipe; food keeps its type", () => {
    const labelled = renderToStaticMarkup(
      createElement(RecipePlate, {
        name: "X",
        type: "cocktail",
        labelled: true,
      }),
    );
    assert.match(labelled, /role="img" aria-label="X"/);
    const food = renderToStaticMarkup(
      createElement(RecipePlate, { name: "Stew", type: "food" }),
    );
    assert.match(food, /data-recipe-type="food"/);
    assert.match(food, /aria-hidden="true"/);
  });

  test("the thumb is the same plate, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeThumb, { type: "cocktail" }),
    );
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /data-face="recipe"/);
    assert.match(
      renderToStaticMarkup(createElement(RecipeThumb, { type: "food" })),
      /data-recipe-type="food"/,
    );
  });
});
