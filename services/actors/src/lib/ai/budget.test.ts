/**
 * The metered provider — X1c's half of model-spend accounting that runs inside
 * the actor host.
 *
 * `install.test.ts` holds the property that every seam is metered.
 * `budget-actor.test.ts` holds what the singleton does with a reservation.
 * This is the piece in between: what gets declared, when, and what happens to
 * the call when the answer is no.
 *
 *   bun run --filter @cellar-assistant/actors test lib/ai/budget
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { BudgetExceededError } from "@cellar-assistant/contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  ModelReserveInput,
  ModelSettleInput,
} from "../../actors/budget-actor.ts";
import type { ModelBudget, SeamModels } from "./budget.ts";
import {
  EMBEDDING_IMAGE_TEXT_TOKENS,
  estimateImageTokens,
  estimateTextTokens,
  measuredTokens,
  meteredProviderFor,
  OUTPUT_TOKEN_ESTIMATES,
} from "./budget.ts";
import type { AIProvider, GenerateContentResponse } from "./types.ts";

const ctx: Ctx = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  kind: "user",
  requestId: "r-1",
};

const MODELS: SeamModels = {
  low: "gemini-3.1-flash-lite",
  medium: "gemini-3.5-flash-lite",
  high: "gemini-3.5-flash",
  embedding: "text-embedding-004",
};

type Recorder = {
  readonly budget: ModelBudget;
  readonly reserved: ModelReserveInput[];
  readonly settled: ModelSettleInput[];
  /** Every ctx either hop was called with, in call order. */
  readonly ctxs: Ctx[];
};

const recorder = (
  options: {
    allowed?: boolean;
    settleThrows?: boolean;
    usageId?: string | null;
  } = {},
): Recorder => {
  const reserved: ModelReserveInput[] = [];
  const settled: ModelSettleInput[] = [];
  const ctxs: Ctx[] = [];
  return {
    reserved,
    settled,
    ctxs,
    budget: {
      reserve: async (c, input) => {
        ctxs.push(c);
        reserved.push(input);
        return {
          allowed: options.allowed ?? true,
          effectiveCostCents: 0,
          currentSpendCents: 3,
          limitCents: 500,
          requestCount: 12,
          freeTierLimit: 0,
          isEnabled: true,
          reason: (options.allowed ?? true) ? "charged" : "budget exhausted",
          usageId: options.usageId === undefined ? "u-1" : options.usageId,
        };
      },
      settle: async (c, input) => {
        ctxs.push(c);
        settled.push(input);
        if (options.settleThrows === true) throw new Error("sidecar down");
      },
    },
  };
};

const provider = (
  metadata: Partial<GenerateContentResponse["metadata"]> = {},
): { provider: AIProvider; calls: number } => {
  const state = { calls: 0 };
  const impl: AIProvider = {
    name: "vertex-ai",
    getAvailableQualities: () => ["low", "medium", "high"],
    async generateContent() {
      state.calls += 1;
      return {
        content: "{}",
        metadata: {
          model: "gemini-3.5-flash-lite",
          provider: "vertex-ai",
          processingTime: 1,
          ...metadata,
        },
      };
    },
    async generateEmbeddings() {
      state.calls += 1;
      return {
        embeddings: [1, 2, 3],
        metadata: {
          model: "text-embedding-004",
          dimensions: 3,
          provider: "vertex-ai",
        },
      };
    },
  };
  return {
    provider: impl,
    get calls() {
      return state.calls;
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Estimation                                                                  */
/* -------------------------------------------------------------------------- */

describe("the pre-call estimate", () => {
  it("rounds text up rather than down", () => {
    // Three characters per token, and a partial token is a token: an estimate
    // that has to refuse should never come in under the real cost.
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("abcd")).toBe(2);
    expect(estimateTextTokens("a".repeat(3000))).toBe(1000);
  });

  it("charges each image a flat tile allowance", () => {
    expect(estimateImageTokens(0)).toBe(0);
    expect(estimateImageTokens(2)).toBe(estimateImageTokens(1) * 2);
    // Above Gemini's 16-tile ceiling for a resized photograph (4128), so the
    // estimate covers the worst case rather than a typical one.
    expect(estimateImageTokens(1)).toBeGreaterThanOrEqual(4128);
  });

  it("declares the images and the prompt, before the model is called", async () => {
    const { budget, reserved } = recorder();
    const p = provider();
    const metered = meteredProviderFor(p.provider, "menu_extraction", MODELS, {
      budget,
    });

    await metered(ctx).generateContent(
      { prompt: "a".repeat(300), images: [new Uint8Array([1])] },
      "high",
    );

    const [first] = reserved;
    expect(first?.seam).toBe("menu_extraction");
    expect(first?.model).toBe(MODELS.high);
    expect(first?.provider).toBe("vertex-ai");
    expect(first?.inputTokens).toBe(100 + estimateImageTokens(1));
    expect(first?.outputTokens).toBe(OUTPUT_TOKEN_ESTIMATES.menu_extraction);
  });

  it("quotes the model an omitted quality would actually use", async () => {
    const { budget, reserved } = recorder();
    const p = provider();
    await meteredProviderFor(p.provider, "menu_match", MODELS, { budget })(
      ctx,
    ).generateContent({ prompt: "hello" });
    expect(reserved[0]?.model).toBe(MODELS.medium);
  });
});

/* -------------------------------------------------------------------------- */
/* Settlement                                                                  */
/* -------------------------------------------------------------------------- */

describe("settlement writes the measurement over the estimate", () => {
  it("uses the provider's own split when it reports one", async () => {
    const { budget, settled } = recorder();
    const p = provider({ inputTokens: 1234, outputTokens: 56 });
    await meteredProviderFor(p.provider, "recipe_photo", MODELS, { budget })(
      ctx,
    ).generateContent({ prompt: "x" });

    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      usageId: "u-1",
      seam: "recipe_photo",
      inputTokens: 1234,
      outputTokens: 56,
      // The model the call actually ran on, not the one quoted beforehand —
      // a provider may route a tier elsewhere, and the invoice follows the
      // model that ran.
      model: "gemini-3.5-flash-lite",
    });
  });

  it("splits a total against the input estimate when that is all there is", () => {
    const response = {
      content: "{}",
      metadata: {
        model: "m",
        provider: "openai-compatible" as const,
        processingTime: 1,
        tokensUsed: 900,
      },
    };
    // The input side is the half we can estimate well — it is a string we
    // built — so the residual is the output.
    expect(measuredTokens(response, 800)).toEqual({
      inputTokens: 800,
      outputTokens: 100,
    });
    // A total below the estimate means the estimate was high, not that the
    // model generated negative tokens.
    expect(measuredTokens(response, 1000)).toEqual({
      inputTokens: 900,
      outputTokens: 0,
    });
  });

  it("does not settle when the provider reports nothing", async () => {
    const { budget, settled } = recorder();
    const p = provider();
    await meteredProviderFor(p.provider, "place_review", MODELS, { budget })(
      ctx,
    ).generateContent({ prompt: "x" });
    expect(settled).toEqual([]);
  });

  it("does not settle an embedding — the estimate was already exact", async () => {
    const { budget, reserved, settled } = recorder();
    const p = provider();
    await meteredProviderFor(p.provider, "embedding", MODELS, { budget })(
      ctx,
    ).generateEmbeddings({ content: "pinot noir", type: "text" });

    expect(reserved[0]?.outputTokens).toBe(0);
    expect(reserved[0]?.model).toBe(MODELS.embedding);
    expect(settled).toEqual([]);
  });

  it("reserves an embedding's images at their per-image price, not as free text", async () => {
    const { budget, reserved } = recorder();
    const p = provider();
    const content = "Clos de Vougeot";
    await meteredProviderFor(p.provider, "embedding", MODELS, { budget })(
      ctx,
    ).generateEmbeddings({
      content,
      type: "text",
      images: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    });
    // $0.00012 an image at $0.20 per million text tokens.
    expect(EMBEDDING_IMAGE_TEXT_TOKENS).toBe(600);
    expect(reserved[0]?.inputTokens).toBe(
      estimateTextTokens(content) + 3 * 600,
    );
    expect(reserved[0]?.metadata).toMatchObject({ images: 3 });
  });

  it("a failed settlement does not fail the call it was settling", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { budget } = recorder({ settleThrows: true });
      const p = provider({ inputTokens: 10, outputTokens: 2 });
      // The model already ran and the money is already spent; throwing here
      // would discard paid-for work and, through the outbox, pay again.
      await expect(
        meteredProviderFor(p.provider, "item_defaults", MODELS, { budget })(
          ctx,
        ).generateContent({ prompt: "x" }),
      ).resolves.toMatchObject({ content: "{}" });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("skips settlement when the reservation wrote no row", async () => {
    const { budget, settled } = recorder({ usageId: null });
    const p = provider({ inputTokens: 10, outputTokens: 2 });
    await meteredProviderFor(p.provider, "menu_match", MODELS, { budget })(
      ctx,
    ).generateContent({ prompt: "x" });
    expect(settled).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Refusal                                                                     */
/* -------------------------------------------------------------------------- */

describe("a denial is a throw, never a manufactured answer", () => {
  it("throws BudgetExceededError and never reaches the provider", async () => {
    const { budget } = recorder({ allowed: false });
    const p = provider();
    const metered = meteredProviderFor(p.provider, "menu_extraction", MODELS, {
      budget,
    });

    await expect(metered(ctx).generateContent({ prompt: "x" })).rejects.toThrow(
      BudgetExceededError,
    );
    expect(p.calls).toBe(0);
  });

  it("refuses an embedding rather than returning a zero vector", async () => {
    const { budget } = recorder({ allowed: false });
    const p = provider();
    /*
     * `unconfiguredEmbedder` throws for exactly this reason and says so: a
     * zero vector is cosine distance 1.0 from everything, so search would
     * return an arbitrary ordering and look like it worked. A budget refusal
     * that returned one would be the same failure, arriving from the
     * accounting layer instead of the configuration.
     */
    await expect(
      meteredProviderFor(p.provider, "embedding", MODELS, { budget })(
        ctx,
      ).generateEmbeddings({ content: "pinot noir", type: "text" }),
    ).rejects.toThrow(BudgetExceededError);
    expect(p.calls).toBe(0);
  });

  it("says which seam and why, and that it is a refusal", async () => {
    const { budget } = recorder({ allowed: false });
    const p = provider();
    await expect(
      meteredProviderFor(p.provider, "tier_list_insights", MODELS, { budget })(
        ctx,
      ).generateContent({ prompt: "x" }),
    ).rejects.toThrow(
      /ai_model\/tier_list_insights refused: budget exhausted.*refusal, not an answer/s,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Reservation ids                                                             */
/* -------------------------------------------------------------------------- */

describe("reservation ids", () => {
  it("are distinct per call even within one ctx", async () => {
    const { budget, reserved } = recorder();
    const p = provider();
    const metered = meteredProviderFor(p.provider, "menu_match", MODELS, {
      budget,
    });
    for (let i = 0; i < 4; i += 1) {
      await metered(ctx).generateContent({ prompt: "x" });
    }
    expect(new Set(reserved.map((r) => r.reservationId)).size).toBe(4);
  });

  /**
   * The request id is the client's `x-request-id`, or an outbox row id that
   * every redelivery repeats, so it may not be part of a reservation's
   * identity. It still travels with the row, for tracing.
   */
  it("name the seam, are not derived from the request, and carry it for tracing", async () => {
    const { budget, reserved } = recorder();
    const p = provider();
    const metered = meteredProviderFor(p.provider, "recipe_photo", MODELS, {
      budget,
    });
    await metered(ctx).generateContent({ prompt: "x" });
    await metered(ctx).generateEmbeddings({ content: "x", type: "text" });
    for (const reservation of reserved) {
      expect(reservation.reservationId).toMatch(
        /^ai_model:recipe_photo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(reservation.reservationId).not.toContain(ctx.requestId);
      expect(reservation.metadata?.requestId).toBe(ctx.requestId);
    }
  });

  /**
   * The defect, reproduced: a fresh module instance is what a restarted (or a
   * second) actor host is, and the old id was `requestId` plus a module
   * counter that started again at 1 — so the same delivery, redelivered after
   * a restart, minted the same ids and `BudgetActor` answered them from the
   * previous attempt's rows.
   */
  it("differ across a restart for the same request", async () => {
    const firstIdAfterBoot = async (): Promise<string | undefined> => {
      vi.resetModules();
      const fresh = await import("./budget.ts");
      const { budget, reserved } = recorder();
      await fresh
        .meteredProviderFor(provider().provider, "menu_match", MODELS, {
          budget,
        })(ctx)
        .generateContent({ prompt: "x" });
      return reserved[0]?.reservationId;
    };
    const before = await firstIdAfterBoot();
    const after = await firstIdAfterBoot();
    expect(before).toBeDefined();
    expect(after).not.toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* Whose call it is                                                            */
/* -------------------------------------------------------------------------- */

describe("the caller's ctx", () => {
  /**
   * `BudgetActor` attributes a charge to `ctx.viewerId` and refuses an
   * anonymous user ctx outright, so both hops have to carry the ctx the seam
   * was called with. Nothing asserted it: reserving under a system ctx left
   * every test here green (mutation audit, 2026-09-27).
   */
  it("reaches both hops unchanged, for content and for embeddings", async () => {
    const { budget, ctxs } = recorder();
    const p = provider({ inputTokens: 10, outputTokens: 2 });
    const metered = meteredProviderFor(p.provider, "menu_match", MODELS, {
      budget,
    });

    await metered(ctx).generateContent({ prompt: "x" });
    await metered(ctx).generateEmbeddings({ content: "x", type: "text" });

    // reserve + settle for the content call, reserve for the embedding.
    expect(ctxs).toEqual([ctx, ctx, ctx]);
  });
});
