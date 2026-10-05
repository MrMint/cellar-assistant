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
 *  - embeddings: `POST {embeddingEndpoint}/v1/embeddings`
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
      if (request.type === "image") {
        // Reachable only once `Embedder` widens past `{ text }`; see
        // `findings/vllm-provider.md` §8.6. Until then this is the same
        // refusal the other three providers give, and for the same reason:
        // nothing in this database stores an image vector yet.
        throw new ConflictError(
          "the openai-compatible provider is wired for text embeddings only. " +
            "Multimodal embedding needs `Embedder` widened past `{ text }` " +
            "and every stored vector re-embedded with the same model — see " +
            "docs/architecture/findings/vllm-provider.md §8.6.",
        );
      }
      if ((request.images ?? []).length > 0) {
        // Refused, not dropped: the caller would store a text-only vector
        // under an identity that says images went in (`../vectors.ts`).
        throw new ConflictError(
          "the openai-compatible provider embeds text only; only gemini-embedding-2 " +
            "(google-ai, vertex-ai) embeds images with it",
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

      const received = requireVector(
        first.embedding,
        PROVIDER,
        "data[0].embedding",
      );
      return {
        embeddings: fitDimensions(received, wanted, model, embedBase, config),
        metadata: { model, dimensions: wanted, provider: PROVIDER },
      };
    },
  };
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
