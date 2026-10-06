/**
 * `OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal` against a fake
 * `llama-server` — the local lane's text-and-image embeddings.
 *
 * The fake behaves the way llama.cpp b11433 was measured to (2026-10-05):
 *
 *  - `GET /props` publishes a `media_marker` that is **random per start**;
 *  - a prompt whose markers do not match `multimodal_data` is a 500 reading
 *    `Failed to tokenize prompt`;
 *  - `usage.prompt_tokens` counts each consumed image (576 at the image cap);
 *  - `dimensions` is ignored and 2048 always comes back.
 *
 * A `drop` switch reproduces the failure that matters most: a server that
 * embeds the prompt as text and silently ignores the images, answering with a
 * plausible vector. `image_data` on this route did exactly that.
 *
 * `llamacpp-embeddings.live.test.ts` is the same contract against a real
 * server; these are the cases a real server cannot be made to produce on
 * demand (a restart between two calls, a dropped image).
 */
import { ConflictError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { embeddingModelKey, imageEmbeddingKey } from "../vectors.ts";
import { readAIProviderConfig } from "./config.ts";
import { providerFor } from "./factory.ts";
import { embeddingModelIdentity } from "./install.ts";
import {
  LLAMACPP_EMBEDDING_VARIANT,
  LLAMACPP_IMAGE_MAX_TOKENS,
  LLAMACPP_MAX_IMAGES,
  LLAMACPP_TEMPLATE_VERSION,
  qwen3VLEmbeddingPrompt,
  serverRoot,
} from "./openai-compatible.ts";
import type { FetchLike } from "./types.ts";

const ENV = {
  AI_PROVIDER: "openai-compatible",
  OPENAI_COMPAT_ENDPOINT: "http://localhost:11434",
  OPENAI_COMPAT_EMBEDDING_ENDPOINT: "http://localhost:8091",
  OPENAI_COMPAT_EMBEDDING_INPUT: "llamacpp-multimodal",
} as const;

const config = readAIProviderConfig(ENV);

/** Enough of a JPEG for `requireImageMime`; the fake never decodes it. */
const jpeg = (tag: number): Uint8Array =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, tag]);

const b64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

type EmbedBody = {
  model?: string;
  input: { prompt_string: string; multimodal_data: string[] };
  encoding_format?: string;
  image_data?: unknown;
  dimensions?: unknown;
};

type FakeOptions = {
  /** Ignore every image and count only the text, as `image_data` did. */
  drop?: boolean;
  /** Leave `usage` out of the answer. */
  noUsage?: boolean;
  /** `/props` overrides. */
  props?: Record<string, unknown>;
  propsStatus?: number;
  apiKey?: string;
};

const fakeLlamaServer = (options: FakeOptions = {}) => {
  let starts = 0;
  let marker = "";
  const restart = () => {
    starts += 1;
    marker = `<__media_${starts}_${Math.random().toString(36).slice(2)}__>`;
  };
  restart();

  const props: string[] = [];
  const embeds: { headers: Record<string, string>; body: EmbedBody }[] = [];
  const propsHeaders: Record<string, string>[] = [];

  const vector = (seed: number): number[] =>
    Array.from({ length: 2048 }, (_, i) => Math.sin(seed + i));

  const fetchImpl: FetchLike = async (url, init) => {
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    });
    if ((init?.method ?? "GET") === "GET") {
      props.push(url);
      propsHeaders.push(init?.headers ?? {});
      if (!url.endsWith("/props")) return reply(404, "not found");
      return reply(options.propsStatus ?? 200, {
        media_marker: marker,
        modalities: { vision: true, video: true, audio: false },
        build_info: "b11433-fake",
        ...options.props,
      });
    }
    const body = JSON.parse(init?.body ?? "{}") as EmbedBody;
    embeds.push({ headers: init?.headers ?? {}, body });
    const prompt = body.input.prompt_string;
    const images = body.input.multimodal_data ?? [];
    const markers = prompt.split(marker).length - 1;
    if (!options.drop && markers !== images.length) {
      return reply(500, {
        error: { code: 500, message: "Failed to tokenize prompt" },
      });
    }
    // About a token per four characters of text, plus the image budget.
    const textTokens = Math.ceil(prompt.length / 4);
    const tokens = options.drop
      ? textTokens
      : textTokens + images.length * LLAMACPP_IMAGE_MAX_TOKENS;
    return reply(200, {
      object: "list",
      data: [
        { object: "embedding", index: 0, embedding: vector(prompt.length) },
      ],
      ...(options.noUsage
        ? {}
        : { usage: { prompt_tokens: tokens, total_tokens: tokens } }),
    });
  };

  return {
    fetchImpl,
    props,
    propsHeaders,
    embeds,
    restart,
    marker: () => marker,
    lastEmbed: (): EmbedBody => {
      const last = embeds.at(-1);
      if (last === undefined) throw new Error("no embedding was requested");
      return last.body;
    },
  };
};

const norm = (v: readonly number[]): number =>
  Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

/* -------------------------------------------------------------------------- */

describe("configuration", () => {
  it("defaults to OpenAI's text-only shape, which is today's behaviour", () => {
    const resolved = readAIProviderConfig({ AI_PROVIDER: "openai-compatible" });
    if (resolved.provider !== "openai-compatible") throw new Error("provider");
    expect(resolved.embeddingInput).toBe("openai");
    expect(resolved.truncateEmbeddings).toBe(false);
  });

  it("reads llamacpp-multimodal, and defaults truncation on under it", () => {
    if (config.provider !== "openai-compatible") throw new Error("provider");
    expect(config.embeddingInput).toBe("llamacpp-multimodal");
    // llama-server ignores `dimensions` and answers 2048; the model is
    // Matryoshka, so the dialect implies the truncation.
    expect(config.truncateEmbeddings).toBe(true);
  });

  it("still honours an explicit truncate=false (and then refuses 2048)", async () => {
    const strict = readAIProviderConfig({
      ...ENV,
      OPENAI_COMPAT_EMBEDDING_TRUNCATE: "false",
    });
    const server = fakeLlamaServer();
    await expect(
      providerFor(strict, server.fetchImpl).generateEmbeddings({
        content: "x",
        type: "text",
      }),
    ).rejects.toThrowError(/2048-dimension/);
  });

  it("throws on a typo rather than silently embedding text only", () => {
    expect(() =>
      readAIProviderConfig({
        ...ENV,
        OPENAI_COMPAT_EMBEDDING_INPUT: "llamacpp",
      }),
    ).toThrowError(/must be one of openai, llamacpp-multimodal/);
  });

  it("refuses the dialect under a model whose template it is not", () => {
    // The template and the Matryoshka truncation are both Qwen3-VL-Embedding's.
    expect(() =>
      readAIProviderConfig({
        ...ENV,
        OPENAI_COMPAT_EMBEDDING_MODEL: "nomic-embed-text",
      }),
    ).toThrowError(/Qwen3-VL-Embedding's prompt template/);
    expect(() =>
      readAIProviderConfig({
        ...ENV,
        OPENAI_COMPAT_EMBEDDING_MODEL: "Qwen/Qwen3-VL-Embedding-8B",
      }),
    ).not.toThrow();
  });

  it("finds /props at the server root whether or not the base carries /v1", () => {
    expect(serverRoot("http://localhost:8091/v1")).toBe(
      "http://localhost:8091",
    );
    expect(serverRoot("http://host.docker.internal:8091")).toBe(
      "http://host.docker.internal:8091",
    );
  });
});

describe("the prompt", () => {
  it("is Qwen3-VL-Embedding's template: instruction, images, then text", () => {
    expect(
      qwen3VLEmbeddingPrompt({
        instruction: "Represent this item for retrieval.",
        content: "Tusker Lager",
        marker: "<M>",
        images: 2,
      }),
    ).toBe(
      "<|im_start|>system\nRepresent this item for retrieval.<|im_end|>\n" +
        "<|im_start|>user\n<M><M>Tusker Lager<|im_end|>\n" +
        "<|im_start|>assistant\n",
    );
  });

  it("templates text too, with the task's instruction, and fetches no marker", async () => {
    const server = fakeLlamaServer();
    await providerFor(config, server.fetchImpl).generateEmbeddings({
      content: "a cold lager",
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });
    expect(server.props).toEqual([]);
    const body = server.lastEmbed();
    expect(body.input).toEqual({
      prompt_string:
        "<|im_start|>system\nRepresent this search query for retrieving " +
        "relevant items.<|im_end|>\n<|im_start|>user\na cold lager<|im_end|>\n" +
        "<|im_start|>assistant\n",
      multimodal_data: [],
    });
    expect(body.encoding_format).toBe("float");
    expect(body).not.toHaveProperty("image_data");
  });

  it("puts a bare marker per image before the text, in order", async () => {
    const server = fakeLlamaServer();
    const front = jpeg(1);
    const back = jpeg(2);
    await providerFor(config, server.fetchImpl).generateEmbeddings({
      content: "Black & White. spirit.",
      type: "text",
      taskType: "RETRIEVAL_DOCUMENT",
      images: [front, back],
    });
    const body = server.lastEmbed();
    const m = server.marker();
    expect(body.input.prompt_string).toContain(
      `<|im_start|>user\n${m}${m}Black & White. spirit.<|im_end|>`,
    );
    // mtmd adds <|vision_start|>…<|vision_end|> itself; doubling it measured
    // 0.974 against the reference instead of 0.998.
    expect(body.input.prompt_string).not.toContain("<|vision_start|>");
    expect(body.input.multimodal_data).toEqual([b64(front), b64(back)]);
  });

  it("embeds an image alone with Qwen's default instruction and no text", async () => {
    const server = fakeLlamaServer();
    const photo = jpeg(3);
    await providerFor(config, server.fetchImpl).generateEmbeddings({
      // Content on an image-only request would make it a document vector.
      content: "ignored",
      type: "image",
      images: [photo],
    });
    expect(server.lastEmbed().input).toEqual({
      prompt_string:
        "<|im_start|>system\nRepresent the user's input.<|im_end|>\n" +
        `<|im_start|>user\n${server.marker()}<|im_end|>\n` +
        "<|im_start|>assistant\n",
      multimodal_data: [b64(photo)],
    });
  });
});

describe("the media marker", () => {
  it("is read from GET /props at the server root, once, and cached", async () => {
    const server = fakeLlamaServer();
    const provider = providerFor(config, server.fetchImpl);
    for (const tag of [1, 2, 3]) {
      await provider.generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(tag)],
      });
    }
    expect(server.props).toEqual(["http://localhost:8091/props"]);
    expect(server.embeds).toHaveLength(3);
  });

  it("is read again after a restart, and the call is retried once", async () => {
    const server = fakeLlamaServer();
    const provider = providerFor(config, server.fetchImpl);
    await provider.generateEmbeddings({
      content: "",
      type: "image",
      images: [jpeg(1)],
    });
    server.restart();
    const result = await provider.generateEmbeddings({
      content: "",
      type: "image",
      images: [jpeg(2)],
    });
    expect(result.embeddings).toHaveLength(768);
    expect(server.props).toHaveLength(2);
    // first call, the stale attempt, the retry
    expect(server.embeds).toHaveLength(3);
    expect(server.lastEmbed().input.prompt_string).toContain(server.marker());
  });

  it("does not loop when a fresh marker still mismatches", async () => {
    // A /props that keeps answering a marker the embed route does not use.
    const server = fakeLlamaServer({ props: { media_marker: "<__stale__>" } });
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(1)],
      }),
    ).rejects.toThrowError(/Failed to tokenize prompt/);
    expect(server.props).toHaveLength(2);
    expect(server.embeds).toHaveLength(1);
  });

  it("refuses a server with no vision tower loaded", async () => {
    const server = fakeLlamaServer({
      props: { modalities: { vision: false, audio: false } },
    });
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(1)],
      }),
    ).rejects.toThrowError(/no vision tower loaded.*--mmproj/s);
    expect(server.embeds).toHaveLength(0);
  });

  it("refuses a build that publishes no marker, naming the upgrade", async () => {
    const server = fakeLlamaServer({ props: { media_marker: undefined } });
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(1)],
      }),
    ).rejects.toThrowError(/reports no media_marker.*Upgrade llama\.cpp/s);
  });

  it("does not cache a failed read", async () => {
    const down = fakeLlamaServer({ propsStatus: 503 });
    const provider = providerFor(config, down.fetchImpl);
    const ask = () =>
      provider.generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(1)],
      });
    await expect(ask()).rejects.toThrowError(ConflictError);
    await expect(ask()).rejects.toThrowError(/props failed \(503\)/);
    expect(down.props).toHaveLength(2);
  });

  it("sends the API key to /props as well as to /v1/embeddings", async () => {
    const keyed = readAIProviderConfig({
      ...ENV,
      OPENAI_COMPAT_API_KEY: "k-123",
    });
    const server = fakeLlamaServer();
    await providerFor(keyed, server.fetchImpl).generateEmbeddings({
      content: "",
      type: "image",
      images: [jpeg(1)],
    });
    expect(server.propsHeaders[0]?.authorization).toBe("Bearer k-123");
    expect(server.embeds[0]?.headers.authorization).toBe("Bearer k-123");
  });
});

describe("a dropped image fails loudly", () => {
  it("refuses a vector whose prompt_tokens show no image was consumed", async () => {
    const server = fakeLlamaServer({ drop: true });
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "Tusker Lager",
        type: "text",
        taskType: "RETRIEVAL_DOCUMENT",
        images: [jpeg(1)],
      }),
    ).rejects.toThrowError(/images were not embedded/);
  });

  it("refuses when the server reports no usage at all", async () => {
    const server = fakeLlamaServer({ noUsage: true });
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "",
        type: "image",
        images: [jpeg(1)],
      }),
    ).rejects.toThrowError(/no usage\.prompt_tokens/);
  });

  it("does not ask for usage on a text-only vector", async () => {
    const server = fakeLlamaServer({ noUsage: true });
    const result = await providerFor(
      config,
      server.fetchImpl,
    ).generateEmbeddings({ content: "x", type: "text" });
    expect(result.embeddings).toHaveLength(768);
  });
});

describe("the request is checked before it is sent", () => {
  const refuse = async (
    images: Uint8Array[],
    type: "text" | "image",
    match: RegExp,
  ) => {
    const server = fakeLlamaServer();
    await expect(
      providerFor(config, server.fetchImpl).generateEmbeddings({
        content: "x",
        type,
        images,
      }),
    ).rejects.toThrowError(match);
    expect(server.embeds).toHaveLength(0);
  };

  it(`takes at most ${LLAMACPP_MAX_IMAGES} images`, async () => {
    await refuse(
      Array.from({ length: LLAMACPP_MAX_IMAGES + 1 }, (_, i) => jpeg(i)),
      "text",
      /at most 6 images/,
    );
  });

  it("takes exactly one image for an image-only vector", async () => {
    await refuse([], "image", /exactly one image; 0/);
    await refuse([jpeg(1), jpeg(2)], "image", /exactly one image; 2/);
  });

  it("refuses bytes that are not an image it can send", async () => {
    await refuse([new Uint8Array([1, 2, 3, 4])], "text", /identified/i);
  });
});

describe("Matryoshka truncation", () => {
  it("returns the first 768 of 2048, renormalised to unit length", async () => {
    const server = fakeLlamaServer();
    const { embeddings, metadata } = await providerFor(
      config,
      server.fetchImpl,
    ).generateEmbeddings({ content: "pinot noir", type: "text" });

    expect(embeddings).toHaveLength(768);
    expect(metadata.dimensions).toBe(768);
    expect(norm(embeddings)).toBeCloseTo(1, 10);
    // The prefix, in proportion — not a resampling or a projection.
    const prompt = server.lastEmbed().input.prompt_string;
    const full = Array.from({ length: 2048 }, (_, i) =>
      Math.sin(prompt.length + i),
    );
    const prefix = full.slice(0, 768);
    const scale = norm(prefix);
    expect(embeddings[0]).toBeCloseTo((prefix[0] ?? 0) / scale, 12);
    expect(embeddings[767]).toBeCloseTo((prefix[767] ?? 0) / scale, 12);
  });
});

describe("the stored identity", () => {
  const llamacpp = embeddingModelIdentity(
    "openai-compatible",
    "Qwen/Qwen3-VL-Embedding-2B",
    "llamacpp-multimodal",
  );

  it("accepts images, which is what turns on image search and fusion", () => {
    expect(llamacpp.acceptsImages).toBe(true);
  });

  it("names the template version and the image budget in the key", () => {
    expect(llamacpp.key).toBe(
      "openai-compatible:Qwen/Qwen3-VL-Embedding-2B#llamacpp-qwen3vl.v1-576@768/RETRIEVAL_DOCUMENT",
    );
    expect(LLAMACPP_EMBEDDING_VARIANT).toBe(
      `${LLAMACPP_TEMPLATE_VERSION}-${LLAMACPP_IMAGE_MAX_TOKENS}`,
    );
    expect(imageEmbeddingKey(llamacpp)).toBe(
      "openai-compatible:Qwen/Qwen3-VL-Embedding-2B#llamacpp-qwen3vl.v1-576@768/IMAGE",
    );
  });

  it("differs from the same model's text-only key, so the re-embed job walks every row", () => {
    const plain = embeddingModelIdentity(
      "openai-compatible",
      "Qwen/Qwen3-VL-Embedding-2B",
    );
    expect(plain).toEqual({
      key: embeddingModelKey({
        provider: "openai-compatible",
        model: "Qwen/Qwen3-VL-Embedding-2B",
        dimensions: 768,
      }),
      acceptsImages: false,
    });
    expect(plain.key).not.toBe(llamacpp.key);
    expect(imageEmbeddingKey(plain)).toBeNull();
  });

  it("ignores the dialect on any other provider", () => {
    expect(
      embeddingModelIdentity(
        "ollama",
        "nomic-embed-text",
        "llamacpp-multimodal",
      ),
    ).toEqual(embeddingModelIdentity("ollama", "nomic-embed-text"));
  });
});
