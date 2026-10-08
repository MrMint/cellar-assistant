/**
 * X19 — the text-only "Suggest details" seam: its gates, its schema and what
 * `providerItemSuggestions` keeps of an answer. A fake provider stands in for
 * the model; the vocabulary is a fixture, as in `seams.test.ts`.
 *
 * What these pin, in the order a regression would hurt:
 *
 * 1. An abstention wins — `recognised: false` discards every suggestion, even
 *    ones the model also wrote; an answer with no verdict is refused.
 * 2. Nothing outside the closed lists and `region` comes back: a number, a
 *    year or a field nobody asked about is dropped whatever the provider sent.
 * 3. The schema puts the two grounding fields first and requires only them
 *    (property order is generation order).
 */
import type { Ctx, ItemType } from "@cellar-assistant/contracts";
import {
  ConflictError,
  NON_VINTAGE,
  ValidationError,
} from "@cellar-assistant/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  emptySuggestibleFields,
  type ItemSuggestionsRequest,
  keepWanted,
  requireRecognition,
  requireSuggestibleInput,
  SUGGESTIBLE_ITEM_FIELDS,
  unconfiguredItemSuggestions,
} from "../item-suggestions.ts";
import {
  buildItemSuggestionsPrompt,
  itemDefaultsSchema,
  itemSuggestionsSchema,
  NON_VINTAGE_NOTE,
} from "./prompts.ts";
import { providerItemSuggestions } from "./seams.ts";
import type {
  AIProvider,
  GenerateContentRequest,
  JsonSchema,
  ModelQuality,
  ProviderFor,
} from "./types.ts";
import type { ItemVocabulary } from "./vocabulary.ts";
import { resetItemVocabulary, setItemVocabularyLoader } from "./vocabulary.ts";

const ctx: Ctx = { viewerId: null, kind: "system", requestId: "r-1" };

const VOCABULARY: ItemVocabulary = {
  beer_style: ["IPA", "STOUT"],
  coffee_cultivar: ["BOURBON", "TYPICA"],
  country: ["FRANCE", "ITALY", "UNITED_STATES"],
  sake_category: ["JUNMAI"],
  sake_rice_variety: ["YAMADA_NISHIKI"],
  sake_type: ["DRY"],
  spirit_type: ["GIN", "WHISKEY"],
  tea_category: ["GREEN"],
  wine_style: ["DESSERT", "RED", "ROSE", "SPARKLING", "WHITE"],
  wine_variety: ["MERLOT", "PINOT_NOIR", "ZINFANDEL"],
};

beforeAll(() => {
  setItemVocabularyLoader(async () => VOCABULARY);
});
afterAll(resetItemVocabulary);

const fakeProvider = (
  content: string,
): {
  provider: ProviderFor;
  asked: { request: GenerateContentRequest; quality?: ModelQuality }[];
} => {
  const asked: { request: GenerateContentRequest; quality?: ModelQuality }[] =
    [];
  const raw: AIProvider = {
    name: "ollama",
    getAvailableQualities: () => ["low", "medium", "high"],
    async generateContent(request, quality) {
      asked.push({ request, quality });
      return {
        content,
        metadata: {
          model: "fake-model",
          provider: "ollama",
          processingTime: 1,
        },
      };
    },
    async generateEmbeddings() {
      throw new Error("no embeddings here");
    },
  };
  return { provider: () => raw, asked };
};

const wineRequest = (
  over: Partial<ItemSuggestionsRequest> = {},
): ItemSuggestionsRequest => {
  const known = { country: null, wine: { vintage: "2016-01-01" } };
  return {
    itemType: "WINE",
    name: "Lytton Springs",
    brandName: "Ridge Vineyards",
    known,
    wanted: emptySuggestibleFields("WINE", known),
    ...over,
  };
};

describe("SUGGESTIBLE_ITEM_FIELDS", () => {
  it("is country, the closed-list attributes and region — never a number or a date", () => {
    expect(SUGGESTIBLE_ITEM_FIELDS.WINE).toEqual([
      { field: "country", on: "input" },
      { field: "style", on: "attributes" },
      { field: "variety", on: "attributes" },
      { field: "region", on: "attributes" },
    ]);
    expect(SUGGESTIBLE_ITEM_FIELDS.SPIRIT.map((f) => f.field)).toEqual([
      "country",
      "spiritType",
    ]);
    const forbidden =
      /vintage|alcohol|bitterness|polish|harvest|acidity|amino|meter/i;
    for (const type of Object.keys(SUGGESTIBLE_ITEM_FIELDS) as ItemType[]) {
      for (const { field } of SUGGESTIBLE_ITEM_FIELDS[type]) {
        expect(field, `${type}.${field}`).not.toMatch(forbidden);
      }
    }
  });

  it("asks only about the empty ones", () => {
    expect(
      emptySuggestibleFields("WINE", {
        country: "FRANCE",
        wine: { style: "RED", variety: "", region: null },
      }),
    ).toEqual([
      { field: "variety", on: "attributes" },
      { field: "region", on: "attributes" },
    ]);
  });
});

describe("the gates", () => {
  it("refuses a blank name and an empty ask before any call", async () => {
    expect(() => requireSuggestibleInput(wineRequest({ name: " " }))).toThrow(
      ValidationError,
    );
    expect(() => requireSuggestibleInput(wineRequest({ wanted: [] }))).toThrow(
      ValidationError,
    );
    const { provider, asked } = fakeProvider("{}");
    await expect(
      providerItemSuggestions(provider)(ctx, wineRequest({ name: "" })),
    ).rejects.toThrow(ValidationError);
    expect(asked).toHaveLength(0);
  });

  it("reads the verdict: absent is refused, false abstains", () => {
    expect(() => requireRecognition(null)).toThrow(ConflictError);
    expect(requireRecognition(false)).toBe(false);
    expect(requireRecognition(true)).toBe(true);
  });

  it("with no provider, fails loudly rather than answering", async () => {
    await expect(
      unconfiguredItemSuggestions(ctx, wineRequest()),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "AI_UNCONFIGURED" });
  });
});

describe("providerItemSuggestions", () => {
  it("keeps what was asked for, from the closed lists, and nothing else", async () => {
    const { provider, asked } = fakeProvider(
      JSON.stringify({
        productNote: "Ridge Lytton Springs, a Zinfandel blend from Sonoma.",
        recognised: true,
        country: "UNITED_STATES",
        wine: {
          style: "RED",
          variety: "ZINFANDEL",
          region: "Dry Creek Valley",
          // Never asked for: an invented number and a known value.
          alcoholContentPercentage: "14.5",
          vintage: "2016",
        },
        name: "Something else",
      }),
    );
    const result = await providerItemSuggestions(provider)(ctx, wineRequest());
    expect(result).toEqual({
      abstained: false,
      note: "Ridge Lytton Springs, a Zinfandel blend from Sonoma.",
      defaults: {
        country: "UNITED_STATES",
        wine: {
          style: "RED",
          variety: "ZINFANDEL",
          region: "Dry Creek Valley",
        },
      },
      model: "fake-model",
    });
    expect(asked[0]?.quality).toBe("medium");
    expect(asked[0]?.request.images).toBeUndefined();
    expect(asked[0]?.request.prompt).toContain("Ridge Vineyards");
    expect(asked[0]?.request.prompt).toContain("vintage: 2016-01-01");
  });

  it("an abstention discards every suggestion the model also wrote", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        productNote: "I do not know this wine.",
        recognised: false,
        wine: { style: "RED", variety: "MERLOT" },
      }),
    );
    await expect(
      providerItemSuggestions(provider)(ctx, wineRequest()),
    ).resolves.toEqual({
      abstained: true,
      note: "I do not know this wine.",
      defaults: {},
      model: "fake-model",
    });
  });

  it("refuses an answer with no verdict, and one outside the vocabulary", async () => {
    await expect(
      providerItemSuggestions(
        fakeProvider(JSON.stringify({ wine: { style: "RED" } })).provider,
      )(ctx, wineRequest()),
    ).rejects.toThrow(ConflictError);
    await expect(
      providerItemSuggestions(
        fakeProvider(
          JSON.stringify({ recognised: true, wine: { style: "Red Wine" } }),
        ).provider,
      )(ctx, wineRequest()),
    ).rejects.toThrow(ConflictError);
  });

  it("never re-suggests a value the form already holds", () => {
    expect(
      keepWanted(
        "WINE",
        { country: "FRANCE", wine: { style: "RED" } },
        {
          known: { country: "FRANCE", wine: {} },
          wanted: [
            { field: "country", on: "input" },
            { field: "style", on: "attributes" },
          ],
        },
      ),
    ).toEqual({ wine: { style: "RED" } });
  });
});

describe("itemSuggestionsSchema", () => {
  it("opens with the two grounding fields and requires only them", () => {
    const schema = itemSuggestionsSchema(
      "WINE",
      VOCABULARY,
      SUGGESTIBLE_ITEM_FIELDS.WINE,
    );
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "productNote",
      "recognised",
      "country",
      "wine",
    ]);
    expect(schema.required).toEqual(["productNote", "recognised"]);
    const bag = schema.properties?.wine as JsonSchema;
    expect(Object.keys(bag.properties ?? {})).toEqual([
      "style",
      "variety",
      "region",
    ]);
    expect(bag.properties?.style?.enum).toEqual(VOCABULARY.wine_style);
  });

  it("leaves the bag out when only country is wanted", () => {
    const schema = itemSuggestionsSchema("BEER", VOCABULARY, [
      { field: "country", on: "input" },
    ]);
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "productNote",
      "recognised",
      "country",
    ]);
  });

  it("the prompt says abstaining is a correct answer", () => {
    const prompt = buildItemSuggestionsPrompt({
      itemType: "SAKE",
      name: "Dassai 23",
      brandName: null,
      known: [],
    });
    expect(prompt).toContain("Dassai 23");
    expect(prompt).toContain("(not given)");
    expect(prompt).toMatch(/correct and\s+useful answer/);
  });
});

describe("the label read's non-vintage answer (X19)", () => {
  it("asks for a year or NV for a wine, first in the bag as before", () => {
    const schema = itemDefaultsSchema("WINE", VOCABULARY);
    const bag = schema.properties?.wine as JsonSchema;
    expect(Object.keys(bag.properties ?? {})).toEqual([
      "vintage",
      "style",
      "variety",
    ]);
    const vintage = bag.properties?.vintage?.description ?? "";
    expect(vintage).toContain(NON_VINTAGE_NOTE);
    expect(vintage).toContain(`"${NON_VINTAGE}"`);
  });

  it("does not offer NV for a beer's vintage", () => {
    const bag = itemDefaultsSchema("BEER", VOCABULARY).properties
      ?.beer as JsonSchema;
    const vintage = bag.properties?.vintage?.description ?? "";
    expect(vintage).not.toContain(NON_VINTAGE_NOTE);
  });
});
