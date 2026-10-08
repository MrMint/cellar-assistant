import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STATIC_OPTIONS } from "@/components/item-api/itemFormRules";
import {
  enumOptionsFor,
  formatEnumValue,
  optionsHolding,
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

describe("optionsHolding — a held value survives options still loading", () => {
  const first = enumOptionsFor("country", ["FRANCE", "ITALY"]);

  test("while loading, a value missing from the options is kept as one", () => {
    assert.deepEqual(optionsHolding("country", first, "SPAIN", true), [
      ...first,
      { value: "SPAIN", label: formatEnumValue("country", "SPAIN") },
    ]);
  });

  test("a value already among the options is not duplicated", () => {
    assert.deepEqual(optionsHolding("country", first, "FRANCE", true), first);
  });

  test("once loaded, a value that is not an option is not invented", () => {
    assert.deepEqual(optionsHolding("country", first, "ESPANA", false), first);
  });

  test("empty and absent values add nothing", () => {
    assert.deepEqual(optionsHolding("country", first, "", true), first);
    assert.deepEqual(optionsHolding("country", first, null, true), first);
    assert.deepEqual(optionsHolding("country", first, undefined, true), first);
  });
});
