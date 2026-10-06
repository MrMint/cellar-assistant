/**
 * The llama.cpp multimodal dialect against a **real** `llama-server` serving
 * Qwen3-VL-Embedding — opt-in, and skipped unless asked for:
 *
 *   LLAMACPP_EMBED_ENDPOINT=http://127.0.0.1:8091 \
 *     bun run --bun vitest run src/lib/ai/llamacpp-embeddings.live.test.ts
 *
 * (`OPENAI_COMPAT_API_KEY` is sent if set, for a server started with
 * `--api-key`.) Opt-in by variable rather than by probing a port, unlike
 * `ollama.live.test.ts`: a llama-server on a port is not evidence that it is
 * serving *this* model, and a wrong model would turn this into a confusing
 * ranking failure.
 *
 * What a fake cannot prove, and this does:
 *
 *  - the marker read from `/props`, the template and `multimodal_data` are
 *    accepted by an actual server, and every image is consumed (the provider's
 *    `usage.prompt_tokens` guard would throw otherwise);
 *  - **text → image**: a phrase finds the picture of its drink among six;
 *  - **image → image**: a mirrored, rotated, recoloured, shrunk copy of each
 *    picture still finds its original;
 *  - **image → document**: a photo finds the item vector made of its own text
 *    and picture, which is how image search meets `item_vectors`;
 *  - a document with an image is not the text-only vector, and the same input
 *    embeds to the same vector twice.
 *
 * The six pictures are the client's own category illustrations
 * (`services/client/src/images`), shrunk exactly as the seams shrink every
 * image (`downscaleForEmbedding`, 768 px). A directional check, like
 * `findings/vllm-provider.md` §4 — not a recall benchmark.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../embeddings.ts";
import { downscaleForEmbedding } from "../image-downscale.ts";
import { readAIProviderConfig } from "./config.ts";
import { providerFor } from "./factory.ts";

const ENDPOINT = process.env.LLAMACPP_EMBED_ENDPOINT ?? "";
const REPO = new URL("../../../../../", import.meta.url);

const DRINKS = [
  { name: "wine", query: "a bottle of red wine with a glass" },
  { name: "beer", query: "a frothy mug of lager beer" },
  { name: "spirit", query: "a liquor bottle next to a cocktail" },
  { name: "sake", query: "a Japanese sake flask with small cups" },
  { name: "coffee", query: "a bag of roasted coffee beans" },
  { name: "tea", query: "a teapot and a cup of tea" },
] as const;

const cosine = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / Math.sqrt(na * nb);
};

/** Index of the nearest of `corpus` to `query`. */
const nearest = (
  query: readonly number[],
  corpus: readonly (readonly number[])[],
): number => {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  corpus.forEach((candidate, index) => {
    const score = cosine(query, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
};

type BunImageChain = {
  flop(): BunImageChain;
  rotate(degrees: number): BunImageChain;
  modulate(options: { brightness: number; saturation: number }): BunImageChain;
  resize(w: number, h: number, options: { fit: "inside" }): BunImageChain;
  jpeg(options: { quality: number }): BunImageChain;
  bytes(): Promise<Uint8Array>;
};

/** A changed copy: mirrored, turned, darker, desaturated, smaller, lossy. */
const perturb = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const ctor = (
    globalThis as { Bun?: { Image?: new (b: Uint8Array) => BunImageChain } }
  ).Bun?.Image;
  if (ctor === undefined) throw new Error("run under bun: Bun.Image is needed");
  return await new ctor(bytes)
    .flop()
    .rotate(90)
    .modulate({ brightness: 0.8, saturation: 0.6 })
    .resize(400, 400, { fit: "inside" })
    .jpeg({ quality: 70 })
    .bytes();
};

describe.skipIf(ENDPOINT === "")(`llama-server, live at ${ENDPOINT}`, () => {
  const provider = providerFor(
    readAIProviderConfig({
      AI_PROVIDER: "openai-compatible",
      OPENAI_COMPAT_EMBEDDING_ENDPOINT: ENDPOINT,
      OPENAI_COMPAT_EMBEDDING_INPUT: "llamacpp-multimodal",
      OPENAI_COMPAT_API_KEY: process.env.OPENAI_COMPAT_API_KEY,
      AI_REQUEST_TIMEOUT_MS: "300000",
    }),
  );

  /** Lazy and memoised: a skipped describe still runs this body. */
  const once = <T>(make: () => Promise<T>): (() => Promise<T>) => {
    let made: Promise<T> | null = null;
    return () => {
      made ??= make();
      return made;
    };
  };

  const pictures = once(() =>
    Promise.all(
      DRINKS.map(async ({ name }) =>
        downscaleForEmbedding(
          new Uint8Array(
            readFileSync(
              new URL(`services/client/src/images/${name}1.png`, REPO),
            ),
          ),
        ),
      ),
    ),
  );

  const imageVector = async (bytes: Uint8Array): Promise<number[]> =>
    (
      await provider.generateEmbeddings({
        content: "",
        type: "image",
        images: [bytes],
      })
    ).embeddings;

  // Sequential, not Promise.all: the server runs one slot (`-np 1`), and the
  // work is GPU-bound, so concurrency only queues.
  const corpus = once(async () => {
    const out: number[][] = [];
    for (const bytes of await pictures()) out.push(await imageVector(bytes));
    return out;
  });

  it("embeds an image to exactly the width every halfvec column is, unit length", async () => {
    const [first] = await corpus();
    expect(first).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt((first ?? []).reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  }, 120_000);

  it("text → image: each phrase finds its own drink among six", async () => {
    const images = await corpus();
    const ranked: string[] = [];
    for (const { name, query } of DRINKS) {
      const { embeddings } = await provider.generateEmbeddings({
        content: query,
        type: "text",
        taskType: "RETRIEVAL_QUERY",
      });
      ranked.push(DRINKS[nearest(embeddings, images)]?.name ?? "none");
      expect(ranked.at(-1), `"${query}"`).toBe(name);
    }
  }, 120_000);

  it("image → image: a changed copy of each picture finds its original", async () => {
    const images = await corpus();
    const originals = await pictures();
    for (const [index, { name }] of DRINKS.entries()) {
      const original = originals[index];
      if (original === undefined) throw new Error(`no picture for ${name}`);
      const query = await imageVector(await perturb(original));
      expect(DRINKS[nearest(query, images)]?.name, name).toBe(name);
    }
  }, 120_000);

  it("image → document: a photo finds the item vector fused from its own text and picture", async () => {
    const originals = await pictures();
    const documents: number[][] = [];
    for (const [index, { name }] of DRINKS.entries()) {
      const picture = originals[index];
      if (picture === undefined) throw new Error(`no picture for ${name}`);
      documents.push(
        (
          await provider.generateEmbeddings({
            content: `House ${name}. ${name}.`,
            type: "text",
            taskType: "RETRIEVAL_DOCUMENT",
            images: [picture],
          })
        ).embeddings,
      );
    }
    for (const [index, { name }] of DRINKS.entries()) {
      const original = originals[index];
      if (original === undefined) throw new Error(`no picture for ${name}`);
      const query = await imageVector(await perturb(original));
      expect(DRINKS[nearest(query, documents)]?.name, name).toBe(name);
    }
  }, 180_000);

  it("a document with its picture is not the text-only vector, and repeats exactly", async () => {
    const [wine] = await pictures();
    if (wine === undefined) throw new Error("no wine picture");
    const doc = (images: Uint8Array[]) =>
      provider.generateEmbeddings({
        content: "House red. wine.",
        type: "text",
        taskType: "RETRIEVAL_DOCUMENT",
        images,
      });
    const [fused, again, textOnly] = [
      (await doc([wine])).embeddings,
      (await doc([wine])).embeddings,
      (await doc([])).embeddings,
    ];
    expect(again).toEqual(fused);
    expect(cosine(fused, textOnly)).toBeLessThan(0.99);
  }, 120_000);
});
