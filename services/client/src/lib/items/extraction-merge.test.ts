/**
 * E2c's three form-side failures, as tests.
 *
 * Each `test` below is one of the things the browser run caught: a typed value
 * destroyed by a late extraction, the per-type bag read from the wrong path, and
 * a value silently dropped so that the form contradicted its own save error.
 *
 *   bun run test:unit
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type ExtractionField,
  type ExtractionValues,
  editedPaths,
  mergeExtractedDefaults,
} from "./extraction-merge.ts";

/** `ITEM_FORM_RULES.WINE.attributes`, trimmed to what these tests use. */
const WINE_FIELDS: readonly ExtractionField[] = [
  { key: "vintage", label: "Vintage", kind: "date" },
  { key: "style", label: "Style", kind: "reference" },
  { key: "region", label: "Region", kind: "text" },
  { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
];

const empty: ExtractionValues = {
  name: "",
  description: "",
  country: "",
  brandName: "",
  attributes: {},
};

const merge = (
  defaults: unknown,
  current: ExtractionValues = empty,
  edited: ReadonlySet<string> = new Set(),
) =>
  mergeExtractedDefaults({
    defaults,
    bagKey: "wine",
    fields: WINE_FIELDS,
    current,
    edited,
  });

describe("mergeExtractedDefaults", () => {
  test("fills an empty form from the nested per-type bag", () => {
    const result = merge({
      name: "Château Margaux",
      country: "FRANCE",
      wine: { vintage: "2015-06-01", style: "RED", region: "Margaux" },
    });

    assert.equal(result.values.name, "Château Margaux");
    assert.equal(result.values.country, "FRANCE");
    // The bug: the schema nests these and the wizard read them flat, so the two
    // NOT NULL fields were never pre-filled and the save then demanded them.
    assert.equal(result.values.attributes.vintage, "2015-06-01");
    assert.equal(result.values.attributes.style, "RED");
    assert.equal(result.values.attributes.region, "Margaux");
    assert.equal(result.skipped.length, 0);
  });

  test("still reads a flat answer, for a provider that ignores the nesting", () => {
    const result = merge({ name: "x", style: "WHITE" });
    assert.equal(result.values.attributes.style, "WHITE");
  });

  test("never overwrites a value the person typed", () => {
    const typed: ExtractionValues = {
      ...empty,
      name: "the bottle in my hand",
      attributes: { vintage: "1998-01-01", style: "DESSERT" },
    };
    const result = merge(
      {
        name: "Château d'Yquem",
        wine: { vintage: "2015-06-01", style: "SPARKLING" },
      },
      typed,
      new Set(["name", "attributes.vintage", "attributes.style"]),
    );

    assert.equal(result.values.name, "the bottle in my hand");
    assert.equal(result.values.attributes.vintage, "1998-01-01");
    assert.equal(result.values.attributes.style, "DESSERT");
    assert.equal(result.applied.length, 0);
    assert.deepEqual(result.skipped.map((entry) => entry.path).sort(), [
      "attributes.style",
      "attributes.vintage",
      "name",
    ]);
    for (const entry of result.skipped) assert.equal(entry.reason, "kept");
  });

  test("keeps an untouched field that already has a value", () => {
    const result = merge({ name: "model name" }, { ...empty, name: "mine" });
    assert.equal(result.values.name, "mine");
    assert.equal(result.skipped[0]?.reason, "kept");
  });

  test("does not apply a bare year to the date field, and says so", () => {
    const result = merge({ name: "x", wine: { vintage: "2018" } });

    assert.equal(result.values.attributes.vintage, undefined);
    const skipped = result.skipped.find(
      (entry) => entry.path === "attributes.vintage",
    );
    assert.equal(skipped?.reason, "unusable");
    assert.equal(skipped?.value, "2018");
    assert.match(skipped?.detail ?? "", /YYYY-MM-DD/);
  });

  test("does not apply a non-numeric ABV", () => {
    const result = merge({
      name: "x",
      wine: { alcoholContentPercentage: "about thirteen" },
    });
    assert.equal(result.values.attributes.alcoholContentPercentage, undefined);
    assert.equal(result.skipped[0]?.reason, "unusable");
  });

  test("coerces a numeric answer to the string the input holds", () => {
    const result = merge({
      name: "x",
      wine: { alcoholContentPercentage: 13.5 },
    });
    assert.equal(result.values.attributes.alcoholContentPercentage, "13.5");
  });

  test("ignores a defaults blob that is not an object", () => {
    for (const value of [null, undefined, "nope", 7, ["a"]]) {
      const result = merge(value);
      assert.deepEqual(result.values, empty);
      assert.equal(result.applied.length, 0);
    }
  });

  test("ignores blank and absent proposals rather than clearing a field", () => {
    const result = merge({ name: "   ", description: null }, { ...empty });
    assert.equal(result.values.name, "");
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped.length, 0);
  });
});

/**
 * The fourth E2c failure: a value the picker has no option for.
 *
 * `sake_serving_temperature` is the case that was live — `STATIC_OPTIONS` held
 * seven of the column's nine labels while X1b constrains the model to all nine,
 * so `yuki_hie` was a legal answer with nowhere to land. The list is fixed
 * (`static-options.test.ts` keeps it fixed); these tests are about the merge
 * refusing to write *any* value the picker cannot offer, so the next drift
 * surfaces as an unapplied proposal rather than as an `Autocomplete` showing
 * something nobody can choose again.
 */
describe("mergeExtractedDefaults · boolean proposals", () => {
  const TEA_FIELDS: readonly ExtractionField[] = [
    { key: "isOrganic", label: "Organic", kind: "boolean" },
    { key: "isFairTrade", label: "Fair Trade", kind: "boolean" },
  ];

  test("a JSON boolean is applied as the string the checkbox holds", () => {
    const result = mergeExtractedDefaults({
      defaults: { tea: { isOrganic: true, isFairTrade: false } },
      bagKey: "tea",
      fields: TEA_FIELDS,
      current: empty,
      edited: new Set(),
    });
    assert.equal(result.values.attributes.isOrganic, "true");
    assert.equal(result.values.attributes.isFairTrade, "false");
    assert.deepEqual(
      result.applied.map((entry) => entry.path),
      ["attributes.isOrganic", "attributes.isFairTrade"],
    );
  });
});

describe("mergeExtractedDefaults · a value the picker cannot offer", () => {
  const SAKE_FIELDS: readonly ExtractionField[] = [
    {
      key: "servingTemperature",
      label: "Serving temperature",
      kind: "static",
      options: "sakeServingTemperature",
    },
    { key: "region", label: "Region", kind: "text" },
  ];

  /** Deliberately short, the way `STATIC_OPTIONS` was. */
  const SHORT_LIST = ["rei_shu", "hiya", "atsu_kan"];

  const mergeSake = (
    defaults: unknown,
    allowedValues?: (field: ExtractionField) => readonly string[] | null,
  ) =>
    mergeExtractedDefaults({
      defaults,
      bagKey: "sake",
      fields: SAKE_FIELDS,
      current: empty,
      edited: new Set(),
      allowedValues,
    });

  test("applies a value the picker does offer", () => {
    const result = mergeSake(
      { name: "Dassai", sake: { servingTemperature: "hiya" } },
      () => SHORT_LIST,
    );
    assert.equal(result.values.attributes.servingTemperature, "hiya");
    assert.equal(result.skipped.length, 0);
  });

  test("refuses one it does not, and names it rather than dropping it", () => {
    const result = mergeSake(
      { name: "Dassai", sake: { servingTemperature: "yuki_hie" } },
      () => SHORT_LIST,
    );

    assert.equal(result.values.attributes.servingTemperature, undefined);
    const skipped = result.skipped.find(
      (entry) => entry.path === "attributes.servingTemperature",
    );
    assert.equal(skipped?.reason, "unusable");
    assert.equal(skipped?.value, "yuki_hie");
    assert.match(skipped?.detail ?? "", /picker over 3 values/);
  });

  test("an unknown vocabulary is not a rejection", () => {
    // What a `reference` field looks like at merge time: its options come from
    // `ReferenceOptionsQuery` and the wizard does not have them.
    const result = mergeSake(
      { name: "Dassai", sake: { servingTemperature: "yuki_hie" } },
      () => null,
    );
    assert.equal(result.values.attributes.servingTemperature, "yuki_hie");
    assert.equal(result.skipped.length, 0);
  });

  test("no resolver at all behaves exactly as before", () => {
    const result = mergeSake({
      name: "Dassai",
      sake: { servingTemperature: "yuki_hie" },
    });
    assert.equal(result.values.attributes.servingTemperature, "yuki_hie");
  });

  test("what you typed still wins over a value the picker does offer", () => {
    const result = mergeExtractedDefaults({
      defaults: { sake: { servingTemperature: "hiya" } },
      bagKey: "sake",
      fields: SAKE_FIELDS,
      current: { ...empty, attributes: { servingTemperature: "atsu_kan" } },
      edited: new Set(["attributes.servingTemperature"]),
      allowedValues: () => SHORT_LIST,
    });
    assert.equal(result.values.attributes.servingTemperature, "atsu_kan");
    assert.equal(result.skipped[0]?.reason, "kept");
  });
});

describe("editedPaths", () => {
  test("names the top-level field that changed", () => {
    assert.deepEqual(editedPaths(empty, { ...empty, country: "ITALY" }), [
      "country",
    ]);
  });

  test("names an attribute that changed, cleared included", () => {
    const before: ExtractionValues = { ...empty, attributes: { vintage: "x" } };
    const after: ExtractionValues = { ...empty, attributes: { vintage: "" } };
    assert.deepEqual(editedPaths(before, after), ["attributes.vintage"]);
  });

  test("names nothing when nothing changed", () => {
    assert.deepEqual(editedPaths(empty, { ...empty }), []);
  });
});
