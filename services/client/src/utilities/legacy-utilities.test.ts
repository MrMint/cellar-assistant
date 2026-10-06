import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatBeerStyle,
  formatEnum,
  formatSakeType,
  formatSpiritType,
  formatWineStyle,
  formatWineVariety,
} from "./formatters";
import {
  buildItemSubtitle,
  formatAsPercentage,
  formatItemType,
  formatVintage,
  getNextPlaceholder,
  parseNumber,
} from "./index";
import { parseTypesParam } from "./types-param";

describe("formatters (old @cellar-assistant/shared/utility)", () => {
  test("formatEnum title-cases, as the old one did", () => {
    assert.equal(formatEnum("PINOT_NOIR"), "Pinot Noir");
    assert.equal(formatEnum("loose_leaf"), "Loose Leaf");
    assert.equal(formatEnum(null), undefined);
    assert.equal(formatEnum("A__B"), "A  B", "no crash on an empty part");
  });

  test("hand-written spellings survive", () => {
    assert.equal(formatWineStyle("ROSE"), "Rosé");
    assert.equal(formatWineVariety("GEWURZTRAMINER"), "Gewürztraminer");
    assert.equal(
      formatSpiritType("AMARO_APERITIF_VERMOUTH"),
      "Amaro, Aperitif & Vermouth",
    );
    assert.equal(formatSakeType("rich"), "Rich (Nōjun)");
    assert.equal(formatBeerStyle("PILSENER_PILSNER_PILS"), "Pilsner");
  });

  test("the old 'Vieena' typo is corrected", () => {
    assert.equal(formatBeerStyle("VIENNA_LAGER"), "Vienna");
  });
});

describe("utilities index (old @/utilities)", () => {
  test("formatVintage: ISO day or year → year; junk → undefined", () => {
    assert.equal(formatVintage("2016-01-01"), "2016");
    assert.equal(formatVintage("2016"), "2016");
    assert.equal(formatVintage(2021), "2021");
    assert.equal(formatVintage(null), undefined);
    assert.equal(formatVintage("n/a"), undefined);
  });

  test("getNextPlaceholder prefixes a bare body once", () => {
    assert.equal(
      getNextPlaceholder("png;base64,AA"),
      "data:image/png;base64,AA",
    );
    assert.equal(
      getNextPlaceholder("data:image/png;base64,AA"),
      "data:image/png;base64,AA",
    );
    assert.equal(getNextPlaceholder(null), undefined);
  });

  test("buildItemSubtitle joins brand and title-cased descriptor", () => {
    assert.equal(
      buildItemSubtitle({ brandName: "Vietti", descriptor: "NEBBIOLO" }),
      "Vietti · Nebbiolo",
    );
    assert.equal(buildItemSubtitle({ brandName: "Vietti" }), "Vietti");
    assert.equal(buildItemSubtitle({ descriptor: "DARK" }), "Dark");
    assert.equal(
      buildItemSubtitle({ brandName: "", descriptor: null }),
      undefined,
    );
  });

  test("small helpers", () => {
    assert.equal(formatItemType("SAKE"), "Sake");
    assert.equal(formatAsPercentage(13.5), "13.5%");
    assert.equal(formatAsPercentage(undefined), undefined);
    assert.equal(parseNumber("4.5"), 4.5);
    assert.equal(parseNumber("x"), undefined);
    assert.equal(parseNumber(""), undefined);
  });
});

describe("parseTypesParam (the old ?types= crash, fixed)", () => {
  test("the production URL format still filters", () => {
    assert.deepEqual(parseTypesParam('["WINE","BEER"]'), ["WINE", "BEER"]);
  });

  test("garbage reads as no filter instead of throwing", () => {
    assert.deepEqual(parseTypesParam("[WINE"), []);
    assert.deepEqual(parseTypesParam('"WINE"'), []);
    assert.deepEqual(parseTypesParam("{}"), []);
    assert.deepEqual(parseTypesParam(null), []);
    assert.deepEqual(parseTypesParam(""), []);
  });

  test("unknown members are dropped and duplicates collapsed", () => {
    assert.deepEqual(parseTypesParam('["WINE","MEAD",3,"WINE"]'), ["WINE"]);
  });
});
