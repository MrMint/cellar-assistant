/**
 * A guard on every response schema the AI seams send: none may carry an
 * `enum` larger than `MAX_SCHEMA_ENUM_VALUES`.
 *
 * Measured 2026-10-04: Vertex refused the item-defaults schema, with its
 * 197-value `country` enum, on every Gemini model with `400 INVALID_ARGUMENT`
 * ("too much branching for serving"), so every label onboarding failed on the
 * deployed provider. Nothing local could see it. Ollama and the unit fakes
 * accept any enum, and the schema typechecked. This test is the one place a
 * new large enum fails before it ships, whatever schema it is added to.
 */
import type { ReferenceKind } from "@cellar-assistant/contracts";
import { ITEM_TYPES, REFERENCE_KINDS } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import * as prompts from "./prompts.ts";
import type { JsonSchema } from "./types.ts";
import type { ItemVocabulary } from "./vocabulary.ts";
import { MAX_SCHEMA_ENUM_VALUES } from "./vocabulary.ts";

/** Every enum in a schema, with the path it sits at. */
const enumsIn = (
  schema: JsonSchema,
  path: string,
): { path: string; size: number }[] => {
  const found: { path: string; size: number }[] = [];
  if (schema.enum !== undefined) {
    found.push({ path, size: schema.enum.length });
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    found.push(...enumsIn(child, `${path}.${key}`));
  }
  if (schema.items !== undefined) {
    found.push(...enumsIn(schema.items, `${path}[]`));
  }
  return found;
};

/**
 * Every reference table at the real `country` table's size, 197 rows. That is
 * larger than any vocabulary has today, so this asks whether
 * `itemDefaultsSchema` keeps big vocabularies out of `enum`s, not whether
 * today's tables happen to be small.
 */
const LARGE_VOCABULARY = Object.fromEntries(
  REFERENCE_KINDS.map((kind: ReferenceKind) => [
    kind,
    Array.from({ length: 197 }, (_, i) => `${kind.toUpperCase()}_${i}`),
  ]),
) as unknown as ItemVocabulary;

/** Every `*_SCHEMA` constant `prompts.ts` exports, found by name, plus one per item type. */
const allSchemas = (): [string, JsonSchema][] => [
  ...Object.entries(prompts)
    .filter(([name]) => name.endsWith("_SCHEMA"))
    .map(
      ([name, value]) => [name, value as JsonSchema] as [string, JsonSchema],
    ),
  ...ITEM_TYPES.map(
    (type) =>
      [
        `itemDefaultsSchema(${type})`,
        prompts.itemDefaultsSchema(type, LARGE_VOCABULARY),
      ] as [string, JsonSchema],
  ),
];

describe("AI response schemas", () => {
  it("covers every schema the seams send", () => {
    const names = allSchemas().map(([name]) => name);
    // The five constants `seams.ts` imports, and the item-defaults builder.
    // If a seam gains a schema, it is exported from here and this list grows.
    for (const expected of [
      "INSIGHTS_SCHEMA",
      "MENU_EXTRACTION_SCHEMA",
      "MENU_MATCH_SCHEMA",
      "PLACE_REVIEW_SCHEMA",
      "RECIPE_PHOTO_SCHEMA",
    ]) {
      expect(names).toContain(expected);
    }
    expect(
      names.filter((n) => n.startsWith("itemDefaultsSchema")),
    ).toHaveLength(ITEM_TYPES.length);
  });

  it.each(allSchemas())(
    `%s carries no enum over ${MAX_SCHEMA_ENUM_VALUES} values`,
    (name, schema) => {
      const tooBig = enumsIn(schema, name).filter(
        (found) => found.size > MAX_SCHEMA_ENUM_VALUES,
      );
      expect(tooBig).toEqual([]);
    },
  );

  it("still lists a large vocabulary's values for the model to copy", () => {
    const schema = prompts.itemDefaultsSchema("WINE", LARGE_VOCABULARY);
    const country = schema.properties?.country;
    expect(country?.enum).toBeUndefined();
    expect(country?.description).toContain("COUNTRY_196");
  });
});

/**
 * N02: a vintage is asked for as a year. The form edits it as one and writes
 * `YYYY-01-01` itself; asking the model for a month and a day the label never
 * prints only invited it to invent them.
 */
describe("itemDefaultsSchema date attributes", () => {
  for (const type of ["WINE", "BEER", "SPIRIT"] as const) {
    it(`${type}'s vintage asks for a four-digit year`, () => {
      const schema = prompts.itemDefaultsSchema(type, LARGE_VOCABULARY);
      const bag = Object.values(schema.properties ?? {}).find(
        (child) => child.properties?.vintage !== undefined,
      );
      const description = bag?.properties?.vintage?.description ?? "";
      expect(description).toContain(prompts.VINTAGE_YEAR);
      expect(description).not.toContain("YYYY-MM-DD");
    });
  }
});

describe("L10 · MENU_EXTRACTION_SCHEMA's venue name", () => {
  const schema = prompts.MENU_EXTRACTION_SCHEMA as JsonSchema & {
    properties: Record<string, unknown>;
    required: readonly string[];
  };
  const order = Object.keys(schema.properties);

  it("decides the abstention before the name (property order is generation order, L4)", () => {
    expect(order.indexOf("venueNameIsPrinted")).toBeGreaterThan(-1);
    expect(order.indexOf("venueNameIsPrinted")).toBeLessThan(
      order.indexOf("venueName"),
    );
    // After the verdict and the transcription it has to be found in.
    expect(order.indexOf("menuIsLegible")).toBeLessThan(
      order.indexOf("venueNameIsPrinted"),
    );
    expect(order.indexOf("rawText")).toBeLessThan(order.indexOf("venueName"));
  });

  it("never requires a name, so declining one is reachable", () => {
    expect(schema.required).not.toContain("venueName");
    expect(schema.required).not.toContain("venueNameIsPrinted");
  });
});

describe("F-77 · itemDefaultsSchema's label kind", () => {
  it("asks which kind the label is for after the verdict and surface, before any value", () => {
    for (const type of ITEM_TYPES) {
      const schema = prompts.itemDefaultsSchema(type, LARGE_VOCABULARY) as {
        properties: Record<string, { enum?: readonly string[] }>;
        required: readonly string[];
      };
      const order = Object.keys(schema.properties);
      expect(order.indexOf("labelItemType")).toBe(
        order.indexOf("surfaceKind") + 1,
      );
      expect(order.indexOf("labelItemType")).toBeLessThan(
        order.indexOf("name"),
      );
      expect(schema.properties.labelItemType?.enum).toEqual([
        "WINE",
        "BEER",
        "SPIRIT",
        "COFFEE",
        "SAKE",
        "TEA",
        "NONE",
      ]);
      // Optional: the model can always leave it out.
      expect(schema.required).not.toContain("labelItemType");
    }
  });
});
