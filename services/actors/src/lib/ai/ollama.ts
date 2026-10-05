/**
 * Ollama — the local default (X1).
 *
 * It is the only one of the three providers that runs with **no credentials**,
 * which is why it is what `infra/.env.example` selects and what this
 * repository's own acceptance runs against. Two endpoints:
 *
 *  - `POST /api/embeddings` `{model, prompt}` → `{embedding: number[]}`
 *  - `POST /api/chat` `{model, messages, format, stream:false}` →
 *    `{message:{content}}`, where `format` is a JSON Schema object and Ollama
 *    constrains the sampler to it (the same field the Nhost provider passed).
 *
 * `nomic-embed-text` is the default embedding model because it is **768**
 * dimensions — exactly the width of every `halfvec` column in this database,
 * so a locally-embedded vector is directly comparable with the rows already
 * there. `gemma3:4b` is the default chat model because it is multimodal, so the
 * three vision seams (item defaults, menu extraction, recipe photos) work
 * against the same pull.
 *
 * ## Two things the Nhost provider did that are deliberately not ported
 *
 *  - **`ensureModelAvailable`.** The old provider listed models and, on a miss,
 *    called `client.pull()` inline. That is a multi-gigabyte download inside
 *    what may be an actor's turn — §8.5's whole concern — and it happens on the
 *    *first user request* after a deploy, invisibly. Here a missing model is an
 *    error that names the exact `ollama pull` to run.
 *  - **Logging the prompt.** It `console.log`ed the full prompt and the full
 *    response on every call. Menu photos and recipe notes are user content.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import type { OllamaConfig } from "./config.ts";
import {
  isRecord,
  postJson,
  requireString,
  requireVector,
  withImageContext,
} from "./http.ts";
import { OLLAMA_IMAGE_MIMES, requireImageMime } from "./image-mime.ts";
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

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

export const createOllamaProvider = (
  config: OllamaConfig,
  fetchImpl: FetchLike,
): AIProvider => {
  const base = config.endpoint.replace(/\/+$/, "");

  const call = async (
    path: string,
    body: unknown,
    what: string,
    model: string,
  ): Promise<unknown> => {
    const raw = await postJson({
      url: `${base}${path}`,
      body,
      timeoutMs: config.timeoutMs,
      provider: "ollama",
      what,
      fetchImpl,
    });
    // Ollama answers an un-pulled model with `{"error": "model … not found"}`,
    // sometimes under a 200. Surfaced here rather than as a shape complaint,
    // because the fix is a one-line `ollama pull` and the caller should be
    // told which one.
    if (isRecord(raw) && typeof raw.error === "string") {
      throw missingModel(raw.error, model, base);
    }
    return raw;
  };

  return {
    name: "ollama",

    getAvailableQualities: () => MODEL_QUALITIES,

    async generateContent(
      request: GenerateContentRequest,
      quality: ModelQuality = "medium",
    ): Promise<GenerateContentResponse> {
      const started = Date.now();
      const model = config.models[quality];
      const images = request.images ?? [];

      // The bytes are checked before they are sent, the same way `gemini.ts`
      // and `openai-compatible.ts` check theirs. This provider was the one
      // that did not, and its whole failure surface for a bad image was a
      // 400 reading `Failed to load image or audio file` — a sentence that
      // names neither the image nor the reason, and reads identically for an
      // HEIC, a TIFF, a downloaded error page and a corrupt PNG.
      //
      // Unlike the other two this does not feed a media type into the
      // request: Ollama's `/api/chat` takes bare base64 and sniffs it itself,
      // so nothing here is *labelled*. The call is purely a refusal, which is
      // why it is a statement rather than an assignment.
      for (const [index, image] of images.entries()) {
        requireImageMime(
          image,
          OLLAMA_IMAGE_MIMES,
          `ollama generateContent image ${index + 1} of ${images.length}`,
        );
      }

      const raw = await withImageContext(images, () =>
        call(
          "/api/chat",
          {
            model,
            stream: false,
            messages: [
              {
                role: "user",
                content: request.prompt,
                ...(images.length > 0 ? { images: images.map(toBase64) } : {}),
              },
            ],
            // Ollama takes the JSON Schema object verbatim and constrains
            // decoding to it — the same contract the Nhost provider used.
            ...(request.schema === undefined ? {} : { format: request.schema }),
          },
          `generateContent(${model})`,
          model,
        ),
      );

      if (!isRecord(raw) || !isRecord(raw.message)) {
        throw unexpectedBody(raw, model, base);
      }
      return {
        content: requireString(
          raw.message.content,
          "ollama",
          "message.content",
        ),
        metadata: {
          model,
          provider: "ollama",
          processingTime: Date.now() - started,
        },
      };
    },

    async generateEmbeddings(
      request: EmbeddingRequest,
    ): Promise<EmbeddingResponse> {
      if (request.type === "image") {
        throw new ConflictError(
          "the ollama provider has no image-embedding endpoint. Every vector " +
            "column in this database is a text embedding; nothing calls this " +
            'with type "image".',
        );
      }
      if ((request.images ?? []).length > 0) {
        // Refused, not dropped: the caller would store a text-only vector
        // under an identity that says images went in (`../vectors.ts`).
        throw new ConflictError(
          "the ollama provider embeds text only; only gemini-embedding-2 " +
            "(google-ai, vertex-ai) embeds images with it",
        );
      }
      const model = request.model ?? config.embeddingModel;
      const raw = await call(
        "/api/embeddings",
        { model, prompt: request.content },
        `generateEmbeddings(${model})`,
        model,
      );
      if (!isRecord(raw)) throw unexpectedBody(raw, model, base);

      const embeddings = requireVector(raw.embedding, "ollama", "embedding");
      return {
        embeddings,
        metadata: {
          model,
          dimensions: embeddings.length,
          provider: "ollama",
        },
      };
    },
  };
};

/** The daemon said no. Nine times out of ten the model is simply not pulled. */
const missingModel = (
  message: string,
  model: string,
  endpoint: string,
): ConflictError =>
  new ConflictError(
    `ollama at ${endpoint} refused model "${model}": ${message.slice(0, 300)}. ` +
      `If the model is not pulled, run: ollama pull ${model}`,
  );

/** A 200 whose body is not what the endpoint documents — a proxy, usually. */
const unexpectedBody = (
  raw: unknown,
  model: string,
  endpoint: string,
): ConflictError =>
  new ConflictError(
    `ollama at ${endpoint} answered with an unexpected body for model ` +
      `"${model}": ${JSON.stringify(raw)?.slice(0, 300) ?? "undefined"}. ` +
      `If the model is not pulled, run: ollama pull ${model}`,
  );
