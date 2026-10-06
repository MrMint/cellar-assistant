/**
 * Google AI Studio — the Generative Language API, authenticated with an API key.
 *
 * The cheapest of the three to configure (one environment variable, no service
 * account), and the one this repository has no key for. Ported to the same
 * contract as the other two and unit-tested against an injected transport;
 * `no-silent-fallback.test.ts` proves that a missing `GOOGLE_AI_API_KEY` with
 * `AI_PROVIDER=google-ai` is a refusal to boot rather than a quiet demotion.
 *
 *  - content:    `POST /v1beta/models/{model}:generateContent`
 *  - embeddings: `POST /v1beta/models/{model}:embedContent` — text, plus up to
 *    six images for `gemini-embedding-2`, fused into one vector
 *
 * The key travels in the `x-goog-api-key` header, never in the query string:
 * a URL ends up in error messages, traces and access logs.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import type { GoogleAIConfig } from "./config.ts";
import {
  geminiBody,
  geminiEmbeddingParts,
  geminiText,
  geminiTokenSplit,
  geminiTokens,
  isGeminiEmbedding2,
} from "./gemini.ts";
import { isRecord, postJson, requireVector, withImageContext } from "./http.ts";
import type {
  AIProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  FetchLike,
  GenerateContentRequest,
  GenerateContentResponse,
  ModelQuality,
} from "./types.ts";
import { MODEL_QUALITIES } from "./types.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const createGoogleAIProvider = (
  config: GoogleAIConfig,
  fetchImpl: FetchLike,
): AIProvider => {
  const call = async (path: string, body: unknown, what: string) =>
    await postJson({
      url: `${BASE}${path}`,
      body,
      headers: { "x-goog-api-key": config.apiKey },
      timeoutMs: config.timeoutMs,
      provider: "google-ai",
      what,
      fetchImpl,
    });

  return {
    name: "google-ai",

    getAvailableQualities: () => MODEL_QUALITIES,

    async generateContent(
      request: GenerateContentRequest,
      quality: ModelQuality = "medium",
    ): Promise<GenerateContentResponse> {
      const started = Date.now();
      const model = config.models[quality];
      const raw = await withImageContext(request.images ?? [], () =>
        call(
          `/models/${encodeURIComponent(model)}:generateContent`,
          geminiBody(request, "google-ai"),
          `generateContent(${model})`,
        ),
      );
      const tokens = geminiTokens(raw);
      return {
        content: geminiText(raw, "google-ai"),
        metadata: {
          model,
          provider: "google-ai",
          processingTime: Date.now() - started,
          ...(tokens === undefined ? {} : { tokensUsed: tokens }),
          ...geminiTokenSplit(raw),
        },
      };
    },

    async generateEmbeddings(
      request: EmbeddingRequest,
    ): Promise<EmbeddingResponse> {
      const model = request.model ?? config.embeddingModel;
      // An image alone (G32) is `gemini-embedding-2` only; `geminiEmbeddingParts`
      // builds the image-only request, and this refuses every other model here.
      if (request.type === "image" && !isGeminiEmbedding2(model)) {
        throw new ConflictError(
          `the google-ai provider embeds an image alone only with ` +
            `gemini-embedding-2, not ${model}`,
        );
      }
      const dimensions = request.dimensions ?? config.embeddingDimensions;
      // `gemini-embedding-2` takes its task in the text, not as `taskType`
      // (`gemini.ts`), and is the one model here that takes images too.
      const instructed = isGeminiEmbedding2(model);
      const raw = await call(
        `/models/${encodeURIComponent(model)}:embedContent`,
        {
          model: `models/${model}`,
          content: {
            parts: geminiEmbeddingParts(request, model, "google-ai"),
          },
          ...(request.taskType === undefined || instructed
            ? {}
            : { taskType: request.taskType }),
          outputDimensionality: dimensions,
        },
        `generateEmbeddings(${model})`,
      );
      if (!isRecord(raw) || !isRecord(raw.embedding)) {
        throw new ConflictError(
          "google-ai embedContent returned no `embedding` object: " +
            `${JSON.stringify(raw)?.slice(0, 300) ?? "undefined"}`,
        );
      }
      const embeddings = requireVector(
        raw.embedding.values,
        "google-ai",
        "embedding.values",
      );
      return {
        embeddings,
        metadata: {
          model,
          dimensions: embeddings.length,
          provider: "google-ai",
        },
      };
    },
  };
};
