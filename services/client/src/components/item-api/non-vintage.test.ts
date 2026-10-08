/**
 * X19 — a wine's vintage is a year **or** "NV", and NV is stored as NULL. The
 * round trip through the edit form: read (`attributesFrom`), shown as a year
 * or the NV chip (`yearFromDate`), and written back (`dateFromYear`,
 * `attributesToSave`) — including a dated wine corrected to NV, which has to
 * cross as an explicit `null` because a blank is omitted.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dateFromYear, yearFromDate } from "@/components/item/itemFormLayout";
import { formatItemVintage } from "@/utilities";
import {
  attributesFrom,
  attributesToSave,
  ITEM_FORM_RULES,
  isNonVintageText,
  NON_VINTAGE,
} from "./itemFormRules";

describe("non-vintage wines (X19)", () => {
  test("recognises what a label or a person writes for NV", () => {
    for (const text of [
      "NV",
      "nv",
      "N.V.",
      "N.V",
      "Non-Vintage",
      "non vintage",
      "Multi-Vintage",
    ]) {
      assert.equal(isNonVintageText(text), true, text);
    }
    for (const text of ["", "2015", "Nouveau", "NVX", "vintage"]) {
      assert.equal(isNonVintageText(text), false, text);
    }
  });

  test("only wine's vintage is non-vintage-capable", () => {
    const marked = Object.entries(ITEM_FORM_RULES).flatMap(([type, rules]) =>
      rules.attributes
        .filter((field) => field.nonVintage === true)
        .map((field) => `${type}.${field.key}`),
    );
    assert.deepEqual(marked, ["WINE.vintage"]);
  });

  test("a stored NULL reads back as NV for a wine, and as blank for a beer", () => {
    assert.equal(
      attributesFrom({ vintage: null, wineStyle: "RED" }, "WINE").vintage,
      NON_VINTAGE,
    );
    assert.equal(attributesFrom({ vintage: null }, "BEER").vintage, undefined);
    assert.equal(
      attributesFrom({ vintage: "2015-01-01" }, "WINE").vintage,
      "2015-01-01",
    );
  });

  test("the year field keeps NV through its year conversions", () => {
    assert.equal(yearFromDate("NV"), "NV");
    assert.equal(yearFromDate("2015-01-01"), "2015");
    assert.equal(dateFromYear("NV", "2015-01-01"), "NV");
    assert.equal(dateFromYear("2016", "2015-01-01"), "2016-01-01");
  });

  test("NV is saved as an explicit null; a blank vintage is left alone", () => {
    assert.deepEqual(
      attributesToSave("WINE", { vintage: "NV", style: "RED" }),
      {
        vintage: null,
        style: "RED",
      },
    );
    assert.deepEqual(attributesToSave("WINE", { vintage: "", style: "RED" }), {
      style: "RED",
    });
  });

  test("display: a wine's null vintage reads NV, nobody else's does", () => {
    assert.equal(formatItemVintage("WINE", null), "NV");
    assert.equal(formatItemVintage("WINE", undefined), undefined);
    assert.equal(formatItemVintage("WINE", "2015-01-01"), "2015");
    assert.equal(formatItemVintage("WINE", "NV"), "NV");
    assert.equal(formatItemVintage("BEER", null), undefined);
    assert.equal(formatItemVintage("SAKE", 2019), "2019");
  });
});
