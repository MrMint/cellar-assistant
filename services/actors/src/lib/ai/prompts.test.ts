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
