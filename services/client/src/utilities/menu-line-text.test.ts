import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatMenuPrice, menuLineText } from "./menu-line-text";

describe("menuLineText", () => {
  const cases: [string, string][] = [
    // A shouted name.
    ["OLD FASHIONED", "Old Fashioned"],
    ["CASTELLO DI MONTEROSSO CHIANTI", "Castello di Monterosso Chianti"],
    // Cased per segment: the shouted name, the whispered ingredients.
    [
      "OLD FASHIONED — Buffalo Trace, demerara, angostura",
      "Old Fashioned — Buffalo Trace, Demerara, Angostura",
    ],
    [
      "NEGRONI - gin, campari, sweet vermouth",
      "Negroni - Gin, Campari, Sweet Vermouth",
    ],
    // Three-letter words a menu shouts are words, not acronyms…
    ["GIN & TONIC", "Gin & Tonic"],
    ["RYE", "Rye"],
    // …but the grades and styles stay capitals.
    ["IPA", "IPA"],
    ["HAZY IPA", "Hazy IPA"],
    ["HENNESSY XO", "Hennessy XO"],
    ["hazy ipa", "Hazy IPA"],
    // A person's casing is kept.
    ["d'Arenberg The Dead Arm", "d'Arenberg The Dead Arm"],
    ["Château La Nerthe", "Château La Nerthe"],
    ["McHenry ESTATE", "McHenry ESTATE"],
    // Lower case for style.
    ["negroni", "Negroni"],
    ["house red", "House Red"],
    // Numbers and units alone are left as printed.
    ["12 YR", "12 YR"],
    ["2016", "2016"],
    // Whitespace is collapsed, separators keep their own spacing.
    ["  LAGAVULIN   16  ", "Lagavulin 16"],
    ["SAKE · JUNMAI GINJO", "Sake · Junmai Ginjo"],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(menuLineText(input), expected);
    });
  }
});

describe("formatMenuPrice", () => {
  test("whole prices print without decimals, others with two", () => {
    assert.equal(formatMenuPrice(14), "14");
    assert.equal(formatMenuPrice(14.5), "14.50");
    assert.equal(formatMenuPrice(9.95), "9.95");
  });
  test("never invents a currency", () => {
    assert.doesNotMatch(formatMenuPrice(12), /[$£€]/);
  });
});
