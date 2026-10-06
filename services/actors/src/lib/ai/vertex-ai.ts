/**
 * Vertex AI — `aiplatform.googleapis.com`, service-account OAuth.
 *
 * The production provider on the Nhost side, and the one this repository holds
 * no credentials for. Ported to the same contract as the other two and
 * unit-tested end to end against an injected transport with a throwaway RSA key
 * generated inside the test, so the signing path is exercised without any
 * secret existing anywhere in the tree.
 *
 * ## Why there is no `google-auth-library` here
 *
 * The only thing this needs from it is the two-legged service-account flow,
 * which is a signed JWT and one form POST (RFC 7523, and Google's own
 * "Using OAuth 2.0 for Server to Server Applications"). `node:crypto` signs
 * RS256 out of the box. See `http.ts` for the general argument.
 *
 * ## Locations
 *
 * Gemini 3 models are served from the `global` endpoint, which is why the Nhost
 * factory hardcoded `location: "global"` and why that is this port's default.
 * The embedding models differ by family, and `embeddingLocation` applies the
 * answer to the embedding call alone:
 *
 *  - `gemini-embedding-2` (the default) is served **only** at `global`, and
 *    only through `:embedContent` — `:predict` answers 404 for it in every
 *    region. Legacy pinned `us-central1`, but that was the `-preview`.
 *  - `text-embedding-*` is served only regionally through `:predict`, so a
 *    `global` location becomes `us-central1` for it.
 *
 * `VERTEX_AI_EMBEDDING_LOCATION` overrides either.
 */
import { createSign } from "node:crypto";
import { ConflictError } from "@cellar-assistant/contracts";
import type { ServiceAccountKey, VertexAIConfig } from "./config.ts";
import {
  geminiBody,
  geminiEmbeddingParts,
  geminiText,
  geminiTokenSplit,
  geminiTokens,
  isGeminiEmbedding2,
} from "./gemini.ts";
import {
  isRecord,
  postJson,
  redactUrl,
  requireVector,
  withImageContext,
} from "./http.ts";
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

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
/** Refresh this long before the token actually expires. */
const RENEW_MARGIN_MS = 60_000;

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

/** RFC 7523 §2.1: a self-signed assertion, exchanged for an access token. */
export const signAssertion = (
  key: ServiceAccountKey,
  nowSeconds: number,
): string => {
  const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: tokenUri,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  let signature: string;
  try {
    signature = signer.sign(key.private_key, "base64url");
  } catch (error) {
    throw new ConflictError(
      "the vertex-ai service-account key could not sign an assertion (is " +
        "`private_key` a complete PEM, with its newlines intact?): " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return `${signingInput}.${signature}`;
};

type CachedToken = { readonly token: string; readonly expiresAtMs: number };

export const createVertexAIProvider = (
  config: VertexAIConfig,
  fetchImpl: FetchLike,
  now: () => number = Date.now,
): AIProvider => {
  let cached: CachedToken | null = null;

  const accessToken = async (): Promise<string> => {
    const at = now();
    if (cached !== null && cached.expiresAtMs - RENEW_MARGIN_MS > at) {
      return cached.token;
    }
    const tokenUri = config.credentials.token_uri ?? DEFAULT_TOKEN_URI;
    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(config.credentials, Math.floor(at / 1000)),
    }).toString();

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      throw new ConflictError(
        `vertex-ai could not reach the token endpoint ${redactUrl(tokenUri)}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ConflictError(
        `vertex-ai token exchange failed (${response.status}): ` +
          text.slice(0, 500),
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new ConflictError(
        "vertex-ai token endpoint returned a body that is not JSON: " +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      !isRecord(parsed) ||
      typeof parsed.access_token !== "string" ||
      parsed.access_token === ""
    ) {
      throw new ConflictError(
        "vertex-ai token endpoint returned no access_token",
      );
    }
    const lifetime =
      typeof parsed.expires_in === "number" ? parsed.expires_in : 3600;
    cached = {
      token: parsed.access_token,
      expiresAtMs: at + lifetime * 1000,
    };
    return cached.token;
  };

  const host = (location: string): string =>
    location === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${location}-aiplatform.googleapis.com`;

  const modelUrl = (location: string, model: string, verb: string): string =>
    `${host(location)}/v1/projects/${encodeURIComponent(config.projectId)}` +
    `/locations/${encodeURIComponent(location)}/publishers/google/models/` +
    `${encodeURIComponent(model)}:${verb}`;

  const call = async (url: string, body: unknown, what: string) =>
    await postJson({
      url,
      body,
      headers: { authorization: `Bearer ${await accessToken()}` },
      timeoutMs: config.timeoutMs,
      provider: "vertex-ai",
      what,
      fetchImpl,
    });

  return {
    name: "vertex-ai",

    getAvailableQualities: () => MODEL_QUALITIES,

    async generateContent(
      request: GenerateContentRequest,
      quality: ModelQuality = "medium",
    ): Promise<GenerateContentResponse> {
      const started = Date.now();
      const model = config.models[quality];
      const raw = await withImageContext(request.images ?? [], () =>
        call(
          modelUrl(config.location, model, "generateContent"),
          geminiBody(request, "vertex-ai"),
          `generateContent(${model})`,
        ),
      );
      const tokens = geminiTokens(raw);
      return {
        content: geminiText(raw, "vertex-ai"),
        metadata: {
          model,
          provider: "vertex-ai",
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
          `the vertex-ai provider embeds an image alone only with ` +
            `gemini-embedding-2, not ${model}`,
        );
      }
      const dimensions = request.dimensions ?? config.embeddingDimensions;
      if (isGeminiEmbedding2(model)) {
        // `:embedContent`, the Gemini request shape, with the task in the text
        // and any images fused into the one vector (`gemini.ts`). `:predict`
        // answers 404 for this model in every region.
        const raw = await call(
          modelUrl(embeddingLocation(config, model), model, "embedContent"),
          {
            content: {
              role: "user",
              parts: geminiEmbeddingParts(request, model, "vertex-ai"),
            },
            outputDimensionality: dimensions,
          },
          `generateEmbeddings(${model})`,
        );
        if (!isRecord(raw) || !isRecord(raw.embedding)) {
          throw new ConflictError(
            "vertex-ai :embedContent returned no `embedding` object: " +
              `${JSON.stringify(raw)?.slice(0, 300) ?? "undefined"}`,
          );
        }
        const embeddings = requireVector(
          raw.embedding.values,
          "vertex-ai",
          "embedding.values",
        );
        return {
          embeddings,
          metadata: {
            model,
            dimensions: embeddings.length,
            provider: "vertex-ai",
          },
        };
      }
      if ((request.images ?? []).length > 0) {
        throw new ConflictError(
          `vertex-ai embedding model ${model} takes text only; only ` +
            "gemini-embedding-2 embeds images",
        );
      }
      const raw = await call(
        modelUrl(embeddingLocation(config, model), model, "predict"),
        {
          instances: [
            {
              content: request.content,
              ...(request.taskType === undefined
                ? {}
                : { task_type: request.taskType }),
            },
          ],
          parameters: { outputDimensionality: dimensions },
        },
        `generateEmbeddings(${model})`,
      );
      if (!isRecord(raw) || !Array.isArray(raw.predictions)) {
        throw new ConflictError(
          "vertex-ai :predict returned no `predictions`: " +
            `${JSON.stringify(raw)?.slice(0, 300) ?? "undefined"}`,
        );
      }
      const [prediction] = raw.predictions;
      if (!isRecord(prediction) || !isRecord(prediction.embeddings)) {
        throw new ConflictError(
          "vertex-ai :predict returned a prediction with no `embeddings`",
        );
      }
      const embeddings = requireVector(
        prediction.embeddings.values,
        "vertex-ai",
        "predictions[0].embeddings.values",
      );
      return {
        embeddings,
        metadata: {
          model,
          dimensions: embeddings.length,
          provider: "vertex-ai",
        },
      };
    },
  };
};

/**
 * Where an embedding call goes — see the module doc's "Locations".
 *
 * `VERTEX_AI_EMBEDDING_LOCATION` (`config.embeddingLocation`) wins when set:
 * it is an operator's statement about their project. Otherwise the model
 * decides. `gemini-embedding-2` is served **only** at `global` (every regional
 * endpoint answers 404 — measured by the `ax` and `weaviate` clients, and
 * unlike its `-preview`, which legacy pinned to `us-central1`); the older
 * `text-embedding-*` models only regionally, so `global` becomes
 * `us-central1` for them.
 */
export const embeddingLocation = (
  config: VertexAIConfig,
  model: string,
): string => {
  if (config.embeddingLocation !== null) return config.embeddingLocation;
  if (isGeminiEmbedding2(model)) return "global";
  return config.location === "global" ? "us-central1" : config.location;
};
