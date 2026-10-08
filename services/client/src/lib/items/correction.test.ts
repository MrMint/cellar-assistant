/**
 * X19 — the edit form's correction proposals: everything the AI has a
 * different value for is offered, nothing is applied, and a value no field
 * can hold is reported once rather than offered.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { correctionProposals, defaultsObject } from "./correction.ts";
import type { ExtractionField, ExtractionValues } from "./extraction-merge.ts";

const WINE_FIELDS: readonly ExtractionField[] = [
  { key: "vintage", label: "Vintage", kind: "year", nonVintage: true },
  { key: "style", label: "Style", kind: "reference" },
  { key: "variety", label: "Variety", kind: "reference" },
  { key: "region", label: "Region", kind: "text" },
  { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
];

const current: ExtractionValues = {
  name: "Lytton Springs",
  description: "",
  country: "",
  brandName: "Ridge",
  attributes: { vintage: "2016", style: "RED", variety: "" },
};

const propose = (defaults: unknown, source: "label" | "suggested" = "label") =>
  correctionProposals({
    defaults,
    bagKey: "wine",
    fields: WINE_FIELDS,
    current,
    source,
    coerce: (_field, value) =>
      /^n\.?v\.?$/i.test(value.trim()) ? "NV" : value,
  });

describe("correctionProposals", () => {
  test("offers filled and empty fields alike, and applies none", () => {
    const { proposals } = propose({
      name: "Lytton Springs",
      country: "UNITED_STATES",
      wine: { vintage: "2017", style: "RED", variety: "ZINFANDEL" },
    });
    // Empty fields and ones holding something else alike; an equal value
    // (the style, the name) is not an offer. The form orders them itself.
    assert.deepEqual(
      proposals.map((p) => [p.path, p.value, p.display]).sort(),
      [
        ["attributes.variety", "ZINFANDEL", "Zinfandel"],
        ["attributes.vintage", "2017", "2017"],
        ["country", "UNITED_STATES", "United states"],
      ],
    );
    assert.ok(proposals.every((p) => p.source === "label"));
  });

  test("a wine's NV is a proposal for a dated wine", () => {
    const { proposals, unusable } = propose({ wine: { vintage: "N.V." } });
    assert.deepEqual(
      proposals.map((p) => [p.path, p.value]),
      [["attributes.vintage", "NV"]],
    );
    assert.deepEqual(unusable, []);
  });

  test("what no field can hold is reported, not offered", () => {
    const { proposals, unusable } = propose(
      { wine: { alcoholContentPercentage: "strong" } },
      "suggested",
    );
    assert.deepEqual(proposals, []);
    assert.equal(unusable[0]?.path, "attributes.alcoholContentPercentage");
  });

  test("a case-only difference is not a correction", () => {
    const { proposals } = propose({
      name: "LYTTON SPRINGS",
      brandName: "ridge",
    });
    assert.deepEqual(proposals, []);
  });
});

describe("defaultsObject", () => {
  test("parses a JSON string, keeps an object, and refuses the rest", () => {
    assert.deepEqual(defaultsObject('{"a":1}'), { a: 1 });
    assert.deepEqual(defaultsObject({ b: 2 }), { b: 2 });
    assert.deepEqual(defaultsObject("not json"), {});
    assert.deepEqual(defaultsObject([1]), {});
    assert.deepEqual(defaultsObject(null), {});
  });
});
