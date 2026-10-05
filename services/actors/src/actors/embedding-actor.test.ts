/**
 * `EmbeddingActor` — C1 (§2.3).
 *
 * The acceptance criterion this file exists for: **`EmbeddingActor`'s key
 * matches what its callers address it by.** There used to be four copies of
 * that key — `embeddingActorId` in contracts, another in `cellar-actor.ts`,
 * and inline hashes in `item-actor.ts` and `recipe-actor.ts` — asserted equal
 * here, because a drift between them is invisible at runtime: it just means
 * two activations where there should be one, and a cache that never hits.
 * There is one now. Every caller defaults to `daprEmbedQuery`
 * (`lib/embedding-client.ts`), which addresses the actor by contracts'
 * `embeddingActorId` — the same function the actor checks its own id against.
 *
 * No database is touched: an embedding is a pure function of the text (§1.3 has
 * nothing to say about it), so this suite runs without a transformed database.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import {
  documentEmbeddingActorId,
  embeddingActorId,
  ForbiddenError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import { describe, expect, it, vi } from "vitest";
import { daprEmbedDocument, daprEmbedQuery } from "../lib/embedding-client.ts";
import type { Embedder } from "../lib/embeddings.ts";
import {
  EMBEDDING_DIMENSIONS,
  unconfiguredEmbedder,
} from "../lib/embeddings.ts";
import { invokeActorMethod } from "../lib/sidecar.ts";
import { setEmbeddingModel } from "../lib/vectors.ts";
import { EmbeddingActor } from "./embedding-actor.ts";

vi.mock("../lib/sidecar.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sidecar.ts")>()),
  invokeActorMethod: vi.fn(async () => ({
    vector: [0.1],
    dimensions: 1,
    computed: false,
  })),
}));

const VIEWER = "11111111-1111-4111-8111-111111111111";
const ctx = (): Ctx => ({ viewerId: VIEWER, kind: "user", requestId: "r-1" });

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const vectorOf = (seed: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (seed + i) / 1000);

/** A counting stub — most of these tests are about *how often* it runs. */
const countingEmbedder = (): { embed: Embedder; calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    embed: async ({ text }) => {
      calls.push(text);
      return vectorOf(text.length);
    },
  };
};

/** The database handle is never used; `null as never` proves that. */
const actorFor = (text: string, embed: Embedder): EmbeddingActor =>
  new EmbeddingActor(
    daprClient(),
    new ActorId(embeddingActorId(text)),
    null as never,
    embed,
  );

describe("EmbeddingActor (§2.3)", () => {
  describe("the key — C1's acceptance criterion", () => {
    it("is addressed by the shared adapter at contracts' embeddingActorId", async () => {
      // The one adapter every caller defaults to — `CellarActor`, `ItemActor`,
      // `RecipeActor` and the three search actors. What it sends is what
      // matters: the actor type, the key, and the 30s the descriptor gives
      // `embed`.
      for (const text of ["pinot noir", "  Pinot Noir  ", "café au lait"]) {
        vi.mocked(invokeActorMethod).mockClear();
        await expect(daprEmbedQuery(ctx(), text)).resolves.toEqual([0.1]);
        expect(vi.mocked(invokeActorMethod).mock.calls).toEqual([
          [
            "EmbeddingActor",
            embeddingActorId(text),
            "embed",
            [ctx(), text],
            30_000,
          ],
        ]);
      }
      // …and the key folds case and surrounding space, so one phrase is one
      // activation however it was typed.
      expect(embeddingActorId("  Pinot Noir  ")).toBe(
        embeddingActorId("pinot noir"),
      );
    });

    it("refuses text that does not hash to its own id", async () => {
      const { embed, calls } = countingEmbedder();
      const actor = new EmbeddingActor(
        daprClient(),
        new ActorId(embeddingActorId("pinot noir")),
        null as never,
        embed,
      );
      await expect(actor.embed(ctx(), "chardonnay")).rejects.toThrow(
        ValidationError,
      );
      // …and it never reached the model, so nothing was cached under the
      // wrong phrase.
      expect(calls).toEqual([]);
    });
  });

  describe("the activation is the cache", () => {
    it("computes once and reports `computed: false` on every later turn", async () => {
      const { embed, calls } = countingEmbedder();
      const actor = actorFor("pinot noir", embed);

      const first = await actor.embed(ctx(), "pinot noir");
      const second = await actor.embed(ctx(), "  Pinot Noir  ");

      expect(first.computed).toBe(true);
      expect(second.computed).toBe(false);
      expect(second.vector).toEqual(first.vector);
      expect(calls).toEqual(["pinot noir"]);
    });

    it("is shared across viewers — the viewer is not in the key", async () => {
      const { embed, calls } = countingEmbedder();
      const actor = actorFor("pinot noir", embed);
      await actor.embed(
        { viewerId: VIEWER, kind: "user", requestId: "r-1" },
        "pinot noir",
      );
      await actor.embed(
        {
          viewerId: "22222222-2222-4222-8222-222222222222",
          kind: "user",
          requestId: "r-2",
        },
        "pinot noir",
      );
      expect(calls).toHaveLength(1);
    });

    /**
     * The embedder is where the model call is metered (X1c), and the meter
     * attributes the spend to whichever ctx it is handed. So the ctx that
     * reaches it has to be the caller's: passing one of the actor's own
     * making left this file green (mutation audit, 2026-09-27) while booking
     * every embedding to nobody.
     */
    it("hands the model the caller's ctx, so the spend is metered to them", async () => {
      const seen: Ctx[] = [];
      const actor = actorFor("pinot noir", async (_input, c) => {
        seen.push(c);
        return vectorOf(1);
      });
      await actor.embed(ctx(), "pinot noir");
      expect(seen).toEqual([ctx()]);
    });

    it("serves the system ctx too — `regenerateVector` arrives that way", async () => {
      const { embed } = countingEmbedder();
      const actor = actorFor("pinot noir", embed);
      const result = await actor.embed(
        { viewerId: null, kind: "system", requestId: "outbox-1" },
        "pinot noir",
      );
      expect(result.dimensions).toBe(EMBEDDING_DIMENSIONS);
    });
  });

  describe("guards", () => {
    it("refuses an anonymous user ctx", async () => {
      const { embed } = countingEmbedder();
      const actor = actorFor("pinot noir", embed);
      await expect(
        actor.embed(
          { viewerId: null, kind: "user", requestId: "r" },
          "pinot noir",
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("refuses an empty phrase", async () => {
      const { embed } = countingEmbedder();
      const actor = actorFor("   ", embed);
      await expect(actor.embed(ctx(), "   ")).rejects.toThrow(ValidationError);
    });

    it("refuses a provider whose vector is the wrong width", async () => {
      const actor = actorFor("pinot noir", async () => [1, 2, 3]);
      await expect(actor.embed(ctx(), "pinot noir")).rejects.toThrow(/768/);
    });

    it("throws loudly when no provider is wired, rather than faking success", async () => {
      const actor = actorFor("pinot noir", unconfiguredEmbedder);
      await expect(actor.embed(ctx(), "pinot noir")).rejects.toThrow(
        /no embedding provider wired/,
      );
    });
  });

  describe("embedDocument — the stored-row side", () => {
    const input = {
      text: "Clos de Vougeot",
      imageFileIds: ["front", "back", "display"],
    };
    const system = (): Ctx => ({
      viewerId: null,
      kind: "system",
      requestId: "outbox:1",
    });
    const documentActor = (embed: Embedder): EmbeddingActor =>
      new EmbeddingActor(
        daprClient(),
        new ActorId(documentEmbeddingActorId(input)),
        null as never,
        embed,
      );

    it("is addressed by daprEmbedDocument at documentEmbeddingActorId, as an internal method", async () => {
      vi.mocked(invokeActorMethod).mockClear();
      vi.mocked(invokeActorMethod).mockResolvedValueOnce({
        vector: [0.2],
        dimensions: 1,
        computed: true,
        model: "m",
      });
      await expect(daprEmbedDocument(system(), input)).resolves.toEqual({
        vector: [0.2],
        model: "m",
      });
      expect(vi.mocked(invokeActorMethod).mock.calls).toEqual([
        [
          "EmbeddingActor",
          documentEmbeddingActorId(input),
          "embedDocument",
          [system(), input],
          90_000,
        ],
      ]);
      // A document never shares an activation with the phrase it contains.
      expect(
        documentEmbeddingActorId({ text: "pinot noir", imageFileIds: [] }),
      ).not.toBe(embeddingActorId("pinot noir"));
    });

    it("embeds as a document, with the images named, and says which model made it", async () => {
      const seen: unknown[] = [];
      const actor = documentActor(async (request) => {
        seen.push(request);
        return vectorOf(1);
      });
      setEmbeddingModel({
        key: "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT",
        acceptsImages: true,
      });
      try {
        const first = await actor.embedDocument(system(), input);
        expect(first).toMatchObject({
          computed: true,
          model: "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT",
        });
        expect(seen).toEqual([
          {
            text: "Clos de Vougeot",
            purpose: "document",
            imageFileIds: ["front", "back", "display"],
          },
        ]);
        // The activation is the cache here too.
        await expect(
          actor.embedDocument(system(), input),
        ).resolves.toMatchObject({ computed: false });
        expect(seen).toHaveLength(1);
      } finally {
        setEmbeddingModel(null);
      }
    });

    it("is system only — it reads the files it is named", async () => {
      const actor = documentActor(async () => vectorOf(1));
      await expect(actor.embedDocument(ctx(), input)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("refuses a document that does not hash to its own id", async () => {
      const actor = documentActor(async () => vectorOf(1));
      await expect(
        actor.embedDocument(system(), { ...input, imageFileIds: ["front"] }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
