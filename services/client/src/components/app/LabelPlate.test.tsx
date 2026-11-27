/**
 * LabelPlate (KIT amendments, "No-photo plate"): the name at 75 px and up,
 * the kind glyph below, on the raised well with no border; and B03's
 * style → vessel table, which the Pour sheet still draws.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_TYPE_ORDER } from "@/lib/tokens";
import { openTag, textOf } from "../../test-support/markup";
import { LabelPlate, vesselShape } from "./LabelPlate";
import {
  TYPE_VESSEL,
  VESSEL_NAMES,
  VESSEL_PATHS,
  VESSEL_RULES,
  vesselFor,
} from "./label-plate/silhouettes";

const full = {
  producer: "Vietti",
  name: "Barolo Castiglione",
  vintage: "2016",
  origin: "Piedmont",
  abv: "14%",
};

describe("LabelPlate (kit no-photo plate)", () => {
  test("75 px and up: the drink's name on an r8 card; under: the glyph", () => {
    const html = renderToStaticMarkup(<LabelPlate type="WINE" plate={full} />);
    assert.match(openTag(html, 'data-slot="label-plate"'), /bg-raised/);
    assert.match(openTag(html, 'data-slot="label-plate"'), /@container/);
    assert.match(html, /@min-\[75px\]:hidden/);
    assert.match(html, /@min-\[75px\]:flex/);
    assert.match(openTag(html, 'data-slot="label-plate-paper"'), /rounded-md/);
    assert.match(openTag(html, 'data-slot="label-plate-paper"'), /bg-card/);
    assert.equal(textOf(html), "Barolo Castiglione");
  });

  test("no border on the well (SHARED round 2)", () => {
    const html = renderToStaticMarkup(<LabelPlate type="BEER" plate={full} />);
    assert.doesNotMatch(openTag(html, 'data-slot="label-plate"'), /\bborder\b/);
    assert.doesNotMatch(
      openTag(html, 'data-slot="label-plate-paper"'),
      /\bborder\b/,
    );
  });

  test("decorative by default: hidden from assistive tech", () => {
    const root = openTag(
      renderToStaticMarkup(<LabelPlate type="WINE" plate={full} />),
      'data-slot="label-plate"',
    );
    assert.match(root, /aria-hidden="true"/);
    assert.doesNotMatch(root, /role="img"/);
  });

  test("labelled: an image named by its own text", () => {
    const root = openTag(
      renderToStaticMarkup(<LabelPlate type="WINE" plate={full} labelled />),
      'data-slot="label-plate"',
    );
    assert.match(root, /role="img"/);
    assert.match(root, /aria-label="Label: /);
  });

  test("each kind draws its own glyph; the recipe face its tumbler", () => {
    const glyphs = ITEM_TYPE_ORDER.map((type) => {
      const html = renderToStaticMarkup(
        <LabelPlate type={type} plate={{ name: "X" }} />,
      );
      assert.match(
        openTag(html, 'data-slot="label-plate"'),
        new RegExp(`data-type="${type}"`),
      );
      return /lucide-kit-([a-z]+)/.exec(html)?.[1];
    });
    assert.equal(new Set(glyphs).size, ITEM_TYPE_ORDER.length);
    const recipe = renderToStaticMarkup(
      <LabelPlate type="SPIRIT" face="recipe" plate={{ name: "Negroni" }} />,
    );
    assert.match(recipe, /lucide-kit-tumbler/);
    assert.match(recipe, /data-face="recipe"/);
  });

  test("the same plate renders the same markup (deterministic)", () => {
    const a = renderToStaticMarkup(<LabelPlate type="SAKE" plate={full} />);
    const b = renderToStaticMarkup(
      <LabelPlate type="SAKE" plate={{ ...full }} />,
    );
    assert.equal(a, b);
  });
});

/**
 * B03's style → vessel table, pinned row by row: a change to which style gets
 * which bottle is a change to this list, on purpose.
 */
describe("style → vessel table", () => {
  const cases = [
    // [type, fields, vessel]
    ["WINE", { style: "SPARKLING" }, "sparkling"],
    ["WINE", { style: "SPARKLING", variety: "CHARDONNAY" }, "sparkling"],
    ["WINE", { style: "RED", variety: "PINOT_NOIR" }, "burgundy"],
    ["WINE", { style: "WHITE", variety: "CHARDONNAY" }, "burgundy"],
    ["WINE", { style: "WHITE", variety: "RIESLING" }, "alsace"],
    ["WINE", { style: "WHITE", variety: "GEWURZTRAMINER" }, "alsace"],
    ["WINE", { style: "WHITE", variety: "Gewürztraminer" }, "alsace"],
    ["BEER", { style: "AMERICAN_IPA" }, "can"],
    ["BEER", { style: "India Pale Ale" }, "can"],
    ["BEER", { style: "SOUR" }, "can"],
    ["BEER", { style: "GOSE" }, "can"],
    ["BEER", { style: "VIENNA_LAGER" }, "stubby"],
    ["BEER", { style: "PILSENER_PILSNER_PILS" }, "stubby"],
    ["BEER", { style: "MUNICH_HELLES" }, "stubby"],
    ["SPIRIT", { style: "WHISKEY" }, "square"],
    ["SPIRIT", { style: "SCOTCH" }, "square"],
    ["SPIRIT", { style: "BOURBON" }, "square"],
    ["SPIRIT", { style: "RYE" }, "square"],
    ["SPIRIT", { style: "GIN" }, "tall"],
    ["SPIRIT", { style: "VODKA" }, "tall"],
    ["TEA", { style: "green", form: "tea_bag" }, "pouch"],
    ["TEA", { form: "sachet" }, "pouch"],
    ["TEA", { form: "matcha_powder" }, "pouch"],
    ["TEA", { form: "instant" }, "pouch"],
  ] as const;

  for (const [type, fields, vessel] of cases) {
    test(`${type} ${JSON.stringify(fields)} → ${vessel}`, () => {
      assert.equal(vesselFor(type, fields), vessel);
    });
  }

  test("every rule is exercised by a case above", () => {
    for (const rule of VESSEL_RULES) {
      assert.ok(
        cases.some(
          ([type, , vessel]) => type === rule.type && vessel === rule.vessel,
        ),
        `no case pins ${rule.type} → ${rule.vessel}`,
      );
    }
  });

  test("fallback: no fields, or an unknown style, gets the type's vessel", () => {
    for (const type of ITEM_TYPE_ORDER) {
      assert.equal(vesselFor(type), TYPE_VESSEL[type]);
      assert.equal(vesselFor(type, null), TYPE_VESSEL[type]);
      assert.equal(
        vesselFor(type, { style: "NOT_A_STYLE", variety: "X", form: "Y" }),
        TYPE_VESSEL[type],
      );
    }
    assert.deepEqual(TYPE_VESSEL, {
      WINE: "bordeaux",
      BEER: "tall-neck",
      SPIRIT: "decanter",
      SAKE: "tokkuri",
      COFFEE: "bag",
      TEA: "tin",
    });
  });

  test("a style rule only fires for its own type", () => {
    assert.equal(vesselFor("BEER", { style: "SPARKLING" }), "tall-neck");
    assert.equal(vesselFor("WINE", { style: "GIN" }), "bordeaux");
    // Whole words only: "ginger" is not gin.
    assert.equal(vesselFor("SPIRIT", { style: "GINGER_LIQUEUR" }), "decanter");
    assert.equal(vesselFor("TEA", { form: "loose_leaf" }), "tin");
  });

  test("fourteen vessels, each with its own outline", () => {
    assert.equal(VESSEL_NAMES.length, 14);
    const paths = new Set(VESSEL_NAMES.map((name) => VESSEL_PATHS[name].d));
    assert.equal(paths.size, VESSEL_NAMES.length);
  });

  test("vesselShape follows the style (the Pour sheet's vessel)", () => {
    assert.equal(
      vesselShape("BEER", { style: "AMERICAN_IPA" }).d,
      VESSEL_PATHS.can.d,
    );
    assert.equal(vesselShape("BEER", { style: "AMERICAN_IPA" }).name, "can");
    assert.equal(vesselShape("BEER").name, "tall-neck");
  });
});
