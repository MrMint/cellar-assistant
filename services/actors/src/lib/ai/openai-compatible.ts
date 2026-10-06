/**
 * Any server speaking OpenAI's HTTP surface — the sanctioned **local dev**
 * provider, and the reason it is not called `vllm`.
 *
 * The standing decision (`docs/architecture/e4-decisions.md` §12) is: local dev
 * on the Mac runs vLLM, deployed runs Gemini on Vertex. vLLM is reached here
 * because vLLM serves an OpenAI-compatible API — and writing the provider
 * against *that* rather than against vLLM means `llama-server`, LM Studio, an
 * MLX-backed shim, Ollama's own `/v1` route and api.openai.com are all the same
 * two environment variables away. That matters more than usual, because vLLM on
 * Apple silicon has **no Metal backend**: it builds and runs, CPU-only, at
 * ~52 s/image against 1.16 s on MPS (`findings/vllm-provider.md` §6). If that
 * proves intolerable, the escape hatch is a base URL, not a rewrite.
 *
 *  - content:    `POST {endpoint}/v1/chat/completions`
 *  - embeddings: `POST {embeddingEndpoint}/v1/embeddings` — OpenAI's
 *    `{input: string}` by default, or llama.cpp's multimodal
 *    `{input: {prompt_string, multimodal_data}}` under
 *    `OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal`, which is how the
 *    local lane embeds images (`createLlamacppEmbedder` below).
 *
 * Two endpoints because `vllm serve <model>` is one model per process, while
 * `AIProvider` demands both a chat model and an embedding model. See
 * `OpenAICompatibleConfig`.
 *
 * ## What is deliberately not done here
 *
 *  - **No `openai` npm dependency.** Two documented POSTs, against a service
 *    that runs straight off the source with no build step (`http.ts`).
 *  - **No prompt or response logging.** Menu photos and recipe notes are user
 *    content (`ollama.ts` makes the same point about the Nhost provider).
 *  - **No normalisation or zero-filling of a wrong-width vector.** A vector of
 *    the wrong width is an error, not something to repair silently — except
 *    under the explicit Matryoshka opt-in, which renormalises correctly.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import type { OpenAICompatibleConfig } from "./config.ts";
import { isRecord, postJson, requireVector, withImageContext } from "./http.ts";
import { OPENAI_IMAGE_MIMES, requireImageMime } from "./image-mime.ts";
import type {
  AIProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingTaskType,
  FetchLike,
  GenerateContentRequest,
  GenerateContentResponse,
  JsonSchema,
  ModelQuality,
} from "./types.ts";
import { MODEL_QUALITIES } from "./types.ts";

const PROVIDER = "openai-compatible" as const;

/**
 * **The single most important line in this file.**
 *
 * OpenAI's structured-output `strict: true` mode carries a documented
 * requirement that *every* property appear in `required` — optionality is
 * expressed only as a `null` union. Servers reconcile a schema that breaks that
 * rule in one of two ways: reject it, or **promote every property to
 * required**. The second is catastrophic here and silent.
 *
 * `prompts.ts` records the measurement, and it is the load-bearing fact behind
 * every schema in this codebase:
 *
 * > A grammar-level `required` is not a request, it is a compulsion — the
 * > decoder *cannot* end the object without emitting those keys, so "I could
 * > not read a vintage" becomes structurally unsayable and the model emits a
 * > plausible year instead. Measured: adding the bag to `required` turned an
 * > empty answer into `{"vintage":"2005","style":"SPARKLING"}` for a wine that
 * > does not exist.
 *
 * vLLM compiles `response_format` through xgrammar/outlines/llguidance, all of
 * which turn `required` into a decoding grammar. There is no backend for which
 * it is advisory. So `strict` is pinned to `false`: the schema still constrains
 * decoding, but the `required` list this codebase carefully curated is honoured
 * as written instead of being widened to every key.
 *
 * `openai-compatible.test.ts` asserts both halves — that this is false on the
 * wire, and that `required` round-trips verbatim at every node.
 */
const STRICT = false;

/**
 * JSON Schema draft-7 → what `response_format: {type: "json_schema"}` wants.
 *
 * Far less translation than `toGeminiSchema` needs, because the target *is*
 * JSON Schema — no uppercasing, no `propertyOrdering`. Three real changes:
 *
 *  1. **`required` is copied verbatim, or omitted.** Never synthesised, never
 *     widened, never sorted. This is the abstention contract; see `STRICT`.
 *  2. **`nullable: true` becomes `type: [t, "null"]`.** `nullable` is OpenAPI
 *     3.0 and means nothing to a JSON Schema grammar compiler, which would
 *     ignore it — and an ignored `nullable` on a non-required field is
 *     harmless, but on a *required* one it removes the model's only way to say
 *     "present but unknown". Translating it keeps that escape open.
 *  3. **`additionalProperties: false` on every object.** Not about
 *     optionality: it stops the model inventing keys that the parsers in
 *     `json.ts` would then drop on the floor.
 */
export const toOpenAISchema = (schema: JsonSchema): Record<string, unknown> => {
  const nullable = schema.nullable === true;
  /** `"string"` → `["string", "null"]` when nullable. */
  const typeOf = (name: string): string | string[] =>
    nullable ? [name, "null"] : name;

  switch (schema.type) {
    case "object": {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        properties[key] = toOpenAISchema(value);
      }
      return {
        type: typeOf("object"),
        properties,
        additionalProperties: false,
        // Verbatim. Rule 1 above — do not touch this without reading `STRICT`.
        ...(schema.required === undefined ? {} : { required: schema.required }),
        ...(schema.description === undefined
          ? {}
          : { description: schema.description }),
      };
    }
    case "array":
      return {
        type: typeOf("array"),
        items:
          schema.items === undefined
            ? { type: "string" }
            : toOpenAISchema(schema.items),
        ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }),
        ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }),
        ...(schema.description === undefined
          ? {}
          : { description: schema.description }),
      };
    case "integer":
    case "number":
    case "boolean":
    case "string":
      return {
        type: typeOf(schema.type),
        ...(schema.enum === undefined ? {} : { enum: schema.enum }),
        ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
        ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
        ...(schema.description === undefined
          ? {}
          : { description: schema.description }),
      };
    default:
      // An untyped node. A grammar compiler rejects a schema with no type;
      // widening to STRING is what `toGeminiSchema` does, and the two
      // converters agreeing is worth more than either being clever.
      return { type: "string" };
  }
};

/**
 * `Qwen3-VL-Embedding-2B` wraps inputs in an instruction, and query and
 * document sides may differ. `EmbeddingTaskType` is Google's vocabulary and is
 * a pure no-op on Ollama — here it is not, because an instruction changes the
 * vector.
 *
 * **Both sides must stay consistent or retrieval silently degrades**: a query
 * embedded with one instruction against documents embedded with another is a
 * quality regression with no error anywhere. These strings are therefore part
 * of the stored vectors' identity — changing one means re-running
 * `regenerateVector` across every `halfvec` column, exactly as changing the
 * model does.
 */
const INSTRUCTIONS: Readonly<Record<EmbeddingTaskType, string>> = {
  RETRIEVAL_QUERY: "Represent this search query for retrieving relevant items.",
  RETRIEVAL_DOCUMENT: "Represent this item for retrieval.",
  SEMANTIC_SIMILARITY: "Represent the user's input.",
  CLASSIFICATION: "Represent the user's input for classification.",
  CLUSTERING: "Represent the user's input for clustering.",
  QUESTION_ANSWERING: "Represent this question for finding an answer.",
  FACT_VERIFICATION: "Represent this claim for verification.",
  CODE_RETRIEVAL_QUERY: "Represent this query for retrieving code.",
};

/** Trailing slashes off; add `/v1` unless the operator already did. */
export const normaliseBase = (endpoint: string): string => {
  const trimmed = endpoint.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export const createOpenAICompatibleProvider = (
  config: OpenAICompatibleConfig,
  fetchImpl: FetchLike,
): AIProvider => {
  const chatBase = normaliseBase(config.endpoint);
  const embedBase = normaliseBase(config.embeddingEndpoint);

  // Absent means "send no header" — a local server has no credential. The key
  // never reaches a URL, so it never reaches an error message or an access log.
  const headers: Readonly<Record<string, string>> =
    config.apiKey === null ? {} : { authorization: `Bearer ${config.apiKey}` };

  const call = async (
    url: string,
    body: unknown,
    what: string,
  ): Promise<unknown> =>
    await postJson({
      url,
      body,
      headers,
      timeoutMs: config.timeoutMs,
      provider: PROVIDER,
      what,
      fetchImpl,
    });

  const llamacpp = createLlamacppEmbedder(
    config,
    embedBase,
    headers,
    call,
    fetchImpl,
  );

  return {
    name: PROVIDER,

    getAvailableQualities: () => MODEL_QUALITIES,

    async generateContent(
      request: GenerateContentRequest,
      quality: ModelQuality = "medium",
    ): Promise<GenerateContentResponse> {
      const started = Date.now();
      const model = config.models[quality];

      const content: Record<string, unknown>[] = [
        { type: "text", text: request.prompt },
      ];
      // A `data:` URI carries a declared media type and the server decodes
      // according to it, so the type is read from the bytes and an
      // unidentifiable image raises rather than going up as a guessed JPEG.
      // `image-mime.ts` has the argument; note HEIC is refused here and
      // accepted on the Gemini path, which is deliberate.
      const images = request.images ?? [];
      for (const [index, image] of images.entries()) {
        const mime = requireImageMime(
          image,
          OPENAI_IMAGE_MIMES,
          `${PROVIDER} generateContent image ${index + 1} of ${images.length}`,
        );
        content.push({
          type: "image_url",
          image_url: {
            url: `data:${mime};base64,${Buffer.from(image).toString("base64")}`,
          },
        });
      }

      const raw = await withImageContext(images, () =>
        call(
          `${chatBase}/chat/completions`,
          {
            model,
            messages: [{ role: "user", content }],
            stream: false,
            ...(config.maxTokens === null
              ? {}
              : { max_tokens: config.maxTokens }),
            ...(request.schema === undefined
              ? {}
              : {
                  // The standard field. vLLM also accepts its own older
                  // `guided_json`; this one is what every other compatible
                  // server implements, so it is what keeps the provider generic.
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: "response",
                      strict: STRICT,
                      schema: toOpenAISchema(request.schema),
                    },
                  },
                }),
          },
          `generateContent(${model})`,
        ),
      );

      const tokens = usageTokens(raw);
      return {
        content: completionText(raw, model, chatBase),
        metadata: {
          model,
          provider: PROVIDER,
          processingTime: Date.now() - started,
          ...(tokens === undefined ? {} : { tokensUsed: tokens }),
          ...usageTokenSplit(raw),
        },
      };
    },

    async generateEmbeddings(
      request: EmbeddingRequest,
    ): Promise<EmbeddingResponse> {
      if (config.embeddingInput === "llamacpp-multimodal") {
        return await llamacpp.embed(request);
      }
      if (request.type === "image") {
        // OpenAI's `/v1/embeddings` has no image input at all, so no server
        // spoken to in this dialect can honour this. The same refusal the
        // other text-only providers give.
        throw new ConflictError(
          "the openai-compatible provider is wired for text embeddings only " +
            "under OPENAI_COMPAT_EMBEDDING_INPUT=openai (the default). Image " +
            "embedding needs llama.cpp's llama-server with " +
            "OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal, or " +
            "gemini-embedding-2 on google-ai / vertex-ai.",
        );
      }
      if ((request.images ?? []).length > 0) {
        // Refused, not dropped: the caller would store a text-only vector
        // under an identity that says images went in (`../vectors.ts`).
        throw new ConflictError(
          "the openai-compatible provider embeds text only under " +
            "OPENAI_COMPAT_EMBEDDING_INPUT=openai; images need " +
            "llamacpp-multimodal (llama-server) or gemini-embedding-2 " +
            "(google-ai, vertex-ai)",
        );
      }
      const model = request.model ?? config.embeddingModel;
      const wanted = request.dimensions ?? config.embeddingDimensions;
      const instruction =
        request.taskType === undefined
          ? undefined
          : INSTRUCTIONS[request.taskType];

      const raw = await call(
        `${embedBase}/embeddings`,
        {
          model,
          input:
            instruction === undefined
              ? request.content
              : `${instruction}\n${request.content}`,
          // A hint, not a guarantee: plenty of servers ignore it. The width is
          // verified below regardless, which is what actually holds the line.
          dimensions: wanted,
          // Explicit, because a server defaulting to base64 would otherwise
          // reach `requireVector` as a string and fail as a shape complaint.
          encoding_format: "float",
        },
        `generateEmbeddings(${model})`,
      );

      const received = firstEmbedding(raw, model, embedBase);
      return {
        embeddings: fitDimensions(received, wanted, model, embedBase, config),
        metadata: { model, dimensions: wanted, provider: PROVIDER },
      };
    },
  };
};

/**
 * `data[0].embedding` out of a `/v1/embeddings` answer, or a `ConflictError`
 * saying which of the three ways it was missing.
 */
const firstEmbedding = (
  raw: unknown,
  model: string,
  embedBase: string,
): number[] => {
  if (!isRecord(raw) || !Array.isArray(raw.data)) {
    throw new ConflictError(
      `${PROVIDER} /v1/embeddings at ${embedBase} returned no \`data\` ` +
        `array for model "${model}": ` +
        `${JSON.stringify(raw)?.slice(0, 300) ?? "undefined"}`,
    );
  }
  const [first] = raw.data;
  if (!isRecord(first)) {
    throw new ConflictError(
      `${PROVIDER} /v1/embeddings at ${embedBase} returned an empty ` +
        `\`data\` array for model "${model}"`,
    );
  }
  if (typeof first.embedding === "string") {
    throw new ConflictError(
      `${PROVIDER} /v1/embeddings at ${embedBase} returned a base64 ` +
        `embedding for model "${model}" despite encoding_format=float. ` +
        "This server does not honour the field; it cannot be used as an " +
        "embedding backend without one that does.",
    );
  }
  return requireVector(first.embedding, PROVIDER, "data[0].embedding");
};

/* -------------------------------------------------------------------------- */
/* llama.cpp's multimodal embedding dialect                                    */
/* -------------------------------------------------------------------------- */

/**
 * The version of the prompt {@link qwen3VLEmbeddingPrompt} builds. **Part of
 * every stored vector's identity** (`install.ts` `embeddingModelIdentity`):
 * a change to the template moves every vector exactly as a change of model
 * does, so bump this with it and the re-embed job treats the old rows as
 * stale. The same goes for any change to `INSTRUCTIONS` or
 * `DEFAULT_INSTRUCTION`, which the template carries verbatim.
 */
export const LLAMACPP_TEMPLATE_VERSION = "llamacpp-qwen3vl.v1";

/**
 * The image budget, in tokens, these vectors are made at — and also part of
 * their identity, because **resolution is identity**: the same photograph at
 * full resolution and at 576 tokens scored cosine 0.962 apart.
 *
 * It holds from both ends. The seams shrink every image to 768 px on its long
 * side before it gets here (`../image-downscale.ts`), and Qwen3-VL's vision
 * tower makes one token per 32 × 32 px (16 px patches, merged 2 × 2), so 768 ×
 * 768 is exactly 576. The server is started with `--image-max-tokens 576`
 * (`services/actors/README.md`), and `scripts/ai/local-model.sh verify` checks
 * that it was.
 */
export const LLAMACPP_IMAGE_MAX_TOKENS = 576;

/** `<template>-<image cap>`, the suffix `embeddingModelIdentity` writes. */
export const LLAMACPP_EMBEDDING_VARIANT = `${LLAMACPP_TEMPLATE_VERSION}-${LLAMACPP_IMAGE_MAX_TOKENS}`;

/**
 * The most images one embedding takes. The same cap as
 * `GEMINI_EMBEDDING_MAX_IMAGES`; items send at most three. Measured: text plus
 * six images took 5.8 s, well inside the 100 s `regenerateVector` timeout.
 */
export const LLAMACPP_MAX_IMAGES = 6;

/**
 * The floor `usage.prompt_tokens` must clear per image. A 768 px image is
 * hundreds of tokens (562 for one measured photo); a prompt in which the image
 * was **not** consumed — a field the server ignores, a marker it did not
 * recognise — counts only its text, under fifty. 64 sits far below the one and
 * above the other.
 */
export const LLAMACPP_MIN_TOKENS_PER_IMAGE = 64;

/** Qwen3-VL-Embedding's own default system message, for an untasked input. */
const DEFAULT_INSTRUCTION = "Represent the user's input.";

/**
 * Qwen3-VL-Embedding's chat template, as its reference `format_model_input`
 * renders it: the instruction as the system turn, then the images before the
 * text in one user turn, then an open assistant turn whose last token is
 * pooled (`--pooling last`).
 *
 * Each image is a **bare** media marker. llama.cpp's mtmd adds
 * `<|vision_start|>…<|vision_end|>` itself; writing them here too measured
 * cosine 0.974 against the reference instead of 0.998.
 *
 * Text is templated too, not only images. The seam's older `instruction\ntext`
 * still ranks, but its margin was 18% smaller (0.201 against 0.245) and its
 * vector sat at cosine 0.894 from the templated one.
 */
export const qwen3VLEmbeddingPrompt = (input: {
  readonly instruction: string;
  readonly content: string;
  readonly marker: string;
  readonly images: number;
}): string =>
  `<|im_start|>system\n${input.instruction}<|im_end|>\n` +
  `<|im_start|>user\n${input.marker.repeat(input.images)}${input.content}<|im_end|>\n` +
  "<|im_start|>assistant\n";

/** `http://h:8091/v1` → `http://h:8091`: `/props` is served at the root. */
export const serverRoot = (embedBase: string): string =>
  embedBase.replace(/\/v\d+$/, "");

/**
 * The stale-marker answer. Measured on b11433, a prompt whose markers do not
 * match its `multimodal_data` is a 500 reading `Failed to tokenize prompt`;
 * the server log, and other builds, say `number of media markers … does not
 * match`.
 */
const isMarkerMismatch = (error: unknown): boolean =>
  error instanceof ConflictError &&
  /failed to tokenize prompt|media marker/i.test(error.message);

/**
 * `{input: {prompt_string, multimodal_data}}` against llama.cpp's
 * `llama-server` serving Qwen3-VL-Embedding — the one local configuration that
 * puts text and images in one space, and fuses them into one vector the way
 * production's `gemini-embedding-2` item vectors are.
 *
 * Why a dialect and not just a base URL: OpenAI's `/v1/embeddings` has no way
 * to carry an image. llama-server takes its own object instead, in which each
 * image is a media marker in the prompt and a base64 entry in
 * `multimodal_data` — and the marker is **random per server start**, so it is
 * read from `GET /props`, cached, and read again when the server says the
 * markers do not match (a restart). `image_data`, the field the older
 * completion route used, is silently ignored here: the prompt is embedded as
 * text and a plausible vector comes back. The `usage.prompt_tokens` check
 * below is what turns that into an error.
 *
 * Three shapes, the same as `gemini-embedding-2`'s:
 *  - text only — the search phrase, an image-less item;
 *  - images only (`type: "image"`, exactly one image) — a search photo or one
 *    stored `item_image`, with Qwen's default instruction;
 *  - text plus up to six images — an item document.
 */
const createLlamacppEmbedder = (
  config: OpenAICompatibleConfig,
  embedBase: string,
  headers: Readonly<Record<string, string>>,
  call: (url: string, body: unknown, what: string) => Promise<unknown>,
  fetchImpl: FetchLike,
) => {
  const propsUrl = `${serverRoot(embedBase)}/props`;
  let marker: Promise<string> | null = null;

  const readMarker = async (): Promise<string> => {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(propsUrl, {
        method: "GET",
        headers: { ...headers },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      throw new ConflictError(
        `${PROVIDER} could not read llama-server's media marker at ${propsUrl}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ConflictError(
        `${PROVIDER} GET ${propsUrl} failed (${response.status}): ` +
          `${text.slice(0, 300)}. OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal ` +
          "needs llama.cpp's llama-server at OPENAI_COMPAT_EMBEDDING_ENDPOINT.",
      );
    }
    let props: unknown;
    try {
      props = JSON.parse(text);
    } catch {
      throw new ConflictError(
        `${PROVIDER} GET ${propsUrl} returned a body that is not JSON; is ` +
          "OPENAI_COMPAT_EMBEDDING_ENDPOINT really a llama-server?",
      );
    }
    if (isRecord(props) && isRecord(props.modalities)) {
      if (props.modalities.vision !== true) {
        throw new ConflictError(
          `the llama-server at ${propsUrl} has no vision tower loaded ` +
            "(modalities.vision is not true). Start it with the model's " +
            "mmproj file (`--mmproj`, or `-hf`, which fetches it).",
        );
      }
    }
    const found = isRecord(props) ? props.media_marker : undefined;
    if (typeof found !== "string" || found === "") {
      throw new ConflictError(
        `the llama-server at ${propsUrl} reports no media_marker, so it is ` +
          "older than this dialect expects (llama.cpp b11433 and later " +
          "publish one per start). Upgrade llama.cpp; see " +
          "services/actors/README.md.",
      );
    }
    return found;
  };

  /** Cached per provider; `refresh` re-reads it, once, after a restart. */
  const mediaMarker = (refresh = false): Promise<string> => {
    if (marker === null || refresh) {
      const next = readMarker();
      // A failed read is not cached: the next call asks again.
      next.catch(() => {
        if (marker === next) marker = null;
      });
      marker = next;
    }
    return marker;
  };

  const embed = async (
    request: EmbeddingRequest,
  ): Promise<EmbeddingResponse> => {
    const model = request.model ?? config.embeddingModel;
    const wanted = request.dimensions ?? config.embeddingDimensions;
    const images = request.images ?? [];

    if (request.type === "image" && images.length !== 1) {
      throw new ConflictError(
        `an image-only embedding takes exactly one image; ${images.length} ` +
          "were sent",
      );
    }
    if (images.length > LLAMACPP_MAX_IMAGES) {
      throw new ConflictError(
        `${PROVIDER} (llamacpp-multimodal) embeds at most ` +
          `${LLAMACPP_MAX_IMAGES} images per request; ${images.length} were sent`,
      );
    }
    const encoded = images.map((image, index) => {
      // Checked for the same reason the chat path checks: a byte string the
      // server cannot decode should fail here, naming which image it was.
      requireImageMime(
        image,
        OPENAI_IMAGE_MIMES,
        `${PROVIDER} embedding image ${index + 1} of ${images.length}`,
      );
      return Buffer.from(image).toString("base64");
    });

    const instruction =
      request.taskType === undefined
        ? DEFAULT_INSTRUCTION
        : INSTRUCTIONS[request.taskType];
    // An image-only request carries no text: a text part would make it a
    // document vector (`gemini.ts` makes the same point).
    const content = request.type === "image" ? "" : request.content;

    const send = async (currentMarker: string): Promise<unknown> =>
      await call(
        `${embedBase}/embeddings`,
        {
          model,
          input: {
            prompt_string: qwen3VLEmbeddingPrompt({
              instruction,
              content,
              marker: currentMarker,
              images: encoded.length,
            }),
            // Never `image_data`: silently ignored on this route.
            multimodal_data: encoded,
          },
          encoding_format: "float",
        },
        `generateEmbeddings(${model}, llamacpp-multimodal)`,
      );

    const raw = await withImageContext(images, async () => {
      // Text alone needs no marker, so it never waits on `/props`.
      if (encoded.length === 0) return await send("");
      let current = await mediaMarker();
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await send(current);
        } catch (error) {
          // The server restarted under us and drew a new marker: read it and
          // ask once more. A second mismatch, or a "fresh" marker that is the
          // same one, is a real failure and propagates.
          if (attempt > 1 || !isMarkerMismatch(error)) throw error;
          const fresh = await mediaMarker(true);
          if (fresh === current) throw error;
          current = fresh;
        }
      }
    });

    if (encoded.length > 0) {
      const consumed =
        isRecord(raw) && isRecord(raw.usage)
          ? raw.usage.prompt_tokens
          : undefined;
      const floor = encoded.length * LLAMACPP_MIN_TOKENS_PER_IMAGE;
      if (typeof consumed !== "number" || consumed < floor) {
        throw new ConflictError(
          `${PROVIDER} sent ${encoded.length} image(s) to ${embedBase} and the ` +
            `server reports ${typeof consumed === "number" ? `${consumed} prompt tokens` : "no usage.prompt_tokens"}, ` +
            `under the ${floor} that many images take at the very least. The ` +
            "images were not embedded, and the vector that came back is text " +
            "only; it is refused rather than stored as a multimodal one.",
        );
      }
    }

    const received = firstEmbedding(raw, model, embedBase);
    return {
      embeddings: fitDimensions(received, wanted, model, embedBase, config),
      metadata: { model, dimensions: wanted, provider: PROVIDER },
    };
  };

  return { embed };
};

/**
 * The width check — the thing standing between a local model and a silently
 * wrong `halfvec` column.
 *
 * Every vector column in this database is 768 wide, and the two paths this
 * decision sanctions do not agree natively: Vertex's `gemini-embedding-2`
 * emits 768 when asked (`outputDimensionality`), `Qwen3-VL-Embedding-2B` emits
 * **2048**. `EmbeddingActor` rechecks
 * the width too, but it can only say "wrong"; this can say which model, which
 * server and which of the two fixes.
 *
 * Too *narrow* is always fatal — there is no honest way to widen a vector.
 * Too *wide* is fatal unless the operator has asserted the model is Matryoshka,
 * in which case the slice is renormalised, which is the half a naive truncation
 * forgets.
 */
export const fitDimensions = (
  received: number[],
  wanted: number,
  model: string,
  endpoint: string,
  config: Pick<OpenAICompatibleConfig, "truncateEmbeddings">,
): number[] => {
  if (received.length === wanted) return received;

  if (received.length < wanted || !config.truncateEmbeddings) {
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} returned a ` +
        `${received.length}-dimension embedding, but every halfvec column in ` +
        `this database is ${wanted} wide. It was asked for ${wanted} via the ` +
        "`dimensions` field and did not honour it. Either serve a model that " +
        "emits " +
        `${wanted} — for vLLM, \`--override-pooler-config '{"dimensions":${wanted}}'\` ` +
        "— or, **only if this model is documented as Matryoshka**, set " +
        "OPENAI_COMPAT_EMBEDDING_TRUNCATE=true to truncate and renormalise. " +
        "Truncating a model that is not Matryoshka yields a unit-norm vector " +
        "that inserts happily and means nothing.",
    );
  }

  // Matryoshka: take the prefix, then restore unit norm. Skipping the
  // renormalisation leaves a short vector whose cosine distances are
  // systematically compressed — `findings/vllm-provider.md` §4.2.
  const sliced = received.slice(0, wanted);
  const norm = Math.sqrt(sliced.reduce((sum, x) => sum + x * x, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} returned a vector whose ` +
        `first ${wanted} components are all zero. Truncation cannot produce a ` +
        "usable vector from it, and a zero vector is distance 1.0 from " +
        "everything, so search would return an arbitrary ordering.",
    );
  }
  return sliced.map((x) => x / norm);
};

/**
 * `choices[0].message.content`.
 *
 * Three failures told apart, because a dead-lettered outbox row is where this
 * gets read: no choices at all (a refusal or a filter), a truncated completion
 * (`finish_reason: "length"` — with a schema in play the JSON is *definitively*
 * incomplete, and `parseModelJson` would otherwise report it as "not JSON"
 * several layers away from the cause), and an empty string.
 */
export const completionText = (
  raw: unknown,
  model: string,
  endpoint: string,
): string => {
  if (!isRecord(raw)) {
    throw new ConflictError(
      `${PROVIDER} at ${endpoint} returned a non-object response`,
    );
  }
  const choices = raw.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    const detail = isRecord(raw.error)
      ? JSON.stringify(raw.error).slice(0, 300)
      : "no `error` field either";
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} returned no choices ` +
        `(${detail}). This is a refusal or a server-side rejection, not an ` +
        "empty result.",
    );
  }
  const [choice] = choices;
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} returned a choice with no ` +
        `message (finish_reason: ${isRecord(choice) ? String(choice.finish_reason) : "unknown"})`,
    );
  }
  if (choice.finish_reason === "length") {
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} hit its token limit ` +
        "(finish_reason: length), so the completion is truncated and any " +
        "structured answer in it is incomplete JSON. Raise " +
        "OPENAI_COMPAT_MAX_TOKENS, or unset it to let the server use the " +
        "model's full context.",
    );
  }
  const content = choice.message.content;
  if (typeof content !== "string" || content === "") {
    throw new ConflictError(
      `${PROVIDER} model "${model}" at ${endpoint} returned an empty ` +
        `completion (finish_reason: ${String(choice.finish_reason)})`,
    );
  }
  return content;
};

/** `usage.total_tokens`, when the server sent one. */
export const usageTokens = (raw: unknown): number | undefined => {
  if (!isRecord(raw) || !isRecord(raw.usage)) return undefined;
  const total = raw.usage.total_tokens;
  return typeof total === "number" ? total : undefined;
};

/**
 * `usage.prompt_tokens` / `usage.completion_tokens` — the two halves a paid
 * OpenAI-compatible endpoint bills separately, and what X1c settles a usage
 * row against (`./budget.ts`). Absent fields are omitted rather than zeroed:
 * a local server that reports nothing should look like "not reported", not
 * like a call that generated no output.
 */
export const usageTokenSplit = (
  raw: unknown,
): { inputTokens?: number; outputTokens?: number } => {
  if (!isRecord(raw) || !isRecord(raw.usage)) return {};
  const prompt = raw.usage.prompt_tokens;
  const completion = raw.usage.completion_tokens;
  return {
    ...(typeof prompt === "number" ? { inputTokens: prompt } : {}),
    ...(typeof completion === "number" ? { outputTokens: completion } : {}),
  };
};
