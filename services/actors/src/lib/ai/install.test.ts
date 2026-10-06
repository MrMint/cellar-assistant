/**
 * **Every model call this system makes is metered** — the property, not the
 * mechanism (X1c).
 *
 * `budget.test.ts` covers what a metered provider does. This covers the thing
 * that is actually easy to get wrong, and that this repository has already got
 * wrong once at exactly this layer: wiring six of seven. B5b's defect was a
 * seam, a registry and a constructor default that all existed while
 * `installSeams` never filled one of them, so AI place review was dark in
 * production behind a green suite (`install.ts`, and the comment on the
 * `setPlaceReviewer` line). A meter installed on six seams would fail the same
 * way and look the same doing it, because the seventh would still *work* — it
 * would just be free.
 *
 * So the assertion is over the list, not over a seam: install with a budget
 * that refuses everything, drive all seven seams with inputs that get past
 * their own pre-model gates, and require that every one of them refuses. A
 * seam that was not metered would sail past and return an answer.
 *
 * That doubles as the abstention proof. A refusal has to arrive as a
 * `BudgetExceededError` and nothing else — not an empty extraction, not a
 * neutral approval, not a zero vector. Those are the confabulations this
 * directory's five seam docs each record a measurement of, and an accounting
 * layer that invented one would be reintroducing the defect from the side.
 *
 *   bun run --filter @cellar-assistant/actors test install
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  BudgetExceededError,
  formatStoredFailure,
  ValidationError,
} from "@cellar-assistant/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelReserveInput } from "../../actors/budget-actor.ts";
import { MODEL_SEAMS } from "../../actors/budget-actor.ts";
import { placeReviewer } from "../../actors/place-creation-actor.ts";
import { insightsGenerator } from "../../actors/tier-list-actor.ts";
import { embedder } from "../embeddings.ts";
import {
  documentImageEmbedder,
  queryImageEmbedder,
} from "../image-embeddings.ts";
import { itemDefaultsProvider } from "../item-defaults.ts";
import { menuExtractionProvider, menuMatchVerifier } from "../menu-ai.ts";
import { recipePhotoExtractor } from "../recipe-photo-ai.ts";
import { embeddingModel, setEmbeddingModel } from "../vectors.ts";
import type { ModelBudget } from "./budget.ts";
import { readAIProviderConfig } from "./config.ts";
import type { ImageLoader } from "./images.ts";
import { embeddingModelIdentity, installAI } from "./install.ts";
import type { AIProvider } from "./types.ts";
import type { ItemVocabulary } from "./vocabulary.ts";
import { resetItemVocabulary, setItemVocabularyLoader } from "./vocabulary.ts";

const ctx: Ctx = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  kind: "user",
  requestId: "r-1",
};

/**
 * Answers every seam with something it would accept, so that nothing in this
 * file fails for a reason other than the budget. It also records its calls: a
 * refused seam must not reach it at all, which is the half of "refusal" that
 * says no money was spent either.
 */
const calls: string[] = [];
const provider: AIProvider = {
  name: "vertex-ai",
  getAvailableQualities: () => ["low", "medium", "high"],
  async generateContent(request) {
    calls.push(request.prompt.slice(0, 24));
    return {
      content: JSON.stringify(ANSWER),
      metadata: {
        model: "gemini-3.5-flash-lite",
        provider: "vertex-ai",
        processingTime: 1,
        inputTokens: 100,
        outputTokens: 10,
      },
    };
  },
  async generateEmbeddings() {
    calls.push("embed");
    return {
      embeddings: [0],
      metadata: {
        model: "text-embedding-004",
        dimensions: 1,
        provider: "vertex-ai",
      },
    };
  },
};

/**
 * One object that satisfies all six completion shapes at once. The seams read
 * disjoint field sets, so a union is legal for each of them, and what this
 * file is asserting is which seams *charge* — `seams.test.ts` is where each
 * completion shape is pinned down properly.
 */
const ANSWER = {
  // insights
  palateProfile: "Comfortable.",
  archetype: "The Comfort Maximalist",
  // item defaults
  imageDescription: "A wine label.",
  labelIsLegible: true,
  name: "Château Margaux",
  confidence: 0.9,
  // menu extraction
  menuIsLegible: true,
  rawText: "BY THE GLASS",
  items: [],
  // menu match
  acceptedKey: "none",
  reasoning: "Neither is close.",
  // recipe photo
  recipeIsLegible: true,
  type: "cocktail",
  ingredients: [{ name: "Bourbon", quantity: 2, unit: "oz" }],
  instructions: [{ instructionText: "Stir." }],
  // place review
  approved: true,
};

const loadImages: ImageLoader = async (_c, ids) =>
  ids.map(() => new Uint8Array([1]));

const VOCABULARY: ItemVocabulary = {
  beer_style: ["IPA"],
  coffee_cultivar: ["BOURBON"],
  country: ["FRANCE"],
  sake_category: ["JUNMAI"],
  sake_rice_variety: ["YAMADA_NISHIKI"],
  sake_type: ["DRY"],
  spirit_type: ["GIN"],
  tea_category: ["GREEN"],
  wine_style: ["RED"],
  wine_variety: ["MERLOT"],
};

/** Records what it was asked, and answers the way the test tells it to. */
const budgetThat = (
  allowed: boolean,
): {
  budget: ModelBudget;
  reserved: ModelReserveInput[];
  /** The ctx each reservation was made under, index-aligned with `reserved`. */
  ctxs: Ctx[];
} => {
  const reserved: ModelReserveInput[] = [];
  const ctxs: Ctx[] = [];
  return {
    reserved,
    ctxs,
    budget: {
      reserve: async (c, input) => {
        reserved.push(input);
        ctxs.push(c);
        return {
          allowed,
          effectiveCostCents: 0,
          currentSpendCents: 0,
          limitCents: 500,
          requestCount: 0,
          freeTierLimit: 0,
          isEnabled: true,
          reason: allowed ? "charged" : "monthly budget exhausted",
          usageId: allowed ? "u-1" : null,
        };
      },
      settle: async () => {},
    },
  };
};

const asImageModel = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = embeddingModel();
  setEmbeddingModel(embeddingModelIdentity("vertex-ai", "gemini-embedding-2"));
  try {
    return await run();
  } finally {
    setEmbeddingModel(previous);
  }
};

/** Each seam, with an input that gets past its own pre-model gate. */
const drive: Readonly<Record<string, (c: Ctx) => Promise<unknown>>> = {
  embedding: (c) => embedder()({ text: "pinot noir" }, c),
  // G32: the two image slots' pre-model gate is the embedding model's
  // capability, which `ENV` (Ollama's text-only model) would refuse before
  // charging — correctly, and `image-embedder.test.ts` holds that. Here the
  // question is the charge, so each drive runs as `gemini-embedding-2`.
  image_embedding: (c) =>
    asImageModel(() => documentImageEmbedder()(c, { fileId: "f-1" })),
  image_search: (c) =>
    asImageModel(() => queryImageEmbedder()(c, { fileId: "f-1" })),
  tier_list_insights: (c) =>
    insightsGenerator()(c, {
      tierListId: "t-1",
      name: "Best bars",
      description: null,
      listType: "PLACE",
      entries: [1, 2, 3].map((n) => ({
        ref: { type: "PLACE" as const, id: `p-${n}` },
        name: `Bar ${n}`,
        attributes: [{ label: "category", value: "wine_bar" }],
        location: "Austin, TX, US",
        summary: null,
        publicRating: null,
        publicRatingCount: null,
        priceLevel: null,
        band: n,
        position: 0,
        notes: null,
      })),
    }),
  item_defaults: (c) =>
    itemDefaultsProvider()(c, {
      itemType: "WINE",
      frontLabelImageId: "front-id",
      backLabelImageId: null,
      barcode: null,
      barcodeType: null,
    }),
  menu_extraction: (c) =>
    menuExtractionProvider()(c, {
      menuScanId: "s-42",
      originalImageId: "o",
      processedImageId: null,
      placeId: null,
    }),
  menu_match: (c) =>
    menuMatchVerifier()(c, {
      placeMenuItemId: "pmi-1",
      menuItemName: "Ch. Margaux '15",
      menuItemDescription: null,
      itemType: "wine",
      candidates: [
        { key: "wine:a", name: "Château Margaux 2015", similarity: 0.71 },
      ],
    }),
  place_review: (c) =>
    placeReviewer()(c, {
      name: "Bar Part Time",
      categories: ["wine_bar"],
      location: { lng: -122.4194, lat: 37.7749 },
      streetAddress: "496 14th St",
      locality: "San Francisco",
      region: "CA",
      countryCode: "US",
      phone: null,
      website: null,
      description: null,
    }),
  recipe_photo: (c) =>
    recipePhotoExtractor()(c, {
      jobId: "j-1",
      fileId: "f-1",
      additionalFileIds: [],
      notes: null,
    }),
};

const ENV = { AI_PROVIDER: "ollama" } as const;

beforeEach(() => {
  calls.length = 0;
  setItemVocabularyLoader(async () => VOCABULARY);
});

afterEach(resetItemVocabulary);

describe("installSeams records which embedding every vector is made by", () => {
  afterEach(() => setEmbeddingModel(null));

  it("sets the process's embedding identity from the provider and configured model", () => {
    installAI({ env: ENV, provider, loadImages });
    const config = readAIProviderConfig(ENV);
    expect(embeddingModel()).toEqual({
      key: `vertex-ai:${config.embeddingModel}@768/RETRIEVAL_DOCUMENT`,
      acceptsImages: false,
    });
  });

  it("takes images only for gemini-embedding-2 on the two Google providers", () => {
    expect(embeddingModelIdentity("vertex-ai", "gemini-embedding-2")).toEqual({
      key: "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT",
      acceptsImages: true,
    });
    expect(
      embeddingModelIdentity("google-ai", "gemini-embedding-2-preview")
        .acceptsImages,
    ).toBe(true);
    expect(
      embeddingModelIdentity("vertex-ai", "text-embedding-005").acceptsImages,
    ).toBe(false);
    expect(
      embeddingModelIdentity("openai-compatible", "gemini-embedding-2")
        .acceptsImages,
    ).toBe(false);
  });
});

describe("installSeams meters every model call (X1c)", () => {
  it("drives one seam per entry in MODEL_SEAMS — the list is the test", () => {
    expect(Object.keys(drive).sort()).toEqual([...MODEL_SEAMS].sort());
  });

  it("charges exactly once per seam invocation, naming that seam", async () => {
    const { budget, reserved } = budgetThat(true);
    installAI({ env: ENV, provider, loadImages, budget });

    for (const seam of MODEL_SEAMS) {
      await drive[seam]?.(ctx);
    }

    expect(reserved.map((r) => r.seam)).toEqual([...MODEL_SEAMS]);
    // Seven seams, seven model calls: the 1:1 that makes a per-invocation
    // charge the right granularity. A seam that grew a second call would
    // break this rather than silently halve its own accounting.
    expect(calls).toHaveLength(MODEL_SEAMS.length);
  });

  it("attributes every charge to the viewer and names a real model", async () => {
    const { budget, reserved } = budgetThat(true);
    // `env` picks the *models* (the fake provider is injected, so no vertex
    // credentials are read); `provider.name` is what decides free-vs-paid.
    installAI({ env: ENV, provider, loadImages, budget });
    await drive.embedding?.(ctx);

    const [first] = reserved;
    expect(first?.provider).toBe("vertex-ai");
    expect(first?.model).not.toBe("");
    expect(first?.inputTokens).toBeGreaterThan(0);
    expect(first?.reservationId).toContain("embedding");
  });

  /**
   * The test above is named for attribution and only checks the provider. The
   * ctx is what `BudgetActor.reserveForModel` attributes the spend to
   * (`triggeredBy: ctx.viewerId`) and what it refuses an anonymous caller on,
   * so a seam that metered under a ctx of its own making — a `systemCtx`, say
   * — would book every call to nobody and let a signed-out caller spend. The
   * mutation audit (2026-09-27) found exactly that change left this file
   * green, in `budget.ts` and in `seams.ts` alike.
   */
  it("reserves under the caller's own ctx, on every seam", async () => {
    const { budget, reserved, ctxs } = budgetThat(true);
    installAI({ env: ENV, provider, loadImages, budget });

    for (const seam of MODEL_SEAMS) await drive[seam]?.(ctx);

    expect(reserved.map((r) => r.seam)).toEqual([...MODEL_SEAMS]);
    for (const [i, seen] of ctxs.entries()) {
      expect(seen, reserved[i]?.seam).toEqual(ctx);
    }
  });

  /**
   * `model` decides the rate, and `installAI` is what hands the configured
   * ids to the meter. Without them every call is quoted as
   * `<provider>:unknown`, which no rate matches — so each one is billed at
   * `UNKNOWN_PAID_RATE`, the dearest there is, and "names a real model" above
   * still passes because that string is not empty.
   */
  it("quotes the models the configuration names, not a placeholder", async () => {
    const { budget, reserved } = budgetThat(true);
    installAI({ env: ENV, provider, loadImages, budget });
    const config = readAIProviderConfig(ENV);

    for (const seam of MODEL_SEAMS) await drive[seam]?.(ctx);

    const configured: string[] = Object.values(config.models);
    for (const reservation of reserved) {
      if (
        reservation.seam === "embedding" ||
        reservation.seam === "image_embedding" ||
        reservation.seam === "image_search"
      ) {
        // The three embedding seams are priced at the embedding model.
        expect(reservation.model, reservation.seam).toBe(config.embeddingModel);
      } else {
        expect(configured, reservation.seam).toContain(reservation.model);
      }
    }
  });

  it("every reservation id is distinct, so a batch is not one charge", async () => {
    const { budget, reserved } = budgetThat(true);
    installAI({ env: ENV, provider, loadImages, budget });

    // `MenuMatchJobActor.processBatch` does exactly this: one delivery, one
    // ctx, one model call per row. Sharing the outbox row's idempotency key
    // would collapse the batch into a single charge.
    for (let i = 0; i < 3; i += 1) await drive.menu_match?.(ctx);

    const ids = new Set(reserved.map((r) => r.reservationId));
    expect(ids.size).toBe(3);
  });

  /**
   * The test above only proves distinctness inside one process, which the old
   * `requestId:<counter>` ids also passed — and a counter restarts with the
   * process. Each `firstIdAfterBoot` is a fresh module graph, i.e. what a
   * restarted actor host installs, driven with the *same* ctx: exactly what an
   * outbox redelivery after a restart looks like. Under the old scheme both
   * boots minted `ai_model:menu_match:r-1:1`, and `BudgetActor` answered the
   * second from the first's row without counting it.
   */
  it("reservation ids stay distinct across a restart, for the same request", async () => {
    const firstIdAfterBoot = async (): Promise<string | undefined> => {
      vi.resetModules();
      const { installAI: install } = await import("./install.ts");
      const { menuMatchVerifier: verifier } = await import("../menu-ai.ts");
      const { budget, reserved } = budgetThat(true);
      install({ env: ENV, provider, loadImages, budget });
      await verifier()(ctx, {
        placeMenuItemId: "pmi-1",
        menuItemName: "Ch. Margaux '15",
        menuItemDescription: null,
        itemType: "wine",
        candidates: [
          { key: "wine:a", name: "Château Margaux 2015", similarity: 0.71 },
        ],
      });
      return reserved[0]?.reservationId;
    };
    const before = await firstIdAfterBoot();
    const after = await firstIdAfterBoot();
    expect(before).toMatch(/^ai_model:menu_match:/);
    expect(after).not.toBe(before);
  });
});

describe("a refusal is a refusal, on every seam", () => {
  it("throws BudgetExceededError rather than answering, and calls no model", async () => {
    const { budget } = budgetThat(false);
    installAI({ env: ENV, provider, loadImages, budget });

    for (const seam of MODEL_SEAMS) {
      const run = drive[seam];
      if (run === undefined) throw new Error(`no driver for ${seam}`);
      await expect(run(ctx), seam).rejects.toThrow(BudgetExceededError);
      await expect(run(ctx), seam).rejects.toThrow(/refused/);
    }

    // The half that says no money was spent: a denial must not reach the
    // provider at all. `#reserve` writes no usage row for a denial either, so
    // re-asking after the budget is raised works.
    expect(calls).toEqual([]);
  });

  it("the message says a refusal happened, not that nothing was found", async () => {
    const { budget } = budgetThat(false);
    installAI({ env: ENV, provider, loadImages, budget });

    await expect(drive.menu_extraction?.(ctx)).rejects.toThrow(
      /this is a refusal, not an answer/,
    );
  });

  /**
   * The last hop, because "throws" is only honest if the throw survives to
   * somewhere a person reads.
   *
   * `MenuScanActor.process` catches an extraction failure, writes
   * `formatStoredFailure(error)` into `menu_scans.processing_error`, marks the
   * scan `failed` and rethrows. `services/api`'s `failureSummary` parses the
   * code off the front of that string and renders one bounded sentence — for
   * `BUDGET_EXCEEDED`, *"The allowance for AI processing is used up for now.
   * Try again later."* (`failure-summary.ts`, and `failure-summary.test.ts`
   * holds the mapping). This asserts the join between the two: the code the
   * refusal carries is the code that stored string leads with.
   *
   * So the person is told the truth — a limit, and that time is the remedy —
   * and is told it instead of being shown an empty menu they would read as
   * "nothing was on the page". That distinction is the whole point:
   * `providerMenuExtraction`'s own doc records a grey pixel coming back as
   * eighteen invented items, and a budget refusal rendered as an empty
   * extraction would be the same lie with a different cause.
   */
  it("stores a code the API renders as an allowance message, not as an empty result", async () => {
    const { budget } = budgetThat(false);
    installAI({ env: ENV, provider, loadImages, budget });

    const error = await drive.menu_extraction?.(ctx).catch((e: unknown) => e);
    expect(formatStoredFailure(error)).toMatch(/^BUDGET_EXCEEDED: /);
    // Not CONFLICT ("being retried automatically") and not VALIDATION ("the
    // photo was rejected"): both would describe a refusal as a defect in the
    // photograph the person took.
    expect(formatStoredFailure(error)).not.toMatch(/^(CONFLICT|VALIDATION): /);
  });
});

/**
 * `BudgetActor` parses `AI_MODEL_PRICES` and `AI_BUDGET_MAX_REQUESTS` on every
 * activation, and it meters Google Places as well as models — so a typo in
 * either used to boot a host that looked healthy and then failed every budget
 * call, autocomplete included, from the first request. The boot is where the
 * provider config is already validated; the budget's own overrides are now
 * validated there too, and whether or not a provider is configured.
 */
describe("installAI refuses to boot on a malformed budget override", () => {
  it.each([
    { AI_MODEL_PRICES: "gemini-3.5-flash-lite=cheap" },
    { AI_BUDGET_MAX_REQUESTS: "embedings=5" },
    { OPENAI_COMPAT_FREE: "maybe" },
    // With a provider configured, the same.
    { AI_PROVIDER: "ollama", AI_BUDGET_MAX_REQUESTS: "embedding=lots" },
  ])("throws for %o", (env) => {
    expect(() => installAI({ env, provider, loadImages })).toThrow(
      ValidationError,
    );
  });

  it("boots with the overrides empty, which is what compose passes when they are unset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        installAI({ env: { AI_MODEL_PRICES: "", AI_BUDGET_MAX_REQUESTS: "" } })
          .installed,
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
