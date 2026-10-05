/**
 * The AI provider contract — X1's port of `functions/_utils/ai-providers/types.ts`.
 *
 * The shape is deliberately unchanged from the Nhost side, because five
 * workstreams (B2, B7, B8, C1, C4) each left a seam sized to fit it and the
 * contract is proven: two methods, `generateContent` for structured output and
 * `generateEmbeddings` for a vector, with three quality tiers mapping to three
 * models.
 *
 * ## What changed in the port, and why
 *
 *  - **`generateEmbeddings` is no longer optional.** It was `generateEmbeddings?`
 *    on the Nhost side, so every call site had to test for it — and a provider
 *    that simply lacked the method looked, at the call site, exactly like a
 *    provider that was never configured. All three implementations have always
 *    had it; making it required turns "this provider cannot embed" into a
 *    compile error instead of a runtime `undefined`.
 *  - **`Buffer` is `Uint8Array` here.** Nothing in this port needs Node's
 *    Buffer API, and the narrower type is what `fetch`'s `arrayBuffer()` gives.
 *  - **`ItemType` is gone.** It was in the provider's type module but named a
 *    domain concept; `@cellar-assistant/contracts` owns that word now.
 *
 * The JSON-Schema type is defined here rather than pulled from
 * `@types/json-schema` (a dependency of `functions/`, not of this app): the
 * providers only ever traverse `type` / `properties` / `items` / `required` /
 * `enum` / `description` / `nullable`, so a structural type covers it without
 * adding a package to an app that runs straight off the source with no build.
 */

import type { Ctx } from "@cellar-assistant/contracts";

/** `low` and `medium` share a model on most providers; `high` is the slow one. */
export type ModelQuality = "low" | "medium" | "high";

export const MODEL_QUALITIES = ["low", "medium", "high"] as const;

export const isModelQuality = (value: string): value is ModelQuality =>
  (MODEL_QUALITIES as readonly string[]).includes(value);

/**
 * Vertex/Google embedding task types. Verbatim from the Nhost port — the
 * strings are Google's own, so they cannot be renamed.
 *
 * `EmbeddingActor.embed` asks for `RETRIEVAL_QUERY` (a search phrase);
 * `EmbeddingActor.embedDocument` — what `ItemActor` and `RecipeActor`
 * `regenerateVector` reach — for `RETRIEVAL_DOCUMENT`, as legacy production
 * did. Ollama ignores the field; `openai-compatible` and `gemini-embedding-2`
 * turn it into an instruction in the text (`openai-compatible.ts`'
 * `INSTRUCTIONS`, `gemini.ts`' `geminiEmbedding2Text`).
 */
export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CODE_RETRIEVAL_QUERY";

/** The subset of JSON Schema draft-7 the providers actually translate. */
export type JsonSchema = {
  readonly type?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number)[];
  readonly nullable?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
};

export type GenerateContentRequest = {
  readonly prompt: string;
  /** Raw image bytes. Base64-encoded by whichever provider is in play. */
  readonly images?: readonly Uint8Array[];
  /** When set, the provider is asked for JSON matching this shape. */
  readonly schema?: JsonSchema;
};

export type GenerateContentResponse = {
  readonly content: string;
  readonly metadata: {
    readonly model: string;
    readonly provider: ProviderName;
    readonly processingTime: number;
    readonly tokensUsed?: number;
    /**
     * The two sides of `tokensUsed`, when the provider reports them
     * separately — which the three that can be paid all do (`openai-compatible`
     * is paid when it points at a hosted API; see `./billing.ts`).
     *
     * `tokensUsed` alone is not enough to price a call: input and output are
     * billed at different rates, roughly eight-fold apart on the Gemini
     * family, so a total charged at either rate is wrong by most of the bill.
     * `./budget.ts` settles a usage row against these and falls back to
     * splitting the total only when a provider gives nothing better.
     *
     * `outputTokens` is everything billed at the output rate, which includes
     * a thinking model's reasoning: Gemini reports it separately as
     * `thoughtsTokenCount` and `geminiTokenSplit` adds it in; OpenAI's
     * `completion_tokens` already includes `reasoning_tokens`.
     */
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
};

export type EmbeddingRequest = {
  readonly content: string;
  /** Only `"text"` is reachable today; `"image"` is rejected per provider. */
  readonly type: "text" | "image";
  readonly model?: string;
  readonly dimensions?: number;
  readonly taskType?: EmbeddingTaskType;
  /**
   * Raw image bytes embedded *with* `content` into one vector. Only
   * `gemini-embedding-2` takes them (at most six); every other model refuses a
   * request that carries any, rather than silently embedding the text alone.
   */
  readonly images?: readonly Uint8Array[];
};

export type EmbeddingResponse = {
  readonly embeddings: number[];
  readonly metadata: {
    readonly model: string;
    readonly dimensions: number;
    readonly provider: ProviderName;
  };
};

/**
 * `openai-compatible` is named for a **wire format, not a product.** vLLM,
 * llama.cpp's `llama-server`, LM Studio, an MLX-backed shim and Ollama's own
 * `/v1` route all serve `POST /v1/chat/completions` and `POST /v1/embeddings`,
 * so all of them reach this one provider with a base-URL and model change and
 * no code change at all. That is deliberate: the sanctioned local runtime is
 * vLLM (`docs/architecture/e4-decisions.md` §12), vLLM has **no Metal
 * backend** and runs CPU-only on Apple silicon, and the measurement behind
 * that caveat (`docs/architecture/findings/vllm-provider.md` §6) is bad enough
 * that the decision may well be revised. Naming the provider after the
 * interface makes revising it a one-line environment edit.
 */
export type ProviderName =
  | "ollama"
  | "google-ai"
  | "vertex-ai"
  | "openai-compatible";

export const PROVIDER_NAMES = [
  "ollama",
  "google-ai",
  "vertex-ai",
  "openai-compatible",
] as const satisfies readonly ProviderName[];

export const isProviderName = (value: string): value is ProviderName =>
  (PROVIDER_NAMES as readonly string[]).includes(value);

export type AIProvider = {
  readonly name: ProviderName;
  generateContent(
    request: GenerateContentRequest,
    quality?: ModelQuality,
  ): Promise<GenerateContentResponse>;
  generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  getAvailableQualities(): readonly ModelQuality[];
};

/**
 * A provider bound to one caller's `Ctx` — what every seam in `./seams.ts`
 * holds, in place of an `AIProvider`.
 *
 * X1c: spending has to be attributed and authorised, and both of those live on
 * the ctx, which `AIProvider`'s two methods have nowhere to carry. Rather than
 * thread a ctx through the provider interface — which would put it on the wire
 * shape of four transports that have no business knowing about viewers — the
 * ctx is bound one level up: `meteredProviderFor` in `./budget.ts` returns one
 * of these, and a seam writes `provider(ctx).generateContent(…)`.
 *
 * It is also what makes metering unforgeable by omission. A seam cannot reach
 * a raw `AIProvider` at all, because this is the only thing `installSeams`
 * hands it, so a new seam that forgets to charge does not compile rather than
 * running free.
 */
export type ProviderFor = (ctx: Ctx) => AIProvider;

/**
 * Injected so a test can drive a provider without a network, and so the
 * no-silent-fallback suite can prove that a transport failure *propagates*
 * rather than turning into a canned answer.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;
