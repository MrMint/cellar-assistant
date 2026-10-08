import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  displayItemName,
  isShouting,
  smartTitleCase,
} from "./smart-title-case";

describe("isShouting", () => {
  test("an all-caps name with a real word shouts", () => {
    assert.equal(isShouting("CASTELIO DI MONTEROSSO"), true);
    assert.equal(isShouting("BLANTON'S"), true);
  });
  test("any lowercase letter means a person cased it", () => {
    assert.equal(isShouting("Castello di Monterosso"), false);
    assert.equal(isShouting("McHenry ESTATE"), false);
    assert.equal(isShouting("iichiko"), false);
  });
  test("short acronyms and known grades on their own do not", () => {
    assert.equal(isShouting("IPA"), false);
    assert.equal(isShouting("XO"), false);
    assert.equal(isShouting("ABC"), false);
    assert.equal(isShouting("VSOP"), false);
    assert.equal(isShouting("1792"), false);
    assert.equal(isShouting(""), false);
  });
});

describe("smartTitleCase", () => {
  const cases: [string, string][] = [
    // The review's own example (observation 27).
    ["CASTELIO DI MONTEROSSO", "Castelio di Monterosso"],
    ["BLANTON'S SINGLE BARREL", "Blanton's Single Barrel"],
    ["MARQUÉS DE RISCAL", "Marqués de Riscal"],
    ["VALLEY OF THE MOON", "Valley of the Moon"],
    ["CHÂTEAU LA NERTHE", "Château La Nerthe"],
    ["PAPPY VAN WINKLE", "Pappy Van Winkle"],
    ["SAINT-ÉMILION GRAND CRU", "Saint-Émilion Grand Cru"],
    ["O'NEILL VINTNERS", "O'Neill Vintners"],
    ["L'ECOLE NO 41", "L'Ecole No 41"],
    ["MCHENRY HOHNEN", "McHenry Hohnen"],
    ["MACALLAN 12 YEAR", "Macallan 12 Year"],
    ["HENNESSY XO", "Hennessy XO"],
    ["RÉMY MARTIN VSOP", "Rémy Martin VSOP"],
    ["SIERRA NEVADA HAZY IPA", "Sierra Nevada Hazy IPA"],
    ["DOMAINE TEMPIER CUVÉE II", "Domaine Tempier Cuvée II"],
    ["E. GUIGAL CÔTES DU RHÔNE", "E. Guigal Côtes du Rhône"],
    ["1ST GROWTH RESERVE", "1st Growth Reserve"],
    ["BARREL 12YO", "Barrel 12YO"],
    ["DE KONINCK", "De Koninck"],
    ["BODEGA  DOUBLE  SPACE", "Bodega  Double  Space"],
    ["MÜLLER-THURGAU TROCKEN", "Müller-Thurgau Trocken"],
    ["RED/WHITE BLEND", "Red/White Blend"],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.equal(smartTitleCase(input), expected);
    });
  }

  test("a name that does not shout is returned untouched", () => {
    for (const name of [
      "d'Arenberg The Dead Arm",
      "Castello di Monterosso",
      "IPA",
      "BrewDog PUNK IPA",
    ]) {
      assert.equal(smartTitleCase(name), name);
    }
  });

  test("is idempotent", () => {
    const once = smartTitleCase("CASTELLO DI MONTEROSSO RISERVA");
    assert.equal(smartTitleCase(once), once);
  });
});

describe("displayItemName", () => {
  test("passes nullish through and cases a shouted name", () => {
    assert.equal(displayItemName(null), undefined);
    assert.equal(displayItemName(undefined), undefined);
    assert.equal(displayItemName("GRAND RESERVE"), "Grand Reserve");
    assert.equal(displayItemName("Grand Reserve"), "Grand Reserve");
  });
});
