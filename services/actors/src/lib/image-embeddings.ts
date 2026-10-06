/**
 * G32 — the image-embedding seam: one photograph, embedded on its own, into
 * the space the stored item vectors live in.
 *
 * Two slots, one implementation. `query` is a person's search photo and
 * `document` is a stored `item_image` being indexed; the model call is the
 * same (`gemini-embedding-2` takes no task for an image-only input), and the
 * two are separate only so each is charged to its own budget seam —
 * `ai_model/image_search`, with a per-user cap a person meets, and
 * `ai_model/image_embedding`, which the attach path and the backfill spend.
 * A backfill that ran a month's allowance dry must not take search down with
 * it, and a person photographing shelves must not stall the indexing.
 *
 * Like every seam here, the default throws (`installAI()` replaces it only
 * when a provider is configured) — and it throws with the branchable reason
 * `IMAGE_SEARCH_UNAVAILABLE`, which is also what the installed implementation
 * throws when the configured embedding model cannot take an image (Ollama's
 * `nomic-embed-text`, the per-worktree lane's default). The client turns that
 * reason into "photo search isn't available"; it never parses the message.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";

export type ImageEmbedder = (
  ctx: Ctx,
  input: { readonly fileId: string },
) => Promise<readonly number[]>;

export type ImageEmbeddingPurpose = "query" | "document";

export const unconfiguredImageEmbedder: ImageEmbedder = async () => {
  throw new ConflictError(
    "no AI provider is configured to embed a photograph: AI_PROVIDER is " +
      "unset, so `installAI()` installed nothing at boot. Image search needs " +
      "`gemini-embedding-2` on AI_PROVIDER=vertex-ai or google-ai; Ollama's " +
      "embedding models are text only. See services/actors/README.md · Local AI.",
    "IMAGE_SEARCH_UNAVAILABLE",
  );
};

/*
 * Two plain slots rather than one keyed by purpose: `services/api`'s
 * `model-backed-fields.test.ts` finds every seam by reading a setter that
 * assigns a variable and the getter beside it that returns it, and that is
 * the shape it can follow.
 */
let queryEmbedder: ImageEmbedder = unconfiguredImageEmbedder;
let documentEmbedder: ImageEmbedder = unconfiguredImageEmbedder;

/** `ai_model/image_search`: a person's search photo. */
export const setQueryImageEmbedder = (next: ImageEmbedder): void => {
  queryEmbedder = next;
};

export const queryImageEmbedder = (): ImageEmbedder => queryEmbedder;

/** `ai_model/image_embedding`: a stored `item_image` being indexed. */
export const setDocumentImageEmbedder = (next: ImageEmbedder): void => {
  documentEmbedder = next;
};

export const documentImageEmbedder = (): ImageEmbedder => documentEmbedder;
