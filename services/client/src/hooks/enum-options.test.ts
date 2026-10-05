import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STATIC_OPTIONS } from "@/components/item-api/itemFormRules";
import {
  enumOptionsFor,
  formatEnumValue,
  PERMISSION_VALUES,
} from "./enum-options";

describe("enumOptionsFor — old EnumSelect options from new sources", () => {
  test("reference keys use the live values, labelled by the old formatter", () => {
    assert.deepEqual(enumOptionsFor("wineStyle", ["RED", "ROSE"]), [
      { value: "RED", label: "Red" },
      { value: "ROSE", label: "Rosé" },
    ]);
    assert.deepEqual(enumOptionsFor("wineVariety", ["SYRAH_SHIRAZ"]), [
      { value: "SYRAH_SHIRAZ", label: "Syrah/Shiraz" },
    ]);
  });

  test("a reference key with no values yet has no options", () => {
    assert.deepEqual(enumOptionsFor("country"), []);
    assert.deepEqual(enumOptionsFor("beerStyle", []), []);
  });

  test("static keys use STATIC_OPTIONS and ignore any values passed", () => {
    const options = enumOptionsFor("sakeServingTemperature", ["bogus"]);
    assert.deepEqual(
      options.map((o) => o.value),
      [...STATIC_OPTIONS.sakeServingTemperature],
    );
    assert.ok(
      options.some(
        (o) => o.value === "yuki_hie" && o.label === "Yuki-hie (Snow Cold)",
      ),
    );
    assert.deepEqual(enumOptionsFor("teaForm")[0], {
      value: "loose_leaf",
      label: "Loose Leaf",
    });
  });

  test("permission is the SDL's PermissionType, title-cased", () => {
    assert.deepEqual(enumOptionsFor("permission"), [
      { value: "FRIENDS", label: "Friends" },
      { value: "PRIVATE", label: "Private" },
      { value: "PUBLIC", label: "Public" },
    ]);
    assert.deepEqual([...PERMISSION_VALUES], ["FRIENDS", "PRIVATE", "PUBLIC"]);
  });

  test("formatEnumValue falls back to the raw value if a formatter declines", () => {
    assert.equal(formatEnumValue("country", "UNITED_STATES"), "United States");
    assert.equal(
      formatEnumValue("spiritType", "BRANDY_COGNAC"),
      "Brandy & Cognac",
    );
    assert.equal(formatEnumValue("teaCategory", "pu_erh"), "Pu-erh");
  });
});
