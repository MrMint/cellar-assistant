/**
 * What the two Google providers share: the Gemini request body.
 *
 * `google-ai` (the Generative Language API, API-key auth) and `vertex-ai`
 * (`aiplatform.googleapis.com`, OAuth) take the *same* `generateContent`
 * payload and differ only in host, auth and the embedding endpoint. On the
 * Nhost side these were two files with the schema converter duplicated between
 * them; here it is written once.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import { isRecord } from "./http.ts";
import { GEMINI_IMAGE_MIMES, requireImageMime } from "./image-mime.ts";
import type {
  EmbeddingRequest,
  EmbeddingTaskType,
  GenerateContentRequest,
  JsonSchema,
  ProviderName,
} from "./types.ts";

/**
 * JSON Schema draft-7 → Gemini's OpenAPI subset.
 *
 * Gemini requires **uppercase** type names and understands only
 * STRING/INTEGER/NUMBER/BOOLEAN/ARRAY/OBJECT. `propertyOrdering` is carried
 * through from the Nhost converter: it makes the model emit fields in a stable
 * order, which measurably improves structured extraction.
 */
export const toGeminiSchema = (schema: JsonSchema): Record<string, unknown> => {
  switch (schema.type) {
    case "object": {
      const properties: Record<string, unknown> = {};
      const ordering: string[] = [];
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        properties[key] = toGeminiSchema(value);
        ordering.push(key);
      }
      return {
        type: "OBJECT",
        properties,
        ...(ordering.length > 0 ? { propertyOrdering: ordering } : {}),
        ...(schema.required === undefined ? {} : { required: schema.required }),
        ...(schema.nullable === undefined ? {} : { nullable: schema.nullable }),
        ...(schema.description === undefined
          ? {}
          : { description: schema.description }),
      };
    }
    case "array":
      return {
        type: "ARRAY",
        items:
          schema.items === undefined
            ? { type: "STRING" }
            : toGeminiSchema(schema.items),
        ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }),
        ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }),
        ...(schema.nullable === undefined ? {} : { nullable: schema.nullable }),
      };
    case "integer":
    case "number":
    case "boolean":
    case "string":
      return {
        type: schema.type.toUpperCase(),
        ...(schema.enum === undefined ? {} : { enum: schema.enum }),
        ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
        ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
        ...(schema.nullable === undefined ? {} : { nullable: schema.nullable }),
        ...(schema.description === undefined
          ? {}
          : { description: schema.description }),
      };
    default:
      // An untyped node. Gemini rejects a schema with no type, and a silent
      // widening to STRING is what the Nhost converter did; keep that, because
      // the alternative is a 400 the caller cannot act on.
      return { type: "STRING" };
  }
};

/**
 * Images are inlined as base64, each labelled with the media type its **bytes**
 * say it is.
 *
 * This used to be a flat `const IMAGE_MIME = "image/jpeg"` applied to every
 * image. Gemini decodes according to `mime_type` rather than sniffing, and
 * `files.mime_type` is client-supplied and unvalidated, so a PNG or an iPhone
 * HEIC went up announced as JPEG. That is now the deployed path
 * (`docs/architecture/e4-decisions.md` §12), so it is detected rather than
 * assumed, and an unidentifiable or unsupported image raises rather than
 * shipping a guess — see `image-mime.ts`.
 */
export const geminiBody = (
  request: GenerateContentRequest,
  provider: ProviderName,
): Record<string, unknown> => {
  const parts: Record<string, unknown>[] = [{ text: request.prompt }];
  const images = request.images ?? [];
  for (const [index, image] of images.entries()) {
    parts.push({
      inline_data: {
        mime_type: requireImageMime(
          image,
          GEMINI_IMAGE_MIMES,
          `${provider} generateContent image ${index + 1} of ${images.length}`,
        ),
        data: Buffer.from(image).toString("base64"),
      },
    });
  }
  return {
    contents: [{ role: "user", parts }],
    ...(request.schema === undefined
      ? {}
      : {
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(request.schema),
          },
        }),
  };
};

/**
 * `candidates[0].content.parts[*].text`, concatenated.
 *
 * A response with no candidate is a *refusal* (safety block, recitation
 * filter), not a transport failure — and it must surface as an error with the
 * `finishReason` attached, because "the model declined" and "the model
 * answered nothing useful" need to be told apart in a dead-lettered job.
 */
export const geminiText = (raw: unknown, provider: ProviderName): string => {
  if (!isRecord(raw)) {
    throw new ConflictError(`${provider} returned a non-object response`);
  }
  const candidates = raw.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const feedback = isRecord(raw.promptFeedback)
      ? JSON.stringify(raw.promptFeedback)
      : "no promptFeedback";
    throw new ConflictError(
      `${provider} returned no candidates (${feedback}). This is a refusal or ` +
        "a safety block, not an empty result.",
    );
  }
  const [candidate] = candidates;
  if (!isRecord(candidate) || !isRecord(candidate.content)) {
    throw new ConflictError(
      `${provider} returned a candidate with no content ` +
        `(finishReason: ${isRecord(candidate) ? String(candidate.finishReason) : "unknown"})`,
    );
  }
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) {
    throw new ConflictError(`${provider} returned a candidate with no parts`);
  }
  const text = parts
    .map((part) =>
      isRecord(part) && typeof part.text === "string" ? part.text : "",
    )
    .join("");
  if (text === "") {
    throw new ConflictError(
      `${provider} returned an empty completion ` +
        `(finishReason: ${String(candidate.finishReason)})`,
    );
  }
  return text;
};

/** `usageMetadata.totalTokenCount`, when the API sent one. */
export const geminiTokens = (raw: unknown): number | undefined => {
  if (!isRecord(raw) || !isRecord(raw.usageMetadata)) return undefined;
  const total = raw.usageMetadata.totalTokenCount;
  return typeof total === "number" ? total : undefined;
};

/**
 * `usageMetadata`, split into the two sides the call is actually billed on —
 * they are priced roughly eight-fold apart on this family, so the total alone
 * cannot settle a usage row (X1c; see `./budget.ts`).
 *
 * ## Output is candidates **plus thoughts**
 *
 * `candidatesTokenCount` is only the visible answer. A thinking model also
 * reports `thoughtsTokenCount` — the reasoning it generated before answering —
 * and Google bills those as output: the paid-tier rows for `gemini-2.5-pro`
 * and `gemini-2.5-flash` are headed "Output price (including thinking tokens)"
 * (https://ai.google.dev/gemini-api/docs/pricing, read 2026-09-27), and
 * `totalTokenCount` is documented as the sum of prompt, candidates, thoughts
 * and tool-use prompt tokens (https://ai.google.dev/api/generate-content,
 * `UsageMetadata`). This used to read candidates alone, so every settlement on
 * the default models — 2.5-pro on the `high` vision seams, where thinking
 * cannot be turned off and no `thinkingConfig` is sent — booked the answer and
 * dropped the reasoning, which is routinely the larger of the two.
 *
 * `toolUsePromptTokenCount` is added to the input side for the same reason; no
 * seam sends tools today, so it is absent in practice.
 *
 * A zero count is omitted from the JSON rather than sent (proto3), so an
 * absent `thoughtsTokenCount` is a non-thinking call and counts as 0. An
 * absent `promptTokenCount` or `candidatesTokenCount` still comes back as
 * "not reported" rather than as zero: recording it as zero would quietly book
 * the cheaper answer, and `measuredTokens` then falls back to the total.
 */
export const geminiTokenSplit = (
  raw: unknown,
): { inputTokens?: number; outputTokens?: number } => {
  if (!isRecord(raw) || !isRecord(raw.usageMetadata)) return {};
  const usage = raw.usageMetadata;
  const count = (value: unknown): number =>
    typeof value === "number" ? value : 0;
  const prompt = usage.promptTokenCount;
  const candidates = usage.candidatesTokenCount;
  return {
    ...(typeof prompt === "number"
      ? { inputTokens: prompt + count(usage.toolUsePromptTokenCount) }
      : {}),
    ...(typeof candidates === "number"
      ? { outputTokens: candidates + count(usage.thoughtsTokenCount) }
      : {}),
  };
};

/* -------------------------------------------------------------------------- */
/* Embeddings: gemini-embedding-2                                              */
/* -------------------------------------------------------------------------- */

/**
 * `gemini-embedding-2` (GA 2026-04-22) and its `-preview`, which legacy
 * production embedded with. The one family here that is multimodal, and the
 * one that takes **no `task_type`**: Google's embeddings guide says "You cannot
 * use the task_type field for the gemini-embedding-2 model" and puts the task
 * in the text instead ({@link geminiEmbedding2Text}). On Vertex it is served
 * only at `locations/global`, through `:embedContent` — never `:predict`
 * (`vertex-ai.ts`).
 */
export const isGeminiEmbedding2 = (model: string): boolean =>
  /^(?:models\/)?gemini-embedding-2(?:$|-)/.test(model);

/** Google: "Maximum of 6 images per request" for `gemini-embedding-2`. */
export const GEMINI_EMBEDDING_MAX_IMAGES = 6;

/**
 * The task instruction `gemini-embedding-2` wants in place of `task_type`,
 * verbatim from Google's embeddings guide
 * (ai.google.dev/gemini-api/docs/embeddings, "task instructions"). A document
 * with no title is written `title: none`, which is what every stored item and
 * recipe here is: the name already leads the embedding text.
 *
 * Changing any of these strings moves every stored document vector, like
 * changing the model: see `embeddings.ts` ("A stored vector's identity").
 */
const GEMINI_EMBEDDING_2_TASKS: Readonly<
  Record<EmbeddingTaskType, (content: string) => string>
> = {
  RETRIEVAL_QUERY: (c) => `task: search result | query: ${c}`,
  RETRIEVAL_DOCUMENT: (c) => `title: none | text: ${c}`,
  QUESTION_ANSWERING: (c) => `task: question answering | query: ${c}`,
  FACT_VERIFICATION: (c) => `task: fact checking | query: ${c}`,
  CODE_RETRIEVAL_QUERY: (c) => `task: code retrieval | query: ${c}`,
  CLASSIFICATION: (c) => `task: classification | query: ${c}`,
  CLUSTERING: (c) => `task: clustering | query: ${c}`,
  SEMANTIC_SIMILARITY: (c) => `task: sentence similarity | query: ${c}`,
};

/** The text a `gemini-embedding-2` request carries: the task, then the content. */
export const geminiEmbedding2Text = (request: EmbeddingRequest): string =>
  request.taskType === undefined
    ? request.content
    : GEMINI_EMBEDDING_2_TASKS[request.taskType](request.content);

/**
 * `content.parts` for one `:embedContent` call: the text, then each image
 * inlined with the media type its bytes say it is (as {@link geminiBody}
 * does). Google fuses every part into **one** vector — legacy production's
 * text-plus-labels item embedding (`generateItemVector`, `82450ad1`).
 *
 * Images are refused for any other model rather than dropped: a caller that
 * asked for a multimodal vector and got a text-only one would store it under
 * an identity that says otherwise.
 */
export const geminiEmbeddingParts = (
  request: EmbeddingRequest,
  model: string,
  provider: ProviderName,
): Record<string, unknown>[] => {
  const images = request.images ?? [];
  const multimodal = isGeminiEmbedding2(model);
  if (images.length > 0 && !multimodal) {
    throw new ConflictError(
      `${provider} embedding model ${model} takes text only; ${images.length} ` +
        "image(s) were sent. Only gemini-embedding-2 embeds images.",
    );
  }
  if (images.length > GEMINI_EMBEDDING_MAX_IMAGES) {
    throw new ConflictError(
      `${model} embeds at most ${GEMINI_EMBEDDING_MAX_IMAGES} images per ` +
        `request; ${images.length} were sent`,
    );
  }
  const parts: Record<string, unknown>[] = [
    { text: multimodal ? geminiEmbedding2Text(request) : request.content },
  ];
  for (const [index, image] of images.entries()) {
    parts.push({
      inline_data: {
        mime_type: requireImageMime(
          image,
          GEMINI_IMAGE_MIMES,
          `${provider} embedding image ${index + 1} of ${images.length}`,
        ),
        data: Buffer.from(image).toString("base64"),
      },
    });
  }
  return parts;
};
