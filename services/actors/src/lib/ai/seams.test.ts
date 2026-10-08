/**
 * The six seam implementations, driven with a fake provider.
 *
 * These are the things five workstreams left throwing. What is asserted here
 * is that each one now *resolves* — produces the exact type its seam declares —
 * and that the three "succeeded with nothing" outcomes each seam's author
 * warned about are still refused rather than written.
 *
 * The provider is faked at the `AIProvider` boundary rather than at `fetch`,
 * because what these tests are about is the translation between a completion
 * and a domain type; `providers.test.ts` owns the wire.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  ConflictError,
  RECIPE_CATEGORIES,
  RECIPE_TYPES,
} from "@cellar-assistant/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../embeddings.ts";
import type { ImageLoader } from "./images.ts";
import { RECIPE_PHOTO_SCHEMA } from "./prompts.ts";
import {
  providerEmbedder,
  providerInsightsGenerator,
  providerItemDefaults,
  providerMenuExtraction,
  providerMenuMatchVerifier,
  providerRecipePhotoExtractor,
} from "./seams.ts";
import type {
  AIProvider,
  EmbeddingRequest,
  GenerateContentRequest,
  ModelQuality,
  ProviderFor,
} from "./types.ts";
import type { ItemVocabulary } from "./vocabulary.ts";
import { resetItemVocabulary, setItemVocabularyLoader } from "./vocabulary.ts";

const ctx: Ctx = { viewerId: null, kind: "system", requestId: "r-1" };

type Recorded = {
  readonly request: GenerateContentRequest;
  readonly quality: ModelQuality | undefined;
};

/**
 * Answers with whatever JSON it was given, and records what it was asked.
 *
 * Returns a `ProviderFor` rather than an `AIProvider`, because that is what a
 * seam takes since X1c — the ctx is bound one level up so that the metered
 * provider can attribute the spend. Nothing here meters: these tests are about
 * the translation between a completion and a domain type, and
 * `budget.test.ts` owns the charging. What that separation costs is recorded
 * in `install.test.ts`, which is the test that a *production* seam is metered
 * at all.
 */
const fakeProvider = (
  content: string,
  vector: number[] = [],
): { provider: ProviderFor; asked: Recorded[] } => {
  const asked: Recorded[] = [];
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
      return {
        embeddings: vector,
        metadata: {
          model: "fake-embed",
          dimensions: vector.length,
          provider: "ollama",
        },
      };
    },
  };
  return { provider: () => raw, asked };
};

const loadedIds: string[][] = [];
const loader: ImageLoader = async (_ctx, fileIds) => {
  loadedIds.push([...fileIds]);
  return fileIds.map((_, i) => new Uint8Array([i]));
};

/**
 * X1b's vocabulary, injected rather than read.
 *
 * The real loader reads the ten reference tables through `actorDb()`; these
 * tests deliberately have no `DATABASE_URL` (`src/lib/db.ts` refuses one), and
 * what they are about is the translation between a completion and a domain
 * type. `../item-spec-schema.test.ts` is what holds the vocabulary spec against
 * the live database.
 */
const TEST_VOCABULARY: ItemVocabulary = {
  beer_style: ["IPA", "STOUT"],
  coffee_cultivar: ["BOURBON", "TYPICA"],
  country: ["FRANCE", "ITALY"],
  sake_category: ["JUNMAI"],
  sake_rice_variety: ["YAMADA_NISHIKI"],
  sake_type: ["DRY"],
  spirit_type: ["GIN", "WHISKEY"],
  tea_category: ["GREEN"],
  wine_style: ["DESSERT", "RED", "ROSE", "SPARKLING", "WHITE"],
  wine_variety: ["MERLOT", "PINOT_NOIR"],
};

beforeAll(() => {
  setItemVocabularyLoader(async () => TEST_VOCABULARY);
});
afterAll(resetItemVocabulary);

/* -------------------------------------------------------------------------- */

describe("C1 · the embedder", () => {
  /** A provider that records every embedding request it is handed. */
  const embeddingRecorder = (vector: number[]) => {
    const requests: EmbeddingRequest[] = [];
    const raw: AIProvider = {
      name: "vertex-ai",
      getAvailableQualities: () => ["low", "medium", "high"],
      async generateContent() {
        throw new Error("no generateContent in this test");
      },
      async generateEmbeddings(request) {
        requests.push(request);
        return {
          embeddings: vector,
          metadata: {
            model: "gemini-embedding-2",
            dimensions: vector.length,
            provider: "vertex-ai",
          },
        };
      },
    };
    const provider: ProviderFor = () => raw;
    return { provider, requests };
  };

  it("returns the provider's vector, asking for RETRIEVAL_QUERY and loading nothing", async () => {
    const wanted = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i);
    const { provider, requests } = embeddingRecorder(wanted);
    const before = loadedIds.length;
    const embed = providerEmbedder(provider, loader);
    expect(await embed({ text: "pinot noir" }, ctx)).toEqual(wanted);
    expect(requests).toEqual([
      { content: "pinot noir", type: "text", taskType: "RETRIEVAL_QUERY" },
    ]);
    expect(loadedIds.length).toBe(before);
  });

  /**
   * The document side, as legacy `generateItemVector` sent it: the item's
   * text as `RETRIEVAL_DOCUMENT`, with its label and display images, loaded
   * in the order named, fused into the one request.
   */
  it("embeds a document as RETRIEVAL_DOCUMENT with its images, in order", async () => {
    const { provider, requests } = embeddingRecorder([1, 2, 3]);
    const embed = providerEmbedder(provider, loader);
    await embed(
      {
        text: "Clos de Vougeot",
        purpose: "document",
        imageFileIds: ["front", "back", "display"],
      },
      ctx,
    );
    expect(loadedIds.at(-1)).toEqual(["front", "back", "display"]);
    expect(requests).toEqual([
      {
        content: "Clos de Vougeot",
        type: "text",
        taskType: "RETRIEVAL_DOCUMENT",
        images: [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([2])],
      },
    ]);
  });
});

/* -------------------------------------------------------------------------- */

describe("B7 · tier-list insights", () => {
  const six = {
    palateProfile: "You lean hard on the familiar.",
    blindSpots: "Nothing here is unfamiliar.",
    hotTake: "Your top tier is suspiciously comfortable.",
    archetype: "The Comfort Maximalist",
    archetypeDescription: "Repeat visits over discovery, every time.",
    recommendation: "Try something with a bitter edge.",
  };

  /**
   * Three grounded entries, because `requireGroundedEntries` now runs before
   * the provider is asked anything (B7b). This fixture used to be
   * `entries: []`, and every test in this block passed with it — which is the
   * measurement that the gate was not wired: an empty tier list was reaching
   * the model, and six fields of confident personality read were coming back
   * from nothing at all.
   */
  const entry = (name: string, band: number) => ({
    ref: { type: "PLACE" as const, id: `p-${name}` },
    name,
    attributes: [{ label: "category", value: "wine_bar" }],
    location: "Austin, TX, US",
    summary: null,
    publicRating: null,
    publicRatingCount: null,
    priceLevel: null,
    band,
    position: 0,
    notes: null,
  });

  const input = {
    tierListId: "t-1",
    name: "Best bars",
    description: null,
    listType: "PLACE",
    entries: [entry("Aviary", 5), entry("Midnight", 4), entry("Small Bar", 3)],
  };

  it("returns all six fields plus generatedAt and model", async () => {
    const { provider, asked } = fakeProvider(JSON.stringify(six));
    const result = await providerInsightsGenerator(provider)(ctx, input);

    expect(result).toMatchObject(six);
    expect(typeof result.generatedAt).toBe("string");
    expect(result.model).toBe("fake-model");
    expect(asked[0]?.quality).toBe("medium");
  });

  it("unfences a ```json block, which small models emit anyway", async () => {
    const { provider } = fakeProvider(
      `\`\`\`json\n${JSON.stringify(six)}\n\`\`\``,
    );
    const result = await providerInsightsGenerator(provider)(ctx, input);
    expect(result.archetype).toBe("The Comfort Maximalist");
  });

  /**
   * The two `INSIGHTS_SCHEMA.required` names, and only those.
   *
   * This test used to assert the opposite — that omitting `hotTake` failed the
   * whole generation. Measured on the running Ollama, that is what actually
   * happened to a real three-wine list: gemma3:4b answered five of six, and
   * `ai_insights` was never written, the outbox retrying the same refusal.
   * The schema had already conceded those four on purpose.
   */
  it("keeps an answer that declines one of the four optional fields", async () => {
    const { blindSpots: _declined, ...five } = six;
    const { provider } = fakeProvider(JSON.stringify(five));
    const result = await providerInsightsGenerator(provider)(ctx, input);

    expect(result).toMatchObject(five);
    // Absent, not empty: the card filters null sections out, but would render
    // a blank panel for an empty string.
    expect("blindSpots" in result).toBe(false);
  });

  it("drops a field the model answered with an empty string", async () => {
    const { provider } = fakeProvider(JSON.stringify({ ...six, hotTake: "" }));
    const result = await providerInsightsGenerator(provider)(ctx, input);
    expect("hotTake" in result).toBe(false);
    expect(result.archetype).toBe("The Comfort Maximalist");
  });

  it.each(["palateProfile", "archetype"])(
    "still refuses an answer with no %s — the card is built around both",
    async (field) => {
      const { provider } = fakeProvider(
        JSON.stringify({ ...six, [field]: "" }),
      );
      await expect(
        providerInsightsGenerator(provider)(ctx, input),
      ).rejects.toThrow(new RegExp(field));
    },
  );

  it("refuses a completion that is not JSON", async () => {
    const { provider } = fakeProvider("I'm sorry, I can't help with that.");
    await expect(
      providerInsightsGenerator(provider)(ctx, input),
    ).rejects.toThrow(ConflictError);
  });

  /**
   * B7b's abstention gate, which is only worth having if it runs *before* the
   * provider — so `asked` is what is asserted, not just the rejection. Every
   * field this prompt requests is a claim about what was ranked; with nothing
   * describable to read, a model invents the list rather than abstaining.
   */
  it("refuses a list with nothing describable, without asking the model", async () => {
    const { provider, asked } = fakeProvider(JSON.stringify(six));
    await expect(
      providerInsightsGenerator(provider)(ctx, { ...input, entries: [] }),
    ).rejects.toThrow(ConflictError);
    expect(asked).toEqual([]);
  });

  it("counts an entry as describable on a note alone, not just a name", async () => {
    // `isSubstantive`: a name, a user note, or one vocabulary attribute. A
    // torn read that loses every name must not silently become an empty
    // prompt, but a list the user annotated is still worth reading.
    const noted = [1, 2, 3].map((n) => ({
      ...entry(`x${n}`, 4),
      name: null,
      attributes: [],
      notes: `the one with the ${n} taps`,
    }));
    const { provider, asked } = fakeProvider(JSON.stringify(six));
    await providerInsightsGenerator(provider)(ctx, {
      ...input,
      entries: noted,
    });
    expect(asked).toHaveLength(1);
  });

  it("refuses when two of three entries resolved to nothing at all", async () => {
    const torn = [
      entry("Aviary", 5),
      { ...entry("x", 4), name: null, attributes: [], notes: null },
      { ...entry("y", 3), name: null, attributes: [], notes: null },
    ];
    const { provider, asked } = fakeProvider(JSON.stringify(six));
    await expect(
      providerInsightsGenerator(provider)(ctx, { ...input, entries: torn }),
    ).rejects.toThrow(/only 1 that carry a name/);
    expect(asked).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe("B2 · item onboarding defaults", () => {
  /**
   * Two labels, because `requireExtractableInput` refuses an extraction with
   * none — E2c: a model asked to read a label it was never given answers with
   * a confident invention, so "no image" is not a case this seam has.
   */
  const withLabels = {
    itemType: "WINE",
    frontLabelImageId: "front-id",
    backLabelImageId: "back-id",
    barcode: "012345678905",
    barcodeType: "UPC_A",
  } as const;

  /**
   * The two fields `itemDefaultsSchema` now puts in front of every answer, so
   * a fixture reads as what a model that honoured the schema would actually
   * return (E2g). Declared first here for the same reason they are declared
   * first there: property order is generation order.
   *
   * Note the polarity. The fixtures speak the model's field, `labelIsLegible`,
   * which is positive — a verdict named for the *absence* was measured
   * inverting on the menu seam, where a real menu was read correctly and then
   * declared absent 3/3. There is no negative twin in the domain type here,
   * so unlike `MenuExtractionResult` nothing inverts it back.
   */
  const legible = (answer: Record<string, unknown>): string =>
    JSON.stringify({
      imageDescription: "The front label of a bottle of wine.",
      labelIsLegible: true,
      ...answer,
    });

  it("stores the completion verbatim and lifts brand and confidence out", async () => {
    const defaults = {
      name: "Château Margaux",
      brandName: "Château Margaux",
      country: "FRANCE",
      confidence: 0.87,
      wine: { vintage: "2015-01-01", style: "RED" },
    };
    const raw = legible(defaults);
    const { provider, asked } = fakeProvider(raw);
    loadedIds.length = 0;

    const result = await providerItemDefaults(provider, loader)(
      ctx,
      withLabels,
    );

    // `defaults` is what the wizard pre-fills its form from, so the two
    // grounding fields are *not* in it — they are the model's working, not
    // proposed values for the item.
    expect(result.defaults).toEqual(defaults);
    expect(result.brandName).toBe("Château Margaux");
    expect(result.confidence).toBe(0.87);
    expect(result.model).toBe("fake-model");
    // `raw_defaults` keeps the whole completion, grounding fields included —
    // that column exists to debug a bad extraction.
    expect(result.raw).toBe(raw);
    expect(JSON.parse(result.raw).imageDescription).toBe(
      "The front label of a bottle of wine.",
    );
    // Both labels are loaded, front first.
    expect(loadedIds[0]).toEqual(["front-id", "back-id"]);
    expect(asked[0]?.request.images).toHaveLength(2);
    // A label read is what the whole onboarding hangs off (§8.5).
    expect(asked[0]?.quality).toBe("high");
  });

  /**
   * X1b. `wine_style` holds five rows; before this the schema asked for `style`
   * as free text and the live model answered `"Red Wine"` and `"Chardonnay"` on
   * consecutive runs — each a foreign-key violation raised inside the outbox,
   * where `itemFormRules.ts` says nobody sees it.
   */
  it("constrains the reference-backed fields to the live vocabulary", async () => {
    const { provider, asked } = fakeProvider(
      legible({ name: "x", confidence: 0.3 }),
    );
    await providerItemDefaults(provider, loader)(ctx, withLabels);

    const schema = asked[0]?.request.schema;
    expect(schema?.properties?.wine?.properties?.style?.enum).toEqual(
      TEST_VOCABULARY.wine_style,
    );
    expect(schema?.properties?.wine?.properties?.variety?.enum).toEqual(
      TEST_VOCABULARY.wine_variety,
    );
    expect(schema?.properties?.country?.enum).toEqual(TEST_VOCABULARY.country);
  });

  /**
   * The reversal E2c asked for. `wine.vintage` and `wine.style` used to sit in
   * the bag's `required` list because their columns are `NOT NULL` — but Ollama
   * compiles the schema into the sampler's grammar, so `required` makes "I
   * could not read a vintage" *structurally unsayable* and the model emits a
   * plausible year instead. Measured: adding the bag to `required` turned an
   * empty answer into `{"vintage":"2005","style":"SPARKLING"}` for a wine that
   * does not exist. The form enforces `NOT NULL` instead, against someone who
   * can look at the bottle.
   */
  it("requires nothing but a name and a confidence", async () => {
    const { provider, asked } = fakeProvider(
      legible({ name: "x", confidence: 0.3 }),
    );
    await providerItemDefaults(provider, loader)(ctx, withLabels);

    const schema = asked[0]?.request.schema;
    expect(schema?.required).toEqual([
      "imageDescription",
      "labelIsLegible",
      "name",
      "confidence",
    ]);
    expect(schema?.properties?.wine?.required).toBeUndefined();
    // Still *asked* for, and still told why someone will have to supply it.
    expect(
      schema?.properties?.wine?.properties?.vintage?.description,
    ).toContain("wines.vintage is NOT NULL");
  });

  /**
   * **The one assertion that stops E2g being undone by a tidy-up.**
   *
   * Property order is generation order, and `itemDefaultsSchema` is
   * *assembled* — a literal, then three loops over the vocabulary, then the
   * `input` fields — so the ordering guarantee is JavaScript's key-insertion
   * order rather than anything a reader can see at a glance. Rebuilding that
   * record by spreading it into a fresh object, or moving the two grounding
   * fields below the loops, drops the verdict behind the transcription and
   * restores the grey pixel's CHARDONNAY **as a passing build**: the types
   * check, every other test here still passes, and only the model misbehaves.
   *
   * Nothing else in the suite would notice, so this does.
   */
  it("decodes the two grounding fields before anything they ground", async () => {
    const { provider, asked } = fakeProvider(
      legible({ name: "x", confidence: 0.5 }),
    );
    await providerItemDefaults(provider, loader)(ctx, withLabels);

    const order = Object.keys(asked[0]?.request.schema?.properties ?? {});
    expect(order[0]).toBe("imageDescription");
    expect(order[1]).toBe("labelIsLegible");
    // And the fields they ground really are behind them, not merely absent.
    expect(order.indexOf("name")).toBeGreaterThan(1);
    expect(order.indexOf("wine")).toBeGreaterThan(1);
  });

  it("refuses an onboarding with no label at all, barcode or not", async () => {
    const { provider, asked } = fakeProvider(
      JSON.stringify({ name: "Château d'Yquem", confidence: 0.9 }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, {
        itemType: "WINE",
        frontLabelImageId: null,
        backLabelImageId: null,
        barcode: "5901234123457",
        barcodeType: "EAN_13",
      }),
    ).rejects.toThrow(ConflictError);
    // The point of the guard: the model is never asked.
    expect(asked).toHaveLength(0);
  });

  it("rejects a value the column's vocabulary does not contain", async () => {
    const { provider } = fakeProvider(
      legible({
        name: "Meursault",
        confidence: 0.8,
        wine: { style: "Chardonnay" },
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/wines\.style does not accept/);
  });

  /**
   * The Vertex 400 (2026-10-04). The real `country` table has 197 rows, and
   * an enum that big made Vertex refuse every item-defaults schema on every
   * model, so `country` now goes out as text listing its values. What comes
   * back is normalised: a name the label prints is mapped onto the
   * vocabulary, and anything unmatched is stored as `null`, never as written.
   */
  it("sends a vocabulary over the enum limit as text and normalises the answer", async () => {
    const countries = [
      ...Array.from({ length: 60 }, (_, i) => `COUNTRY_${i}`),
      "FRANCE",
      "UNITED_STATES",
    ];
    setItemVocabularyLoader(async () => ({
      ...TEST_VOCABULARY,
      country: countries,
    }));
    try {
      const run = async (country: string) => {
        const { provider, asked } = fakeProvider(
          legible({ name: "x", confidence: 0.4, country }),
        );
        const result = await providerItemDefaults(provider, loader)(
          ctx,
          withLabels,
        );
        return { result, schema: asked[0]?.request.schema };
      };

      const usa = await run("USA");
      expect(usa.schema?.properties?.country?.enum).toBeUndefined();
      expect(usa.schema?.properties?.country?.description).toContain(
        "UNITED_STATES",
      );
      // Small vocabularies keep their enum.
      expect(usa.schema?.properties?.wine?.properties?.style?.enum).toEqual(
        TEST_VOCABULARY.wine_style,
      );
      expect(usa.result.defaults.country).toBe("UNITED_STATES");
      expect((await run("France")).result.defaults.country).toBe("FRANCE");
      expect((await run("Narnia")).result.defaults.country).toBeNull();
      // The completion itself is still kept verbatim for debugging.
      expect(JSON.parse((await run("Narnia")).result.raw).country).toBe(
        "Narnia",
      );
    } finally {
      setItemVocabularyLoader(async () => TEST_VOCABULARY);
    }
  });

  /* ------------------------------------------------------------------ */
  /* E2g · the 1×1 pixel                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * The case `requireExtractableInput` was written for and could not reach.
   *
   * That guard refuses an onboarding with *no* image; this one has one, and
   * the image is `packages/e2e/specs/09-menu-scan.spec.ts`'s 1×1 grey pixel.
   * Against the running gemma3:4b at `temperature: 0` that produced
   * `{"name": "CHARDONNAY", "confidence": 1.0}` **3 runs of 3** — an invented
   * grape at the maximum confidence the column holds, bound for
   * `item_onboardings.defaults` and the wizard's pre-filled form. The two
   * guards are one rule in two positions; see `requireLegibleLabel`.
   */
  it("refuses the extraction when the model says there is no label", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "The image shows a solid grey background.",
        labelIsLegible: false,
        name: "",
        confidence: 0,
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/no wine label was found/);
  });

  /**
   * The contradiction resolves towards abstention, and nothing the model
   * returned beside its own `false` is kept — a plausible bottle nobody
   * photographed is worse than an empty form.
   */
  it("drops defaults the model returned beside its own `labelIsLegible: false`", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "The image shows a solid grey background.",
        labelIsLegible: false,
        name: "CHARDONNAY",
        confidence: 1,
        wine: { style: "WHITE" },
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/no wine label was found/);
  });

  /** The model's own account of the image, so the refusal says what it saw. */
  it("quotes the model's description in the refusal", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A photograph of a brick wall.",
        labelIsLegible: false,
        name: "",
        confidence: 0,
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/brick wall/);
  });

  /**
   * Reading an absent verdict as `true` is how the grey pixel got through, so
   * it is refused instead. `ConflictError`, not `ValidationError`: a provider
   * that has stopped honouring the output schema is worth retrying, unlike a
   * photograph with no label in it.
   */
  it("refuses an answer with no `labelIsLegible` rather than assuming true", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "The front label of a bottle of wine.",
        name: "Château Margaux",
        confidence: 0.9,
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(ConflictError);
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/labelIsLegible/);
  });

  /** Every item type says its own noun, so the message reads for all six. */
  it("names the type being onboarded in the refusal", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A solid grey image.",
        labelIsLegible: false,
        name: "",
        confidence: 0,
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, {
        ...withLabels,
        itemType: "SPIRIT",
      }),
    ).rejects.toThrow(/no spirit label was found/);
  });

  /* ------------------------------------------------------------------ */
  /* E2h · the menu that was read as a label                             */
  /* ------------------------------------------------------------------ */

  /**
   * The case E2g's verdict could not catch, because it was answered
   * *correctly* to the wrong question.
   *
   * Sent a photograph of a restaurant drinks list — "THE COPPER LANTERN",
   * three wines by the glass with their regions and prices — gemma3:4b at
   * `temperature: 0` described it as a drinks list, answered
   * `labelIsLegible: true`, and transcribed `Chateau Margaux 2015` with
   * `region: "Bordeaux, France"` at `confidence: 1.0`, **4 runs of 4**. The
   * wine is genuinely printed there; the photograph is still not a label.
   * `itemDefaultsSchema` now names the document-shaped near-misses, and the
   * same fixture answers `false` 4/4 with a genuine label still read 4/4.
   *
   * What this asserts is the seam's half: the answer beside the `false` is
   * dropped, exactly as for a blank image.
   */
  it("keeps nothing from a menu the model has declared is not a label", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription:
          "The image shows a printed drinks list titled 'The Copper Lantern'.",
        labelIsLegible: false,
        name: "Chateau Margaux 2015",
        region: "Bordeaux, France",
        confidence: 1,
      }),
    );
    await expect(
      providerItemDefaults(provider, loader)(ctx, withLabels),
    ).rejects.toThrow(/no wine label was found/);
  });

  /**
   * **What the person reads is the point of E2h, not a detail of it.**
   *
   * "We could not read a label" is a lie about this photograph — the text was
   * perfectly legible and the model read it. The refusal has to say what was
   * actually missing, which is the bottle, and it quotes the model's own
   * description so the person can see which of their photos it means.
   */
  it("tells the person it found no container, not that it could not read", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A printed wine list on a restaurant table.",
        labelIsLegible: false,
        name: "",
        confidence: 0,
      }),
    );
    const message = await providerItemDefaults(provider, loader)(
      ctx,
      withLabels,
    ).then(
      () => "the seam accepted a wine list as a label",
      (error: unknown) => String(error),
    );

    expect(message).toContain("no wine label was found in this image");
    expect(message).toContain("container showing its own printed label");
    expect(message).toContain("a menu, a drinks list");
    // Quoted back, so the person knows which photograph is meant.
    expect(message).toContain("printed wine list on a restaurant table");
    // And the sentence E2g used to print, which is false of this photograph:
    // the text was legible and the model read it. What was missing is a bottle.
    expect(message).not.toContain("no readable wine label");
  });

  /**
   * The mechanism, ported from `RECIPE_PHOTO_SCHEMA` rather than invented: the
   * verdict field names the near-miss that actually tempts the model and says
   * why it is disqualified, and the description it is decided from is asked
   * what the text is printed *on*. Every entry in the old false-list was a
   * non-document, which is why a document full of the right words matched
   * nothing.
   */
  it("asks the model about provenance, not only about legibility", async () => {
    const { provider, asked } = fakeProvider(
      legible({ name: "x", confidence: 0.5 }),
    );
    await providerItemDefaults(provider, loader)(ctx, withLabels);

    const properties = asked[0]?.request.schema?.properties;
    expect(properties?.imageDescription?.description).toContain(
      "what that text is printed on",
    );
    const verdict = properties?.labelIsLegible?.description ?? "";
    expect(verdict).toContain("with its own");
    for (const nearMiss of ["menu", "price tag", "shelf ticket", "receipt"]) {
      expect(verdict).toContain(nearMiss);
    }
    // The prompt carries the same rule, for a provider that ignores schemas.
    expect(asked[0]?.request.prompt).toContain(
      "A surface that merely names a wine is not a wine label",
    );
  });

  it("clamps a confidence the model put outside 0–1", async () => {
    const { provider } = fakeProvider(legible({ name: "x", confidence: 12 }));
    const result = await providerItemDefaults(provider, loader)(ctx, {
      ...withLabels,
      itemType: "BEER",
      backLabelImageId: null,
    });
    expect(result.confidence).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("B8 · menu extraction", () => {
  it("maps each line, defaulting an unrecognised itemType to unknown", async () => {
    const { provider, asked } = fakeProvider(
      JSON.stringify({
        imageDescription: "A printed wine list.",
        menuIsLegible: true,
        rawText: "BY THE GLASS\nCh. Margaux '15 … 45",
        confidence: 0.8,
        items: [
          {
            name: "Ch. Margaux '15",
            price: 45,
            menuCategory: "By the Glass",
            itemType: "wine",
            searchName: "Château Margaux 2015",
            confidence: 0.9,
          },
          { name: "Mystery pour", itemType: "grog" },
          { notAName: true },
        ],
      }),
    );
    loadedIds.length = 0;

    const result = await providerMenuExtraction(provider, loader)(ctx, {
      menuScanId: "s-1",
      originalImageId: "orig",
      processedImageId: "processed",
      placeId: "p-1",
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({
      name: "Ch. Margaux '15",
      description: null,
      price: 45,
      menuCategory: "By the Glass",
      itemType: "wine",
      searchName: "Château Margaux 2015",
      confidence: 0.9,
      attributes: null,
    });
    expect(result.lines[1]?.itemType).toBe("unknown");
    expect(result.rawText).toContain("BY THE GLASS");
    expect(result.confidence).toBe(0.8);
    expect(result.model).toBe("fake-model");
    expect(typeof result.durationMs).toBe("number");
    // The processed image is preferred over the original.
    expect(loadedIds[0]).toEqual(["processed"]);
    expect(asked[0]?.quality).toBe("high");
  });

  it("falls back to the original image when there is no processed one", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A blurred photograph of a chalkboard.",
        menuIsLegible: true,
        rawText: "",
        items: [],
        confidence: 0,
      }),
    );
    loadedIds.length = 0;
    await providerMenuExtraction(provider, loader)(ctx, {
      menuScanId: "s",
      originalImageId: "orig",
      processedImageId: null,
      placeId: null,
    });
    expect(loadedIds[0]).toEqual(["orig"]);
  });

  it("scores an empty extraction 0, so no scan looks confidently blank", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A dark, out-of-focus page.",
        menuIsLegible: true,
        rawText: "",
        items: [],
      }),
    );
    const result = await providerMenuExtraction(provider, loader)(ctx, {
      menuScanId: "s",
      originalImageId: "o",
      processedImageId: null,
      placeId: null,
    });
    expect(result.lines).toEqual([]);
    expect(result.confidence).toBe(0);
    // An unreadable *menu*, which is not the same answer as "no menu here".
    expect(result.noMenuDetected).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* B8c · the 1×1 pixel                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * These four are the unit-level statement of what
   * `packages/e2e/specs/09-menu-scan.spec.ts` asserts end to end: a 1×1 grey
   * pixel produced an eighteen-item British pub menu at `completed`, and
   * nothing in the row said otherwise. The cause was that
   * `MENU_EXTRACTION_SCHEMA` had no field an abstention could be expressed in
   * at all, ahead of a `required` transcription that compiled into the
   * sampler's grammar; see that schema for the three measurements, and
   * `providerMenuExtraction` for the gate.
   *
   * Note the polarity: the fixtures below speak the model's field,
   * `menuIsLegible`, and assert on the domain's, `noMenuDetected`. That is
   * the one inversion in this pipeline and it is deliberate —
   * `MENU_EXTRACTION_SCHEMA` §3 has the measurement of a real menu the model
   * read correctly and then declared absent, when the field it was given was
   * named for the absence.
   */
  it("returns an empty extraction when the model says there is no menu", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A solid grey image.",
        menuIsLegible: false,
        rawText: "This image does not contain a legible menu.",
        confidence: 0.9,
        items: [],
      }),
    );
    const result = await providerMenuExtraction(provider, loader)(ctx, {
      menuScanId: "s",
      originalImageId: "o",
      processedImageId: null,
      placeId: null,
    });
    expect(result.noMenuDetected).toBe(true);
    expect(result.lines).toEqual([]);
    // The model's apology is not a transcription, so it is not stored as one:
    // `menu_scans.extracted_text` renders under "What the scanner read".
    expect(result.rawText).toBe("");
    // Nor is a confident "no", which would land in `confidence_score` as 0.90.
    expect(result.confidence).toBe(0);
  });

  it("drops items the model returned alongside its own `menuIsLegible: false`", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A solid grey image.",
        menuIsLegible: false,
        rawText: "BEER\nLOCAL IPA 5.4% - £4.50",
        confidence: 1,
        items: [
          { name: "Local IPA", itemType: "beer", price: 4.5 },
          { name: "Cloud 9 Pale Ale", itemType: "beer", price: 3.75 },
        ],
      }),
    );
    const result = await providerMenuExtraction(provider, loader)(ctx, {
      menuScanId: "s",
      originalImageId: "o",
      processedImageId: null,
      placeId: null,
    });
    // The contradiction resolves towards abstention: by the model's own
    // answer there is no page these came off.
    expect(result.lines).toEqual([]);
    expect(result.noMenuDetected).toBe(true);
  });

  it("refuses an answer with no `menuIsLegible` rather than assuming true", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A wine list.",
        rawText: "WINES\nRioja …",
        items: [],
        confidence: 0.4,
      }),
    );
    await expect(
      providerMenuExtraction(provider, loader)(ctx, {
        menuScanId: "s",
        originalImageId: "o",
        processedImageId: null,
        placeId: null,
      }),
    ).rejects.toThrow(/menuIsLegible/);
  });

  it("refuses lines the model transcribed off an empty page", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        imageDescription: "A solid grey image.",
        menuIsLegible: true,
        rawText: "",
        confidence: 1,
        items: [{ name: "Local IPA", itemType: "beer", price: 4.5 }],
      }),
    );
    await expect(
      providerMenuExtraction(provider, loader)(ctx, {
        menuScanId: "s-42",
        originalImageId: "o",
        processedImageId: null,
        placeId: null,
      }),
    ).rejects.toThrow(/s-42/);
  });
});

/* -------------------------------------------------------------------------- */

describe("B8 · menu match verification", () => {
  const request = {
    placeMenuItemId: "pmi-1",
    menuItemName: "Ch. Margaux '15",
    menuItemDescription: null,
    itemType: "wine" as const,
    candidates: [
      { key: "wine:a", name: "Château Margaux 2015", similarity: 0.71 },
      { key: "wine:b", name: "Château Margaux 2016", similarity: 0.69 },
    ],
  };

  it("accepts a candidate the model chose from the list", async () => {
    const { provider, asked } = fakeProvider(
      JSON.stringify({
        acceptedKey: "wine:a",
        confidence: 0.93,
        reasoning: "Same producer and vintage.",
      }),
    );
    const result = await providerMenuMatchVerifier(provider)(ctx, request);
    expect(result).toEqual({
      acceptedKey: "wine:a",
      confidence: 0.93,
      reasoning: "Same producer and vintage.",
      model: "fake-model",
    });
    expect(asked[0]?.request.prompt).toContain("wine:b");
  });

  it('turns the literal "none" into null — a real answer, not a failure', async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        acceptedKey: "none",
        confidence: 0.8,
        reasoning: "Different vintages.",
      }),
    );
    const result = await providerMenuMatchVerifier(provider)(ctx, request);
    expect(result.acceptedKey).toBe(null);
    expect(result.confidence).toBe(0.8);
  });

  it("refuses a key the model invented, rather than reading it as a rejection", async () => {
    // Silently mapping a hallucinated id to `null` would hide a prompt
    // regression behind output that looks exactly like a considered "no".
    const { provider } = fakeProvider(
      JSON.stringify({
        acceptedKey: "wine:z",
        confidence: 0.99,
        reasoning: "Confident about something that does not exist.",
      }),
    );
    await expect(
      providerMenuMatchVerifier(provider)(ctx, request),
    ).rejects.toThrow(/was not one of the 2 offered/);
  });
});

/* -------------------------------------------------------------------------- */

describe("C4 · recipe photo extraction", () => {
  const recipe = {
    imageDescription: "A handwritten recipe card for an Old Fashioned.",
    recipeIsLegible: true,
    name: "Old Fashioned",
    type: "cocktail",
    description: "Sugar, bitters, whiskey.",
    difficultyLevel: 2,
    prepTimeMinutes: 5,
    servingSize: 1,
    groupName: "Old Fashioned",
    confidence: 0.9,
    ingredients: [
      { name: "Bourbon", quantity: 2, unit: "oz", itemType: "spirits" },
      { name: "Sugar cube", quantity: 1, isOptional: false },
      { notAnIngredient: true },
    ],
    instructions: [
      { instructionText: "Muddle the sugar with bitters.", timeMinutes: 1 },
      { instructionType: "serve" },
    ],
  };

  it("maps the recipe and loads every photo", async () => {
    const { provider, asked } = fakeProvider(JSON.stringify(recipe));
    loadedIds.length = 0;

    const result = await providerRecipePhotoExtractor(provider, loader)(ctx, {
      jobId: "j-1",
      fileId: "main",
      additionalFileIds: ["extra-1", "extra-2"],
      notes: "from my grandmother's card",
    });

    expect(result.model).toBe("fake-model");
    expect(result.recipe.name).toBe("Old Fashioned");
    expect(result.recipe.groupName).toBe("Old Fashioned");
    // The two malformed rows are dropped, the good ones kept in order.
    expect(result.recipe.ingredients).toHaveLength(2);
    expect(result.recipe.ingredients[0]).toEqual({
      name: "Bourbon",
      quantity: 2,
      unit: "oz",
      isOptional: null,
      substitutionNotes: null,
      itemType: "spirits",
      brandName: null,
      category: null,
    });
    expect(result.recipe.instructions).toHaveLength(1);
    expect(loadedIds[0]).toEqual(["main", "extra-1", "extra-2"]);
    expect(asked[0]?.request.images).toHaveLength(3);
    expect(asked[0]?.request.prompt).toContain("grandmother");
    expect(asked[0]?.quality).toBe("high");
  });

  const extract = (answer: Record<string, unknown>, jobId = "j") => {
    const { provider } = fakeProvider(JSON.stringify(answer));
    return providerRecipePhotoExtractor(provider, loader)(ctx, {
      jobId,
      fileId: "f",
      additionalFileIds: [],
      notes: null,
    });
  };

  /**
   * **This one asserts a guard that could not fire until C4c.**
   *
   * The refusal is the case `recipe-photo-ai.ts` exists to prevent — a job
   * that completes, writes a row, and leaves the user with nothing and no
   * error — and the test passed for exactly that reason before, on a
   * hand-built fixture with an empty array in it. What no fixture could show
   * is that **a real model never produced one**: `ingredients` was `required`
   * in a schema with nowhere to abstain, so a blank image made the model fill
   * the array rather than leave it empty, and this line was unreachable from
   * the input it was written for. The block below is the part that was
   * missing.
   *
   * It is `ValidationError` now, not `ConflictError`: `isPermanentFailure`
   * reads `VALIDATION`, and an image that is not a recipe will not become one
   * on the tenth outbox delivery.
   */
  it("refuses a recipe with no ingredients rather than writing an empty one", async () => {
    await expect(extract({ ...recipe, ingredients: [] })).rejects.toThrow(
      /read no ingredients off it/,
    );
  });

  it("refuses a recipe with no name", async () => {
    await expect(extract({ ...recipe, name: "" })).rejects.toThrow(/`name`/);
  });

  /* ------------------------------------------------------------------ */
  /* C4c · the 1×1 pixel                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * The unit-level statement of what the grey pixel did to this seam.
   *
   * Sent `packages/e2e/specs/09-menu-scan.spec.ts`'s 70-byte fixture,
   * gemma3:4b returned a complete "Chocolate Chip Cookies" — nine ingredients
   * and a `Preheat oven to 375 degrees F` — **3 runs of 3 at `temperature: 0`,
   * byte-identical**. The cause was that `RECIPE_PHOTO_SCHEMA` had no field an
   * abstention could be expressed in at all, ahead of a `required` ingredient
   * list that compiled into the sampler's grammar; see that schema for the
   * measurements and `providerRecipePhotoExtractor` for the gate.
   */
  it("refuses the extraction when the model says there is no recipe", async () => {
    await expect(
      extract({
        imageDescription: "A solid grey image.",
        recipeIsLegible: false,
        name: "None",
        type: "None",
        ingredients: [],
        instructions: [],
      }),
    ).rejects.toThrow(/no recipe could be read/);
  });

  /**
   * The contradiction resolves towards abstention: by the model's own answer
   * there is no photograph these came off. The costs are not symmetric — a
   * missed recipe is a re-shoot, an invented one is a drink the person is told
   * they photographed.
   */
  it("drops a recipe the model returned beside its own `recipeIsLegible: false`", async () => {
    await expect(
      extract({
        imageDescription: "A solid grey image.",
        recipeIsLegible: false,
        name: "Chocolate Chip Cookies",
        type: "food",
        ingredients: [
          { name: "butter", quantity: 1, unit: "cup" },
          { name: "chocolate chips", quantity: 2, unit: "cups" },
        ],
        instructions: [{ instructionText: "Preheat oven to 375 degrees F." }],
      }),
    ).rejects.toThrow(/no recipe could be read/);
  });

  /**
   * Defaulting the absent verdict to `true` would restore the defect exactly,
   * silently, the first time a provider stopped constraining its sampler — so
   * a missing `recipeIsLegible` is a fact about the provider, raised as one.
   * `ConflictError` here and not `ValidationError`: a misconfigured provider
   * is worth retrying, unlike a photograph with no recipe in it.
   */
  it("refuses an answer with no `recipeIsLegible` rather than assuming true", async () => {
    const { recipeIsLegible: _absent, ...noVerdict } = recipe;
    await expect(extract(noVerdict)).rejects.toThrow(ConflictError);
    await expect(extract(noVerdict)).rejects.toThrow(/recipeIsLegible/);
  });

  /** The job id is in the message, because that is what an operator greps. */
  it("names the job in both refusals", async () => {
    await expect(
      extract({ ...recipe, recipeIsLegible: false }, "j-42"),
    ).rejects.toThrow(/j-42/);
    await expect(
      extract({ ...recipe, ingredients: [] }, "j-43"),
    ).rejects.toThrow(/j-43/);
  });

  /* ------------------------------------------------------------------ */
  /* C4d · the type that was never answered legally                      */
  /* ------------------------------------------------------------------ */

  /**
   * `type` was free text and `str(parsed.type) ?? "cocktail"` swallowed every
   * answer the model gave. It gave two, on real cards at `temperature: 0`,
   * 4 runs of 4 each: `"recipe"` before C4c and `"groupName"` after — the
   * latter being the *name of the property declared next*, which is what an
   * unconstrained string in a grammar-compiled object rule invites. Both
   * became `cocktail`, so a photographed roast chicken was filed as a drink.
   *
   * The schema now carries `RECIPE_TYPES` as an `enum`; this is the other
   * half, for a provider that does not honour it. `ValidationError`, so the
   * outbox treats it as permanent.
   */
  it("refuses a `type` outside `recipes_type_check` rather than defaulting", async () => {
    for (const answered of ["groupName", "recipe", "coffee", "COCKTAIL", ""]) {
      await expect(
        extract({ ...recipe, type: answered }, "j-7"),
      ).rejects.toThrow(/not one of the 2 values/);
    }
    const { type: _absent, ...noType } = recipe;
    await expect(extract(noType, "j-7")).rejects.toThrow(/not one of the 2/);
  });

  it("keeps a legal `type`, including the one the fallback used to hide", async () => {
    for (const answered of RECIPE_TYPES) {
      const result = await extract({ ...recipe, type: answered });
      expect(result.recipe.type).toBe(answered);
    }
  });

  /**
   * The corollary the fix turns on, asserted rather than commented: property
   * order is generation order, so `type` has to decode **after** the
   * transcription it is supposed to be read off. Beside `name` it is answered
   * from the title; here it is answered from the ingredients and steps the
   * model has already committed to. Nothing in the type system notices if
   * this moves, which is the whole reason for the assertion.
   */
  it("decodes `type` and `groupCategory` after the transcription", () => {
    const order = Object.keys(RECIPE_PHOTO_SCHEMA.properties ?? {});
    expect(order.indexOf("type")).toBeGreaterThan(order.indexOf("ingredients"));
    expect(order.indexOf("type")).toBeGreaterThan(
      order.indexOf("instructions"),
    );
    expect(order.indexOf("groupCategory")).toBeGreaterThan(
      order.indexOf("instructions"),
    );
    // Still in front of everything, for the same reason they always were.
    expect(order[0]).toBe("imageDescription");
    expect(order[1]).toBe("recipeIsLegible");
  });

  /**
   * The enums are the database's, not a hand-kept list beside it.
   * `recipes_type_check` is `type = ANY (ARRAY['food', 'cocktail'])` and the
   * `recipe_category` Postgres enum is `cocktail, mocktail, other, punch,
   * shot`; `RECIPE_TYPES` and `RECIPE_CATEGORIES` mirror them, and this holds
   * the schema against those rather than against a copy of itself — the way
   * `place-review.test.ts` holds `PLACE_REVIEW_CATEGORIES` against the form's
   * own list.
   */
  it("offers the model every value the columns accept, and no others", () => {
    const properties = RECIPE_PHOTO_SCHEMA.properties ?? {};
    expect(properties.type?.enum).toEqual([...RECIPE_TYPES]);
    expect(properties.groupCategory?.enum).toEqual([...RECIPE_CATEGORIES]);
    expect(RECIPE_PHOTO_SCHEMA.required).toContain("type");
    // `groupCategory` stays omittable: a recipe need belong to no group.
    expect(RECIPE_PHOTO_SCHEMA.required).not.toContain("groupCategory");
  });
});
