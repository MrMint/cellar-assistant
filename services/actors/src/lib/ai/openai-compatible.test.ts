/**
 * The OpenAI-compatible provider — the local-dev path of the standing decision
 * in `docs/architecture/e4-decisions.md` §12 (local = vLLM on the Mac, deployed
 * = Gemini on Vertex).
 *
 * No credentials and no network; the transport is injected, exactly as in
 * `providers.test.ts`. Two groups carry real weight rather than covering lines:
 *
 *  - **`required` round-trips verbatim.** The abstention contract. A grammar
 *    `required` is a compulsion, not a request, so a converter that widened it
 *    would make "I could not read this" unsayable and the model would
 *    confabulate instead. `prompts.ts` has the measurement.
 *  - **The width check.** Vertex's `gemini-embedding-2` emits 768 on request and
 *    `Qwen3-VL-Embedding-2B` emits 2048, so the two sanctioned paths disagree
 *    and something has to refuse. A wrong-width vector must never reach a
 *    `halfvec(768)` column.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { readAIProviderConfig } from "./config.ts";
import { providerFor } from "./factory.ts";
import {
  completionText,
  fitDimensions,
  normaliseBase,
  toOpenAISchema,
} from "./openai-compatible.ts";
import {
  INSIGHTS_SCHEMA,
  MENU_EXTRACTION_SCHEMA,
  MENU_MATCH_SCHEMA,
  PLACE_REVIEW_SCHEMA,
  RECIPE_PHOTO_SCHEMA,
} from "./prompts.ts";
import type { FetchLike, JsonSchema } from "./types.ts";

type Call = { url: string; headers: Record<string, string>; body: unknown };

const recorder = (
  replies: readonly unknown[],
  status = 200,
): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchImpl: FetchLike = async (url, init) => {
    const raw = init?.body ?? "";
    calls.push({
      url,
      headers: init?.headers ?? {},
      body: raw.startsWith("{") ? JSON.parse(raw) : raw,
    });
    const reply = queue.shift();
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () =>
        typeof reply === "string" ? reply : JSON.stringify(reply),
    };
  };
  return { fetchImpl, calls };
};

/**
 * The recorded body of call `n`, typed. A missing call throws rather than
 * yielding `undefined` for a property read to trip over several lines later —
 * and avoids a non-null assertion, which this repo does not use.
 */
const bodyAt = <T>(calls: readonly Call[], n = 0): T => {
  const call = calls[n];
  if (call === undefined) {
    throw new Error(`no request was recorded at index ${n}`);
  }
  return call.body as T;
};

const vector = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => (i + 1) / n);

const embeddingReply = (n: number): unknown => ({
  object: "list",
  data: [{ object: "embedding", index: 0, embedding: vector(n) }],
  model: "test",
  usage: { prompt_tokens: 4, total_tokens: 4 },
});

const completionReply = (content: string, finish = "stop"): unknown => ({
  id: "chatcmpl-1",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content },
      finish_reason: finish,
    },
  ],
  usage: { total_tokens: 42 },
});

const LOCAL = {
  AI_PROVIDER: "openai-compatible",
  OPENAI_COMPAT_ENDPOINT: "http://localhost:8000",
  OPENAI_COMPAT_EMBEDDING_ENDPOINT: "http://localhost:8001",
} as const;

const config = readAIProviderConfig(LOCAL);

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "the name" },
    count: { type: "integer", minimum: 0 },
    tags: { type: "array", items: { type: "string" } },
    vintage: { type: "string", nullable: true },
    nested: {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "boolean" } },
      required: ["a"],
    },
  },
  required: ["name"],
};

/* -------------------------------------------------------------------------- */
/* 1 · structured output — the abstention contract                            */
/* -------------------------------------------------------------------------- */

/** Every `required` array in a converted schema, keyed by its path. */
const requiredByPath = (
  node: unknown,
  path = "$",
  into: Record<string, readonly string[] | null> = {},
): Record<string, readonly string[] | null> => {
  if (typeof node !== "object" || node === null) return into;
  const record = node as Record<string, unknown>;
  const properties = record.properties;
  if (typeof properties === "object" && properties !== null) {
    into[path] = Array.isArray(record.required)
      ? (record.required as readonly string[])
      : null;
    for (const [key, value] of Object.entries(properties)) {
      requiredByPath(value, `${path}.${key}`, into);
    }
  }
  if (record.items !== undefined)
    requiredByPath(record.items, `${path}[]`, into);
  return into;
};

/** The same, read off the *input* `JsonSchema`. */
const sourceRequiredByPath = (
  node: JsonSchema,
  path = "$",
  into: Record<string, readonly string[] | null> = {},
): Record<string, readonly string[] | null> => {
  if (node.properties !== undefined) {
    into[path] = node.required ?? null;
    for (const [key, value] of Object.entries(node.properties)) {
      sourceRequiredByPath(value, `${path}.${key}`, into);
    }
  }
  if (node.items !== undefined)
    sourceRequiredByPath(node.items, `${path}[]`, into);
  return into;
};

describe("structured output preserves optionality", () => {
  it("copies `required` verbatim at every node, and invents none", () => {
    expect(requiredByPath(toOpenAISchema(SCHEMA))).toEqual(
      sourceRequiredByPath(SCHEMA),
    );
  });

  it("does not promote unlisted properties to required", () => {
    const converted = toOpenAISchema(SCHEMA) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    // The schema declares five properties and requires exactly one.
    expect(Object.keys(converted.properties)).toHaveLength(5);
    expect(converted.required).toEqual(["name"]);
    for (const key of ["count", "tags", "vintage", "nested"]) {
      expect(converted.required).not.toContain(key);
    }
  });

  it("omits `required` entirely where the source omits it", () => {
    const noRequired = toOpenAISchema({
      type: "object",
      properties: { a: { type: "string" } },
    });
    expect(noRequired).not.toHaveProperty("required");
  });

  it("sends strict:false, because strict:true means `required` must list every key", () => {
    const { fetchImpl, calls } = recorder([completionReply('{"name":"x"}')]);
    const provider = providerFor(config, fetchImpl);
    return provider
      .generateContent({ prompt: "hi", schema: SCHEMA })
      .then(() => {
        const body = calls[0]?.body as {
          response_format: {
            type: string;
            json_schema: { strict: boolean; schema: { required: string[] } };
          };
        };
        expect(body.response_format.type).toBe("json_schema");
        expect(body.response_format.json_schema.strict).toBe(false);
        expect(body.response_format.json_schema.schema.required).toEqual([
          "name",
        ]);
      });
  });

  it("carries nullable through as a null union, not as an ignored keyword", () => {
    const converted = toOpenAISchema(SCHEMA) as {
      properties: { vintage: { type: unknown } };
    };
    // `nullable` is OpenAPI 3.0; a JSON Schema grammar compiler drops it, which
    // would remove the model's way of saying "present but unknown".
    expect(converted.properties.vintage.type).toEqual(["string", "null"]);
  });

  it("forbids invented keys on every object", () => {
    const converted = toOpenAISchema(SCHEMA) as {
      additionalProperties: boolean;
      properties: { nested: { additionalProperties: boolean } };
    };
    expect(converted.additionalProperties).toBe(false);
    expect(converted.properties.nested.additionalProperties).toBe(false);
  });

  it("holds for every real production schema, not just a contrived one", () => {
    // These five are what the seams actually send. `prompts.ts` curated each
    // `required` list deliberately — `PLACE_REVIEW_SCHEMA`, for instance,
    // requires only `approved`, where the Nhost schema required five fields
    // and got nulls back for them.
    const production = {
      INSIGHTS_SCHEMA,
      MENU_EXTRACTION_SCHEMA,
      MENU_MATCH_SCHEMA,
      RECIPE_PHOTO_SCHEMA,
      PLACE_REVIEW_SCHEMA,
    };
    for (const [name, schema] of Object.entries(production)) {
      expect(
        requiredByPath(toOpenAISchema(schema)),
        `${name} lost or gained a required field in translation`,
      ).toEqual(sourceRequiredByPath(schema));
    }
  });

  it("keeps PLACE_REVIEW_SCHEMA down to its one honest required field", () => {
    // The field with no abstention to offer. Everything else must stay
    // omittable or the model invents categories and flags.
    const converted = toOpenAISchema(PLACE_REVIEW_SCHEMA) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(converted.required).toEqual(["approved"]);
    expect(Object.keys(converted.properties).length).toBeGreaterThan(1);
  });

  it("sends no response_format when no schema was asked for", () => {
    const { fetchImpl, calls } = recorder([completionReply("plain text")]);
    const provider = providerFor(config, fetchImpl);
    return provider.generateContent({ prompt: "hi" }).then(() => {
      expect(calls[0]?.body).not.toHaveProperty("response_format");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 2 · the chat wire format                                                    */
/* -------------------------------------------------------------------------- */

describe("chat completions", () => {
  it("posts /v1/chat/completions and reads choices[0].message.content", async () => {
    const { fetchImpl, calls } = recorder([completionReply("hello")]);
    const provider = providerFor(config, fetchImpl);

    const result = await provider.generateContent({ prompt: "say hi" }, "low");

    expect(calls[0]?.url).toBe("http://localhost:8000/v1/chat/completions");
    expect(result.content).toBe("hello");
    expect(result.metadata.provider).toBe("openai-compatible");
    expect(result.metadata.tokensUsed).toBe(42);
    const body = calls[0]?.body as { messages: { content: unknown[] }[] };
    expect(body.messages[0]?.content).toEqual([
      { type: "text", text: "say hi" },
    ]);
  });

  /**
   * The metered provider settles a reservation with the server's own
   * prompt/completion split when there is one, and falls back to splitting
   * `total_tokens` against its pre-call estimate when there is not — which,
   * for an image-heavy prompt, books output tokens as input. Dropping the
   * split from the metadata left this file green (mutation audit,
   * 2026-09-27); the fixture above reports only a total.
   */
  it("reports the server's prompt/completion split for settlement", async () => {
    const { fetchImpl } = recorder([
      {
        id: "chatcmpl-2",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "hello" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
      },
    ]);
    const result = await providerFor(config, fetchImpl).generateContent(
      { prompt: "say hi" },
      "low",
    );
    expect(result.metadata.inputTokens).toBe(30);
    expect(result.metadata.outputTokens).toBe(12);
  });

  it("picks the model for the quality tier", async () => {
    const withModels = readAIProviderConfig({
      ...LOCAL,
      OPENAI_COMPAT_MODEL_LOW: "small",
      OPENAI_COMPAT_MODEL_MEDIUM: "mid",
      OPENAI_COMPAT_MODEL_HIGH: "big",
    });
    for (const [quality, expected] of [
      ["low", "small"],
      ["medium", "mid"],
      ["high", "big"],
    ] as const) {
      const { fetchImpl, calls } = recorder([completionReply("x")]);
      const provider = providerFor(withModels, fetchImpl);
      await provider.generateContent({ prompt: "p" }, quality);
      expect(bodyAt<{ model: string }>(calls).model).toBe(expected);
    }
  });

  it("inlines images as data URIs labelled from their own bytes", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    const { fetchImpl, calls } = recorder([completionReply("a label")]);
    const provider = providerFor(config, fetchImpl);

    await provider.generateContent({ prompt: "read this", images: [png] });

    const body = bodyAt<{
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    }>(calls);
    const part = body.messages[0]?.content[1];
    expect(part?.type).toBe("image_url");
    // A `data:` URI's declared type is what the server decodes by, so a PNG
    // announced as JPEG is rejected or mis-decoded. `image-mime.test.ts` holds
    // the per-format table.
    expect(part?.image_url?.url.startsWith("data:image/png;base64,")).toBe(
      true,
    );
  });

  it("refuses an unidentifiable image instead of guessing JPEG", async () => {
    // The provider used to fall back to `image/jpeg` here, which is the same
    // mislabel `gemini.ts` was fixed for.
    const { fetchImpl } = recorder([completionReply("x")]);
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [new Uint8Array([1, 2, 3, 4, 5])],
      }),
    ).rejects.toThrowError(/could not be identified/i);
  });

  it("refuses HEIC here, though the Gemini path accepts it", async () => {
    // Deliberate asymmetry: a local server needs pillow-heif, which is not
    // there by default. Better to fail named in dev than surprise prod.
    const heic = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    const { fetchImpl } = recorder([completionReply("x")]);
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [heic],
      }),
    ).rejects.toThrowError(/image\/heic, which this provider does not accept/);
  });

  it("says what it sent when the server refuses an image it accepted the container of", async () => {
    // Not an ollama-only concern: vLLM and llama-server refuse a malformed
    // raster with the same `Failed to load image or audio file`, and
    // `requireImageMime` cannot see past a valid signature. `http.ts`'s
    // `withImageContext` is shared by all four providers for that reason.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    const { fetchImpl } = recorder(
      ['{"error":"Failed to load image or audio file"}'],
      400,
    );
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [png],
      }),
    ).rejects.toThrowError(/1 image — image 1: 11 bytes, image\/png/);
  });

  it("sends no Authorization header when no key is configured", async () => {
    const { fetchImpl, calls } = recorder([completionReply("x")]);
    await providerFor(config, fetchImpl).generateContent({ prompt: "p" });
    expect(Object.keys(calls[0]?.headers ?? {})).not.toContain("authorization");
  });

  it("sends a bearer token when one is configured, and never in the URL", async () => {
    const keyed = readAIProviderConfig({
      ...LOCAL,
      OPENAI_COMPAT_API_KEY: "sk-local-secret",
    });
    const { fetchImpl, calls } = recorder([completionReply("x")]);
    await providerFor(keyed, fetchImpl).generateContent({ prompt: "p" });
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-local-secret");
    expect(calls[0]?.url).not.toContain("sk-local-secret");
  });

  it("omits max_tokens unless configured, so the server uses the full context", async () => {
    const { fetchImpl, calls } = recorder([completionReply("x")]);
    await providerFor(config, fetchImpl).generateContent({ prompt: "p" });
    expect(calls[0]?.body).not.toHaveProperty("max_tokens");

    const capped = readAIProviderConfig({
      ...LOCAL,
      OPENAI_COMPAT_MAX_TOKENS: "4096",
    });
    const second = recorder([completionReply("x")]);
    await providerFor(capped, second.fetchImpl).generateContent({
      prompt: "p",
    });
    expect(bodyAt<{ max_tokens: number }>(second.calls).max_tokens).toBe(4096);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 · completions that must not be mistaken for answers                       */
/* -------------------------------------------------------------------------- */

describe("a bad completion fails rather than returning something plausible", () => {
  const cases: readonly { name: string; raw: unknown; match: RegExp }[] = [
    {
      name: "no choices at all is a refusal",
      raw: { choices: [], error: { message: "model not found" } },
      match: /no choices/i,
    },
    {
      name: "a truncated completion names the token limit",
      raw: completionReply('{"name":"par', "length"),
      match: /finish_reason: length|token limit/i,
    },
    {
      name: "an empty completion",
      raw: completionReply(""),
      match: /empty completion/i,
    },
    {
      name: "a choice with no message",
      raw: { choices: [{ finish_reason: "stop" }] },
      match: /no.*message/i,
    },
    {
      name: "a non-object body",
      raw: "[]",
      match: /non-object/i,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const { fetchImpl } = recorder([testCase.raw]);
      const provider = providerFor(config, fetchImpl);
      await expect(
        provider.generateContent({ prompt: "p" }),
      ).rejects.toThrowError(testCase.match);
      await expect(
        provider.generateContent({ prompt: "p" }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  }

  it("a truncated structured answer fails here, not later as `not JSON`", () => {
    // `parseModelJson` would report this as a parse error several layers from
    // the cause; naming finish_reason is what makes it actionable.
    expect(() =>
      completionText(completionReply('{"a":1', "length"), "m", "http://x/v1"),
    ).toThrowError(/truncated/i);
  });

  it("a transport failure propagates", async () => {
    const failing: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      providerFor(config, failing).generateContent({ prompt: "p" }),
    ).rejects.toThrowError(/ECONNREFUSED/);
  });
});

/* -------------------------------------------------------------------------- */
/* 4 · embeddings and the width that must match every halfvec column           */
/* -------------------------------------------------------------------------- */

describe("embeddings", () => {
  it("posts /v1/embeddings to the embedding endpoint, not the chat one", async () => {
    const { fetchImpl, calls } = recorder([embeddingReply(768)]);
    const provider = providerFor(config, fetchImpl);

    const result = await provider.generateEmbeddings({
      content: "pinot noir",
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });

    expect(calls[0]?.url).toBe("http://localhost:8001/v1/embeddings");
    expect(result.embeddings).toHaveLength(768);
    expect(result.metadata.dimensions).toBe(768);
    const body = calls[0]?.body as {
      dimensions: number;
      encoding_format: string;
      input: string;
    };
    expect(body.dimensions).toBe(768);
    // Explicit, or a server defaulting to base64 arrives as a shape complaint.
    expect(body.encoding_format).toBe("float");
    expect(body.input).toContain("pinot noir");
  });

  it("defaults the embedding endpoint to the chat endpoint", async () => {
    // One base serves both routes on every compatible server but vLLM, which
    // is one model per process. Only vLLM should pay for vLLM's design.
    const single = readAIProviderConfig({
      AI_PROVIDER: "openai-compatible",
      OPENAI_COMPAT_ENDPOINT: "http://localhost:1234",
    });
    const { fetchImpl, calls } = recorder([embeddingReply(768)]);
    await providerFor(single, fetchImpl).generateEmbeddings({
      content: "x",
      type: "text",
    });
    expect(calls[0]?.url).toBe("http://localhost:1234/v1/embeddings");
  });

  it("distinguishes query and document instructions, and they differ", async () => {
    const sent: string[] = [];
    for (const taskType of ["RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT"] as const) {
      const { fetchImpl, calls } = recorder([embeddingReply(768)]);
      await providerFor(config, fetchImpl).generateEmbeddings({
        content: "chardonnay",
        type: "text",
        taskType,
      });
      sent.push(bodyAt<{ input: string }>(calls).input);
    }
    // Unlike Ollama, where taskType is a documented no-op, the instruction
    // changes the vector here — so the two sides must be told apart, and must
    // stay consistent with whatever embedded the stored rows.
    expect(sent[0]).not.toBe(sent[1]);
  });

  it("refuses a narrower vector than the halfvec columns, naming both widths", async () => {
    const { fetchImpl } = recorder([embeddingReply(384)]);
    await expect(
      providerFor(config, fetchImpl).generateEmbeddings({
        content: "x",
        type: "text",
      }),
    ).rejects.toThrowError(/384-dimension.*768 wide/s);
  });

  it("refuses a wider vector by default — Qwen emits 2048, the columns are 768", async () => {
    const { fetchImpl } = recorder([embeddingReply(2048)]);
    await expect(
      providerFor(config, fetchImpl).generateEmbeddings({
        content: "x",
        type: "text",
      }),
    ).rejects.toThrowError(/2048-dimension/);
  });

  it("names the vLLM fix in the width error", async () => {
    const { fetchImpl } = recorder([embeddingReply(2048)]);
    await expect(
      providerFor(config, fetchImpl).generateEmbeddings({
        content: "x",
        type: "text",
      }),
    ).rejects.toThrowError(/override-pooler-config/);
  });

  it("truncates AND renormalises under the explicit Matryoshka opt-in", async () => {
    const matryoshka = readAIProviderConfig({
      ...LOCAL,
      OPENAI_COMPAT_EMBEDDING_TRUNCATE: "true",
    });
    const { fetchImpl } = recorder([embeddingReply(2048)]);
    const result = await providerFor(matryoshka, fetchImpl).generateEmbeddings({
      content: "x",
      type: "text",
    });

    expect(result.embeddings).toHaveLength(768);
    const norm = Math.sqrt(
      result.embeddings.reduce((sum, x) => sum + x * x, 0),
    );
    // Renormalisation is the half a naive truncation forgets; without it the
    // cosine distances are systematically compressed.
    expect(norm).toBeCloseTo(1, 10);
  });

  it("rejects a base64 embedding with a message about encoding_format", async () => {
    const { fetchImpl } = recorder([{ data: [{ embedding: "AAAAgD8AAAAA" }] }]);
    await expect(
      providerFor(config, fetchImpl).generateEmbeddings({
        content: "x",
        type: "text",
      }),
    ).rejects.toThrowError(/base64/i);
  });

  const badBodies: readonly { name: string; raw: unknown; match: RegExp }[] = [
    { name: "no data array", raw: { object: "list" }, match: /no `data`/ },
    { name: "an empty data array", raw: { data: [] }, match: /empty `data`/ },
    {
      name: "a null embedding",
      raw: { data: [{ embedding: null }] },
      match: /no embedding/i,
    },
    {
      name: "a stringly-typed component",
      raw: { data: [{ embedding: ["0.1", "0.2"] }] },
      match: /non-numeric/i,
    },
  ];

  for (const testCase of badBodies) {
    it(`refuses ${testCase.name}`, async () => {
      const { fetchImpl } = recorder([testCase.raw]);
      await expect(
        providerFor(config, fetchImpl).generateEmbeddings({
          content: "x",
          type: "text",
        }),
      ).rejects.toThrowError(testCase.match);
    });
  }

  it("refuses type:image under the default openai dialect", async () => {
    const { fetchImpl } = recorder([embeddingReply(768)]);
    await expect(
      providerFor(config, fetchImpl).generateEmbeddings({
        content: "x",
        type: "image",
      }),
    ).rejects.toThrowError(/text embeddings only/);
  });

  it("never returns a zero vector", () => {
    expect(() =>
      fitDimensions(new Array(2048).fill(0), 768, "m", "http://x", {
        truncateEmbeddings: true,
      }),
    ).toThrowError(/zero/);
  });
});

/* -------------------------------------------------------------------------- */
/* 5 · configuration                                                           */
/* -------------------------------------------------------------------------- */

describe("configuration", () => {
  it("needs no credentials at all — the point of a local provider", () => {
    const provider = providerFor(
      readAIProviderConfig({ AI_PROVIDER: "openai-compatible" }),
      async () => {
        throw new Error("unused");
      },
    );
    expect(provider.name).toBe("openai-compatible");
  });

  it("defaults to vLLM's port", () => {
    const resolved = readAIProviderConfig({
      AI_PROVIDER: "openai-compatible",
    });
    expect(resolved.provider).toBe("openai-compatible");
    if (resolved.provider !== "openai-compatible") return;
    expect(resolved.endpoint).toBe("http://localhost:8000");
    expect(resolved.embeddingDimensions).toBe(768);
    expect(resolved.apiKey).toBeNull();
    expect(resolved.truncateEmbeddings).toBe(false);
  });

  it("rejects a non-boolean truncate flag rather than reading it as false", () => {
    // A typo that silently disabled the flag would restore the very dimension
    // error the operator was suppressing.
    expect(() =>
      readAIProviderConfig({
        ...LOCAL,
        OPENAI_COMPAT_EMBEDDING_TRUNCATE: "yes",
      }),
    ).toThrowError(/must be true or false/);
  });

  it("accepts a base that already carries /v1, and one that does not", () => {
    expect(normaliseBase("http://localhost:8000")).toBe(
      "http://localhost:8000/v1",
    );
    expect(normaliseBase("http://localhost:8000/")).toBe(
      "http://localhost:8000/v1",
    );
    expect(normaliseBase("http://localhost:8000/v1")).toBe(
      "http://localhost:8000/v1",
    );
    expect(normaliseBase("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1",
    );
  });

  it("is reachable through the factory by name", () => {
    const provider = providerFor(config, async () => {
      throw new Error("unused");
    });
    expect(provider.name).toBe("openai-compatible");
    expect(provider.getAvailableQualities()).toEqual(["low", "medium", "high"]);
  });
});
