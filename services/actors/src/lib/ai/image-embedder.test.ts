/**
 * `providerImageEmbedder` — G32's seam, driven with a fake provider and a fake
 * budget, so nothing here needs a network or a sidecar.
 *
 * Three properties, each a way image search could be quietly wrong:
 *
 *  - **"cannot" is said before anything is spent** — a process whose
 *    embedding model cannot take a photograph refuses with the branchable
 *    `IMAGE_SEARCH_UNAVAILABLE`, having fetched no image and reserved no budget;
 *  - **a match is the photo alone** — one image, no text, `type: "image"`,
 *    shrunk to at most 768 px, through the metered provider;
 *  - **a budget refusal is a refusal** — `BudgetExceededError`, with the model
 *    never called, not a zero vector that would rank everything at 1.0.
 */
import type { Ctx, ReserveResult } from "@cellar-assistant/contracts";
import { BudgetExceededError } from "@cellar-assistant/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { USER_CAPS } from "../../actors/budget-actor.ts";
import { downscaleForEmbedding } from "../image-downscale.ts";
import { setEmbeddingModel } from "../vectors.ts";
import type { ModelBudget, SeamModels } from "./budget.ts";
import { EMBEDDING_IMAGE_TEXT_TOKENS, meteredProviderFor } from "./budget.ts";
import { geminiEmbeddingParts } from "./gemini.ts";
import type { ImageLoader } from "./images.ts";
import { providerImageEmbedder } from "./seams.ts";
import type { AIProvider, EmbeddingRequest } from "./types.ts";

const ctx: Ctx = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  kind: "user",
  requestId: "r-1",
};

const MODELS: SeamModels = {
  low: "gemini-3.1-flash-lite",
  medium: "gemini-3.5-flash-lite",
  high: "gemini-3.5-flash",
  embedding: "gemini-embedding-2",
};

const VECTOR = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));

const fakeProvider = (): {
  provider: AIProvider;
  asked: EmbeddingRequest[];
} => {
  const asked: EmbeddingRequest[] = [];
  return {
    asked,
    provider: {
      name: "vertex-ai",
      getAvailableQualities: () => ["low", "medium", "high"],
      async generateContent() {
        throw new Error("an image embedding generates no content");
      },
      async generateEmbeddings(request) {
        asked.push(request);
        return {
          embeddings: VECTOR,
          metadata: {
            model: "gemini-embedding-2",
            dimensions: 768,
            provider: "vertex-ai",
          },
        };
      },
    },
  };
};

const fakeBudget = (
  allowed: boolean,
): {
  budget: ModelBudget;
  reserved: { seam: string; inputTokens: number }[];
} => {
  const reserved: { seam: string; inputTokens: number }[] = [];
  return {
    reserved,
    budget: {
      reserve: async (_ctx, input) => {
        reserved.push({ seam: input.seam, inputTokens: input.inputTokens });
        return {
          allowed,
          effectiveCostCents: 0,
          currentSpendCents: 0,
          limitCents: 200,
          requestCount: 0,
          freeTierLimit: 0,
          isEnabled: true,
          reason: allowed ? "charged" : "per-user cap reached",
          usageId: "u-1",
        } satisfies ReserveResult;
      },
      settle: async () => {},
    },
  };
};

const loaded: string[][] = [];
const loader =
  (bytes: Uint8Array): ImageLoader =>
  async (_ctx, fileIds) => {
    loaded.push([...fileIds]);
    return fileIds.map(() => bytes);
  };

const TINY = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("providerImageEmbedder (G32)", () => {
  afterEach(() => {
    setEmbeddingModel(null);
    loaded.length = 0;
  });

  it("refuses with IMAGE_SEARCH_UNAVAILABLE when the embedding model is text only — nothing fetched, nothing charged", async () => {
    setEmbeddingModel({
      key: "ollama:nomic-embed-text@768/RETRIEVAL_DOCUMENT",
      acceptsImages: false,
    });
    const { provider, asked } = fakeProvider();
    const { budget, reserved } = fakeBudget(true);
    const embed = providerImageEmbedder(
      meteredProviderFor(provider, "image_search", MODELS, { budget }),
      loader(TINY),
    );
    await expect(embed(ctx, { fileId: "f-1" })).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "IMAGE_SEARCH_UNAVAILABLE",
    });
    expect(loaded).toEqual([]);
    expect(reserved).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("refuses the same way with no embedding model at all", async () => {
    const { provider } = fakeProvider();
    const { budget } = fakeBudget(true);
    const embed = providerImageEmbedder(
      meteredProviderFor(provider, "image_search", MODELS, { budget }),
      loader(TINY),
    );
    await expect(embed(ctx, { fileId: "f-1" })).rejects.toMatchObject({
      reason: "IMAGE_SEARCH_UNAVAILABLE",
    });
  });

  it("embeds the photo alone, charged to its seam at one image's price", async () => {
    setEmbeddingModel({
      key: "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT",
      acceptsImages: true,
    });
    const { provider, asked } = fakeProvider();
    const { budget, reserved } = fakeBudget(true);
    const embed = providerImageEmbedder(
      meteredProviderFor(provider, "image_search", MODELS, { budget }),
      loader(TINY),
    );
    await expect(embed(ctx, { fileId: "f-1" })).resolves.toEqual(VECTOR);
    expect(loaded).toEqual([["f-1"]]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ type: "image", content: "" });
    expect(asked[0]?.images).toHaveLength(1);
    expect(asked[0]?.taskType).toBeUndefined();
    // One image at the embedding text rate: $0.00012, which is also what
    // Vertex bills (258 image tokens at $0.45/M, measured 2026-10-05).
    expect(reserved).toEqual([
      { seam: "image_search", inputTokens: EMBEDDING_IMAGE_TEXT_TOKENS },
    ]);
  });

  it("is a refusal, not a vector, when the budget says no — and the model is never asked", async () => {
    setEmbeddingModel({
      key: "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT",
      acceptsImages: true,
    });
    const { provider, asked } = fakeProvider();
    const { budget } = fakeBudget(false);
    const embed = providerImageEmbedder(
      meteredProviderFor(provider, "image_search", MODELS, { budget }),
      loader(TINY),
    );
    await expect(embed(ctx, { fileId: "f-1" })).rejects.toThrow(
      BudgetExceededError,
    );
    expect(asked).toEqual([]);
  });

  it("holds a person to a per-user cap on search photos", () => {
    expect(USER_CAPS["ai_model/image_search"]).toEqual({
      hourly: 30,
      daily: 150,
    });
  });
});

describe("gemini image-only embedding parts", () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

  it("is the image as the only part — no text, so no task instruction", () => {
    const parts = geminiEmbeddingParts(
      { content: "", type: "image", images: [image] },
      "gemini-embedding-2",
      "vertex-ai",
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveProperty("inline_data");
  });

  it("refuses an image-only embedding on any other model, or with other than one image", () => {
    expect(() =>
      geminiEmbeddingParts(
        { content: "", type: "image", images: [image] },
        "text-embedding-005",
        "vertex-ai",
      ),
    ).toThrow(/cannot embed an image/);
    expect(() =>
      geminiEmbeddingParts(
        { content: "", type: "image", images: [image, image] },
        "gemini-embedding-2",
        "vertex-ai",
      ),
    ).toThrow(/exactly one image/);
  });
});

describe("downscaleForEmbedding", () => {
  type Size = { width: number; height: number };
  /** A stand-in for `Bun.Image` that records what it was asked to do. */
  const fakeImage = (size: Size, calls: string[]) =>
    class {
      metadata = async () => size;
      resize(width: number, height: number, options: { fit: string }) {
        calls.push(`resize ${width}x${height} ${options.fit}`);
        return this;
      }
      jpeg(options: { quality: number }) {
        calls.push(`jpeg ${options.quality}`);
        return this;
      }
      bytes = async () => new Uint8Array([9]);
    };

  it("fits a large photo inside 768 px as a JPEG", async () => {
    const calls: string[] = [];
    const out = await downscaleForEmbedding(
      new Uint8Array([1, 2, 3]),
      fakeImage({ width: 4032, height: 3024 }, calls),
    );
    expect(out).toEqual(new Uint8Array([9]));
    expect(calls).toEqual(["resize 768x768 inside", "jpeg 85"]);
  });

  it("leaves a photo already that small alone", async () => {
    const calls: string[] = [];
    const bytes = new Uint8Array([1, 2, 3]);
    expect(
      await downscaleForEmbedding(
        bytes,
        fakeImage({ width: 640, height: 480 }, calls),
      ),
    ).toBe(bytes);
    expect(calls).toEqual([]);
  });

  it("sends the original when there is no Bun.Image (the Node rollback)", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await downscaleForEmbedding(bytes, null)).toBe(bytes);
  });
});
