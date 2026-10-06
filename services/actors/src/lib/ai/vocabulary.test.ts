import { describe, expect, it } from "vitest";
import type { ItemVocabulary } from "./vocabulary.ts";
import {
  COUNTRY_ALIASES,
  MAX_SCHEMA_ENUM_VALUES,
  normaliseToVocabulary,
  normaliseUnconstrainedAttributes,
} from "./vocabulary.ts";

const COUNTRIES = [
  "COTE_DIVOIRE",
  "CZECH_REPUBLIC",
  "FRANCE",
  "NEW_ZEALAND",
  "SCOTLAND",
  "UNITED_KINGDOM",
  "UNITED_STATES",
  "VIETNAM",
];

describe("normaliseToVocabulary", () => {
  it.each([
    ["FRANCE", "FRANCE"],
    ["  FRANCE ", "FRANCE"],
    ["France", "FRANCE"],
    ["new zealand", "NEW_ZEALAND"],
    ["New-Zealand", "NEW_ZEALAND"],
    ["Côte d'Ivoire", "COTE_DIVOIRE"],
    ["United States", "UNITED_STATES"],
    ["Viet Nam", "VIETNAM"],
    ["USA", "UNITED_STATES"],
    ["U.S.A.", "UNITED_STATES"],
    ["UK", "UNITED_KINGDOM"],
    ["England", "UNITED_KINGDOM"],
    ["Czechia", "CZECH_REPUBLIC"],
    ["Ivory Coast", "COTE_DIVOIRE"],
    // A row of its own, never folded into the United Kingdom.
    ["Scotland", "SCOTLAND"],
  ])("maps %j to %j", (input, expected) => {
    expect(normaliseToVocabulary(input, COUNTRIES, COUNTRY_ALIASES)).toBe(
      expected,
    );
  });

  it.each([
    ["Narnia"],
    ["Fran"],
    [""],
    ["   "],
    ["..."],
  ])("maps %j to null rather than the nearest value", (input) => {
    expect(normaliseToVocabulary(input, COUNTRIES, COUNTRY_ALIASES)).toBeNull();
  });

  it("returns null for anything that is not a string", () => {
    for (const value of [null, undefined, 42, true, ["FRANCE"], { a: 1 }]) {
      expect(
        normaliseToVocabulary(value, COUNTRIES, COUNTRY_ALIASES),
      ).toBeNull();
    }
  });

  it("never returns an alias target the vocabulary does not hold", () => {
    expect(
      normaliseToVocabulary("USA", ["FRANCE"], COUNTRY_ALIASES),
    ).toBeNull();
  });

  it("applies no aliases unless given some", () => {
    expect(normaliseToVocabulary("USA", COUNTRIES)).toBeNull();
  });
});

describe("normaliseUnconstrainedAttributes", () => {
  const big = (prefix: string, extra: string[]): string[] => [
    ...Array.from(
      { length: MAX_SCHEMA_ENUM_VALUES + 1 },
      (_, i) => `${prefix}_${i}`,
    ),
    ...extra,
  ];
  const vocabulary: ItemVocabulary = {
    beer_style: big("STYLE", ["INDIA_PALE_ALE", "STOUT"]),
    coffee_cultivar: ["BOURBON"],
    country: big("COUNTRY", COUNTRIES),
    sake_category: ["JUNMAI"],
    sake_rice_variety: ["YAMADA_NISHIKI"],
    sake_type: ["DRY"],
    spirit_type: ["GIN"],
    tea_category: ["GREEN"],
    wine_style: ["RED", "WHITE"],
    wine_variety: ["MERLOT"],
  };

  it("normalises top-level and bag fields that went out as text", () => {
    const out = normaliseUnconstrainedAttributes(
      "BEER",
      {
        name: "Hop Thing",
        country: "USA",
        beer: { style: "India Pale Ale", abv: 6.5 },
      },
      vocabulary,
    );
    expect(out).toEqual({
      name: "Hop Thing",
      country: "UNITED_STATES",
      beer: { style: "INDIA_PALE_ALE", abv: 6.5 },
    });
  });

  it("nulls an unmatched value and leaves absent fields absent", () => {
    const out = normaliseUnconstrainedAttributes(
      "BEER",
      { name: "x", country: "Atlantis", beer: { abv: 5 } },
      vocabulary,
    );
    expect(out.country).toBeNull();
    expect(out.beer).toEqual({ abv: 5 });
    expect("style" in (out.beer as object)).toBe(false);
  });

  it("leaves enum-constrained fields for requireInVocabulary to judge", () => {
    const out = normaliseUnconstrainedAttributes(
      "WINE",
      { name: "x", wine: { style: "Red Wine" } },
      vocabulary,
    );
    // `wine_style` is small, so it was an enum. An answer outside it is the
    // provider ignoring the schema, and that is reported, not tidied away.
    expect(out.wine).toEqual({ style: "Red Wine" });
  });

  it("does not mutate its input", () => {
    const input = { name: "x", country: "usa", beer: { style: "stout" } };
    normaliseUnconstrainedAttributes("BEER", input, vocabulary);
    expect(input).toEqual({
      name: "x",
      country: "usa",
      beer: { style: "stout" },
    });
  });
});
