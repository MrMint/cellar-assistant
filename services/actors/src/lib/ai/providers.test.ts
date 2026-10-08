/**
 * The three providers' wire formats, against an injected transport.
 *
 * No credentials and no network. What is asserted is the half this repository
 * can actually be held to: that each provider sends the request its API
 * documents and reads the response that API returns. `ollama` is additionally
 * exercised for real — see `ollama.live.test.ts`, which runs only when an
 * Ollama daemon is reachable.
 *
 * The Vertex suite generates a throwaway RSA key inside the test, so the
 * service-account signing path is exercised end to end without a key existing
 * anywhere in the tree.
 */
import { generateKeyPairSync } from "node:crypto";
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { GEMINI_CHAT_MODELS, readAIProviderConfig } from "./config.ts";
import { providerFor } from "./factory.ts";
import { geminiTokenSplit, toGeminiSchema } from "./gemini.ts";
import { installAI } from "./install.ts";
import type { FetchLike, JsonSchema } from "./types.ts";

type Call = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

/** Records what was sent, replies with what was queued. */
const recorder = (
  replies: readonly unknown[],
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
      ok: true,
      status: 200,
      text: async () =>
        typeof reply === "string" ? reply : JSON.stringify(reply),
    };
  };
  return { fetchImpl, calls };
};

const vector = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i / n);

/** A JPEG as far as every sniffer here is concerned: SOI, then a JFIF APP0. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(32).fill(0)]);

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "the name" },
    count: { type: "integer", minimum: 0 },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["name"],
};

/* -------------------------------------------------------------------------- */

describe("ollama", () => {
  const config = readAIProviderConfig({
    AI_PROVIDER: "ollama",
    OLLAMA_ENDPOINT: "http://host.docker.internal:11434/",
  });

  it("posts /api/embeddings and reads `embedding`", async () => {
    const { fetchImpl, calls } = recorder([{ embedding: vector(768) }]);
    const provider = providerFor(config, fetchImpl);

    const result = await provider.generateEmbeddings({
      content: "pinot noir",
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });

    expect(result.embeddings).toHaveLength(768);
    expect(result.metadata.provider).toBe("ollama");
    expect(result.metadata.model).toBe("nomic-embed-text");
    // The trailing slash on the configured endpoint is normalised away.
    expect(calls[0]?.url).toBe(
      "http://host.docker.internal:11434/api/embeddings",
    );
    expect(calls[0]?.body).toEqual({
      model: "nomic-embed-text",
      prompt: "pinot noir",
    });
  });

  it("posts /api/chat with the JSON schema in `format`", async () => {
    const { fetchImpl, calls } = recorder([
      { message: { content: '{"name":"x"}' } },
    ]);
    const provider = providerFor(config, fetchImpl);

    const result = await provider.generateContent(
      { prompt: "read this", schema: SCHEMA },
      "high",
    );

    expect(result.content).toBe('{"name":"x"}');
    expect(result.metadata.model).toBe("gemma3:12b");
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.model).toBe("gemma3:12b");
    expect(body.stream).toBe(false);
    // Ollama takes draft-7 verbatim — no conversion, unlike Gemini.
    expect(body.format).toEqual(SCHEMA);
  });

  it("base64-encodes images onto the message", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    const { fetchImpl, calls } = recorder([{ message: { content: "ok" } }]);
    const provider = providerFor(config, fetchImpl);
    await provider.generateContent({
      prompt: "what is this",
      images: [png],
    });
    const body = calls[0]?.body as
      | { messages: { images: string[] }[] }
      | undefined;
    // Bare base64, no `data:` prefix and no media type — `/api/chat` sniffs
    // the bytes itself, unlike the OpenAI-compatible and Gemini paths.
    expect(body?.messages[0]?.images).toEqual([
      Buffer.from(png).toString("base64"),
    ]);
  });

  it("refuses an unidentifiable image instead of letting the model 400", async () => {
    // Until 2026-09-18 this provider was the only one that sent whatever it
    // was handed. Everything it could not decode came back as one sentence,
    // `Failed to load image or audio file`, naming neither image nor reason.
    const { fetchImpl, calls } = recorder([{ message: { content: "ok" } }]);
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [new Uint8Array([1, 2, 3])],
      }),
    ).rejects.toThrowError(/could not be identified/i);
    expect(calls).toHaveLength(0);
  });

  it("refuses HEIC, which ollama measurably cannot decode", async () => {
    // Measured against ollama 0.34.1 / gemma3:4b: HEIC and TIFF both 400.
    // An iPhone photo is HEIC by default, so this is the likeliest real one.
    const heic = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    const { fetchImpl } = recorder([{ message: { content: "ok" } }]);
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [heic],
      }),
    ).rejects.toThrowError(/image\/heic, which this provider does not accept/);
  });

  it("says what it sent when the model refuses an image it cannot decode", async () => {
    // The 68-byte PNG that killed thirteen menu scans: a valid signature over
    // a raster two bytes shorter than its own header declares. Nothing short
    // of decoding catches it, so the call is allowed to fail — and the error
    // is made to carry what the provider's own message never does.
    const truncated = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":"Failed to load image or audio file"}',
    });
    await expect(
      providerFor(config, fetchImpl).generateContent({
        prompt: "p",
        images: [truncated],
      }),
    ).rejects.toThrowError(/1 image — image 1: 11 bytes, image\/png/);
  });

  it("names the pull command when the body is not what the endpoint documents", async () => {
    const { fetchImpl } = recorder([{ error: "model not found" }]);
    const provider = providerFor(config, fetchImpl);
    await expect(
      provider.generateEmbeddings({ content: "x", type: "text" }),
    ).rejects.toThrow(/ollama pull nomic-embed-text/);
  });

  it("refuses an image embedding rather than pretending", async () => {
    const { fetchImpl } = recorder([]);
    const provider = providerFor(config, fetchImpl);
    await expect(
      provider.generateEmbeddings({ content: "x", type: "image" }),
    ).rejects.toThrow(ConflictError);
  });
});

/* -------------------------------------------------------------------------- */

describe("google-ai", () => {
  const config = readAIProviderConfig({
    AI_PROVIDER: "google-ai",
    GOOGLE_AI_API_KEY: "test-key-not-a-real-one",
  });

  it("sends the key in a header, never in the URL", async () => {
    const { fetchImpl, calls } = recorder([
      { embedding: { values: vector(768) } },
    ]);
    const provider = providerFor(config, fetchImpl);
    await provider.generateEmbeddings({
      content: "pinot noir",
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });

    expect(calls[0]?.url).not.toContain("test-key-not-a-real-one");
    expect(calls[0]?.headers["x-goog-api-key"]).toBe("test-key-not-a-real-one");
    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
    );
    expect(calls[0]?.body).toEqual({
      model: "models/gemini-embedding-2",
      // gemini-embedding-2 takes no taskType: the task is in the text.
      content: { parts: [{ text: "task: search result | query: pinot noir" }] },
      // 768, because every halfvec column in this database is.
      outputDimensionality: 768,
    });
  });

  it("fuses a document's text and images into one gemini-embedding-2 request", async () => {
    const { fetchImpl, calls } = recorder([
      { embedding: { values: vector(768) } },
    ]);
    const provider = providerFor(config, fetchImpl);
    await provider.generateEmbeddings({
      content: "Clos de Vougeot",
      type: "text",
      taskType: "RETRIEVAL_DOCUMENT",
      images: [JPEG],
    });
    expect(calls[0]?.body).toEqual({
      model: "models/gemini-embedding-2",
      content: {
        parts: [
          { text: "title: none | text: Clos de Vougeot" },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: Buffer.from(JPEG).toString("base64"),
            },
          },
        ],
      },
      outputDimensionality: 768,
    });
  });

  it("keeps taskType, and refuses images, for an older text-only model", async () => {
    const older = readAIProviderConfig({
      AI_PROVIDER: "google-ai",
      GOOGLE_AI_API_KEY: "test-key-not-a-real-one",
      GOOGLE_AI_EMBEDDING_MODEL: "text-embedding-004",
    });
    const { fetchImpl, calls } = recorder([
      { embedding: { values: vector(768) } },
    ]);
    const provider = providerFor(older, fetchImpl);
    await provider.generateEmbeddings({
      content: "pinot noir",
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });
    expect(calls[0]?.body).toEqual({
      model: "models/text-embedding-004",
      content: { parts: [{ text: "pinot noir" }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    });
    await expect(
      provider.generateEmbeddings({
        content: "x",
        type: "text",
        images: [JPEG],
      }),
    ).rejects.toThrow(/takes text only/);
    expect(calls).toHaveLength(1);
  });

  it("asks for JSON with a converted schema and reads the first candidate", async () => {
    const { fetchImpl, calls } = recorder([
      {
        candidates: [{ content: { parts: [{ text: '{"name":"x"}' }] } }],
        usageMetadata: { totalTokenCount: 42 },
      },
    ]);
    const provider = providerFor(config, fetchImpl);
    const result = await provider.generateContent(
      { prompt: "p", schema: SCHEMA },
      "low",
    );

    expect(result.content).toBe('{"name":"x"}');
    expect(result.metadata.tokensUsed).toBe(42);
    expect(result.metadata.model).toBe("gemini-3.1-flash-lite");
    const body = calls[0]?.body as {
      generationConfig: { responseMimeType: string; responseSchema: unknown };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual(
      toGeminiSchema(SCHEMA),
    );
  });

  /**
   * What `meteredProviderFor` settles a reservation with. Gemini reports the
   * prompt and the candidates separately, and output costs several times what
   * input does, so a swapped or missing split mis-bills every call. Nothing
   * held it: the fixture above reports only a total (mutation audit,
   * 2026-09-27).
   */
  it("reports Gemini's prompt/candidates split as input/output tokens", async () => {
    const { fetchImpl } = recorder([
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 12,
          totalTokenCount: 42,
        },
      },
    ]);
    const result = await providerFor(config, fetchImpl).generateContent({
      prompt: "p",
    });
    expect(result.metadata.inputTokens).toBe(30);
    expect(result.metadata.outputTokens).toBe(12);
  });

  /**
   * A thinking model's reasoning is billed as output ("Output price (including
   * thinking tokens)"), and on `gemini-2.5-pro` it is routinely larger than
   * the answer. Reading candidates alone settled every such call at a
   * fraction of its price. The fixture is shaped like a real 2.5-pro reply:
   * `totalTokenCount` is the sum of all three, which is what makes the dropped
   * term visible.
   */
  it("bills Gemini's thinking tokens as output", async () => {
    const { fetchImpl } = recorder([
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 12,
          thoughtsTokenCount: 900,
          totalTokenCount: 942,
        },
      },
    ]);
    const result = await providerFor(config, fetchImpl).generateContent({
      prompt: "p",
    });
    expect(result.metadata.inputTokens).toBe(30);
    expect(result.metadata.outputTokens).toBe(912);
    // The split accounts for the whole total, and nothing is counted twice.
    expect(
      (result.metadata.inputTokens ?? 0) + (result.metadata.outputTokens ?? 0),
    ).toBe(result.metadata.tokensUsed);
  });

  it("treats a candidate-less response as a refusal, not an empty result", async () => {
    const { fetchImpl } = recorder([
      { promptFeedback: { blockReason: "SAFETY" } },
    ]);
    const provider = providerFor(config, fetchImpl);
    await expect(provider.generateContent({ prompt: "p" })).rejects.toThrow(
      /refusal or a safety block/,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("vertex-ai", () => {
  /** A throwaway key, generated here. Nothing secret exists in the tree. */
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  const config = readAIProviderConfig({
    AI_PROVIDER: "vertex-ai",
    GOOGLE_GCP_PROJECT_ID: "my-project",
    GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
      type: "service_account",
      project_id: "my-project",
      client_email: "svc@my-project.iam.gserviceaccount.com",
      private_key: privateKey,
    }),
  });

  const token = { access_token: "ya29.test", expires_in: 3600 };

  it("exchanges a signed JWT for an access token, then calls the global endpoint", async () => {
    const { fetchImpl, calls } = recorder([
      token,
      { candidates: [{ content: { parts: [{ text: "hello" }] } }] },
    ]);
    const provider = providerFor(config, fetchImpl);
    const result = await provider.generateContent({ prompt: "p" }, "medium");

    expect(result.content).toBe("hello");

    // The token exchange is RFC 7523, form-encoded.
    const exchange = calls[0];
    expect(exchange?.url).toBe("https://oauth2.googleapis.com/token");
    expect(exchange?.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const form = new URLSearchParams(exchange?.body as string);
    expect(form.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const assertion = form.get("assertion") ?? "";
    const [header, claims] = assertion.split(".");
    expect(
      JSON.parse(Buffer.from(header ?? "", "base64url").toString()),
    ).toEqual({ alg: "RS256", typ: "JWT" });
    const parsedClaims = JSON.parse(
      Buffer.from(claims ?? "", "base64url").toString(),
    );
    expect(parsedClaims.iss).toBe("svc@my-project.iam.gserviceaccount.com");
    expect(parsedClaims.scope).toBe(
      "https://www.googleapis.com/auth/cloud-platform",
    );
    expect(parsedClaims.exp - parsedClaims.iat).toBe(3600);
    expect(assertion.split(".")).toHaveLength(3);

    // `global` keeps the unregioned host — Gemini 3 is served from it.
    expect(calls[1]?.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(calls[1]?.headers.authorization).toBe("Bearer ya29.test");
  });

  it("reports Gemini's prompt/candidates split as input/output tokens", async () => {
    const { fetchImpl } = recorder([
      token,
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 12,
          totalTokenCount: 42,
        },
      },
    ]);
    const result = await providerFor(config, fetchImpl).generateContent({
      prompt: "p",
    });
    expect(result.metadata.inputTokens).toBe(30);
    expect(result.metadata.outputTokens).toBe(12);
  });

  it("bills Gemini's thinking tokens as output", async () => {
    const { fetchImpl } = recorder([
      token,
      {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 12,
          thoughtsTokenCount: 900,
          totalTokenCount: 942,
        },
      },
    ]);
    const result = await providerFor(config, fetchImpl).generateContent({
      prompt: "p",
    });
    expect(result.metadata.inputTokens).toBe(30);
    expect(result.metadata.outputTokens).toBe(912);
  });

  it("caches the access token across calls", async () => {
    const { fetchImpl, calls } = recorder([
      token,
      { candidates: [{ content: { parts: [{ text: "a" }] } }] },
      { candidates: [{ content: { parts: [{ text: "b" }] } }] },
    ]);
    const provider = providerFor(config, fetchImpl);
    await provider.generateContent({ prompt: "one" });
    await provider.generateContent({ prompt: "two" });
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1);
  });

  it("sends gemini-embedding-2 to the global :embedContent — the only place Vertex serves it", async () => {
    const { fetchImpl, calls } = recorder([
      token,
      { embedding: { values: vector(768) } },
    ]);
    const provider = providerFor(config, fetchImpl);
    const result = await provider.generateEmbeddings({
      content: "Clos de Vougeot",
      type: "text",
      taskType: "RETRIEVAL_DOCUMENT",
      images: [JPEG, JPEG],
    });

    expect(result.embeddings).toHaveLength(768);
    expect(calls[1]?.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-embedding-2:embedContent",
    );
    const image = {
      inline_data: {
        mime_type: "image/jpeg",
        data: Buffer.from(JPEG).toString("base64"),
      },
    };
    expect(calls[1]?.body).toEqual({
      content: {
        role: "user",
        parts: [{ text: "title: none | text: Clos de Vougeot" }, image, image],
      },
      outputDimensionality: 768,
    });
  });

  it("refuses more than six images before calling anything", async () => {
    const { fetchImpl, calls } = recorder([token]);
    const provider = providerFor(config, fetchImpl);
    await expect(
      provider.generateEmbeddings({
        content: "x",
        type: "text",
        images: Array.from({ length: 7 }, () => JPEG),
      }),
    ).rejects.toThrow(/at most 6 images/);
    expect(calls.filter((c) => !c.url.includes("oauth2"))).toHaveLength(0);
  });

  it("honours VERTEX_AI_EMBEDDING_LOCATION over the model's default", async () => {
    // A regional model: `text-embedding-005` would otherwise go to
    // us-central1 (the `global` default's regional stand-in).
    const pinned = readAIProviderConfig({
      AI_PROVIDER: "vertex-ai",
      GOOGLE_GCP_PROJECT_ID: "my-project",
      VERTEX_AI_EMBEDDING_MODEL: "text-embedding-005",
      VERTEX_AI_EMBEDDING_LOCATION: "europe-west4",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
        type: "service_account",
        project_id: "my-project",
        client_email: "svc@my-project.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
    });
    const { fetchImpl, calls } = recorder([
      token,
      { predictions: [{ embeddings: { values: vector(768) } }] },
    ]);
    await providerFor(pinned, fetchImpl).generateEmbeddings({
      content: "x",
      type: "text",
    });
    expect(calls[1]?.url).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/my-project/locations/europe-west4/publishers/google/models/text-embedding-005:predict",
    );
  });

  it("refuses a regional VERTEX_AI_EMBEDDING_LOCATION for gemini-embedding-2, which Vertex serves only at global", () => {
    const env = (overrides: Record<string, string>) => ({
      AI_PROVIDER: "vertex-ai",
      GOOGLE_GCP_PROJECT_ID: "my-project",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
        type: "service_account",
        project_id: "my-project",
        client_email: "svc@my-project.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
      ...overrides,
    });
    // The default model, and an explicitly named one (with the `models/`
    // prefix and a dated suffix `isGeminiEmbedding2` also recognises).
    for (const model of [
      undefined,
      "gemini-embedding-2",
      "models/gemini-embedding-2-001",
    ]) {
      const named: Record<string, string> =
        model === undefined ? {} : { VERTEX_AI_EMBEDDING_MODEL: model };
      expect(() =>
        readAIProviderConfig(
          env({ ...named, VERTEX_AI_EMBEDDING_LOCATION: "us-central1" }),
        ),
      ).toThrow(ValidationError);
      expect(() =>
        readAIProviderConfig(
          env({ ...named, VERTEX_AI_EMBEDDING_LOCATION: "europe-west4" }),
        ),
      ).toThrow(/only at "global".*Leave VERTEX_AI_EMBEDDING_LOCATION empty/);
      // …and at boot, where `installAI` reads the same config and does not
      // catch: the host stops rather than dead-lettering every embedding.
      expect(() =>
        installAI({
          env: env({ ...named, VERTEX_AI_EMBEDDING_LOCATION: "us-central1" }),
        }),
      ).toThrow(/VERTEX_AI_EMBEDDING_LOCATION="us-central1" cannot serve/);
      // `global`, and empty (blank reads as unset), are what it is served at.
      expect(
        readAIProviderConfig(
          env({ ...named, VERTEX_AI_EMBEDDING_LOCATION: "global" }),
        ),
      ).toMatchObject({ embeddingLocation: "global" });
      expect(
        readAIProviderConfig(
          env({ ...named, VERTEX_AI_EMBEDDING_LOCATION: "" }),
        ),
      ).toMatchObject({ embeddingLocation: null });
    }
  });

  it("sends an older text-embedding model's :predict to a region — it has no global endpoint", async () => {
    const older = readAIProviderConfig({
      AI_PROVIDER: "vertex-ai",
      GOOGLE_GCP_PROJECT_ID: "my-project",
      VERTEX_AI_EMBEDDING_MODEL: "text-embedding-005",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
        type: "service_account",
        project_id: "my-project",
        client_email: "svc@my-project.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
    });
    const { fetchImpl, calls } = recorder([
      token,
      { predictions: [{ embeddings: { values: vector(768) } }] },
    ]);
    const provider = providerFor(older, fetchImpl);
    const result = await provider.generateEmbeddings({
      content: "pinot noir",
      type: "text",
      taskType: "RETRIEVAL_DOCUMENT",
    });

    expect(result.embeddings).toHaveLength(768);
    expect(calls[1]?.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/text-embedding-005:predict",
    );
    expect(calls[1]?.body).toEqual({
      instances: [{ content: "pinot noir", task_type: "RETRIEVAL_DOCUMENT" }],
      parameters: { outputDimensionality: 768 },
    });
  });

  it("refuses a key whose private_key is not a usable PEM", async () => {
    const broken = readAIProviderConfig({
      AI_PROVIDER: "vertex-ai",
      GOOGLE_GCP_PROJECT_ID: "p",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
        project_id: "p",
        client_email: "a@b.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----",
      }),
    });
    const { fetchImpl } = recorder([token]);
    const provider = providerFor(broken, fetchImpl);
    await expect(provider.generateContent({ prompt: "p" })).rejects.toThrow(
      /could not sign an assertion/,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("the shared Gemini schema converter", () => {
  it("uppercases types and carries propertyOrdering", () => {
    expect(toGeminiSchema(SCHEMA)).toEqual({
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "the name" },
        count: { type: "INTEGER", minimum: 0 },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
      propertyOrdering: ["name", "count", "tags"],
      required: ["name"],
    });
  });

  it("widens an untyped node to STRING rather than sending an invalid schema", () => {
    expect(toGeminiSchema({})).toEqual({ type: "STRING" });
  });
});

describe("the shared Gemini usage split", () => {
  it("adds thoughts to output and tool-use prompt tokens to input", () => {
    expect(
      geminiTokenSplit({
        usageMetadata: {
          promptTokenCount: 100,
          toolUsePromptTokenCount: 7,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 300,
          totalTokenCount: 427,
        },
      }),
    ).toEqual({ inputTokens: 107, outputTokens: 320 });
  });

  it("reads an absent thoughts count as a non-thinking call, not as unreported", () => {
    // proto3 omits zero-valued fields, so a model that did not think sends no
    // `thoughtsTokenCount` at all.
    expect(
      geminiTokenSplit({
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("does not invent an output side from thoughts alone", () => {
    // No candidates count is "the API did not say", and settling on the
    // thoughts alone would book less than the call cost.
    expect(
      geminiTokenSplit({
        usageMetadata: { promptTokenCount: 10, thoughtsTokenCount: 50 },
      }),
    ).toEqual({ inputTokens: 10 });
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Model ids Google has retired or set a retirement date for. A default on this
 * list is a deployment that stops working on a date nobody here chose.
 * Vertex's lifecycle page gave the whole 2.5 family 2026-10-20; the 2.0
 * family was shut down 2026-06-01; 1.5 went before that. Add to this list when
 * Google announces a date, not when the model starts failing.
 */
const RETIRED_MODEL_IDS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

/** Exact, or a dated / suffixed variant of a retired id (`gemini-2.5-pro-002`). */
const isRetired = (model: string): boolean =>
  RETIRED_MODEL_IDS.some((id) => model === id || model.startsWith(`${id}-`));

describe("default model ids", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const defaults = {
    "vertex-ai": readAIProviderConfig({
      AI_PROVIDER: "vertex-ai",
      GOOGLE_GCP_PROJECT_ID: "my-project",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
        type: "service_account",
        project_id: "my-project",
        client_email: "svc@my-project.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
    }),
    "google-ai": readAIProviderConfig({
      AI_PROVIDER: "google-ai",
      GOOGLE_AI_API_KEY: "test-key-not-a-real-one",
    }),
  };

  it.each(Object.entries(defaults))(
    "%s defaults to no retired chat or embedding model",
    (_name, config) => {
      if (!("models" in config)) throw new Error("expected a paid provider");
      const used = [...Object.values(config.models), config.embeddingModel];
      expect(used.filter(isRetired)).toEqual([]);
      // And the defaults really are the shared constant, so the check above
      // and the one below cannot pass on two different lists.
      expect(config.models).toEqual(GEMINI_CHAT_MODELS);
    },
  );

  it("knows a retired id when it sees one", () => {
    expect(isRetired("gemini-2.5-flash")).toBe(true);
    expect(isRetired("gemini-2.5-pro-002")).toBe(true);
    expect(isRetired("gemini-3.5-flash")).toBe(false);
    expect(isRetired("gemini-3.1-flash-lite")).toBe(false);
  });
});
