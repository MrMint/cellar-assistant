/**
 * What this deployment's AI can actually do — N07, D25.
 *
 * The UI used to find out by trying: tap "Photo", upload, wait, and read a
 * refusal that named an environment variable. D25 turns that around: the
 * actor host knows at boot which provider is installed and what its models
 * accept, so it says so up front and a client **hides what is genuinely
 * unavailable** instead of offering it and refusing.
 *
 * "Genuinely" is the point of D25's note — features should behave the same
 * whatever the provider. So a flag here is `false` only when the configured
 * provider cannot do the thing at all (no provider; a text-only embedding
 * model asked to embed a photograph), never as a way of steering people off
 * a slower local path. Everything a local model does, it reports as available.
 *
 * Process-wide, not per user: the same answer for every viewer of one
 * deployment. A per-user limit (`USER_CAP`) is a refusal with a `retryAt`,
 * not a missing capability.
 */
export type AiCapabilities = {
  /** Search by meaning — any embedding model (`EmbeddingActor.embed`). */
  readonly semanticSearch: boolean;
  /**
   * Search by photo — needs an embedding model that embeds images
   * (`gemini-embedding-2`, or llama-server's multimodal dialect). Without
   * one an image search is refused `IMAGE_SEARCH_UNAVAILABLE`.
   */
  readonly imageSearch: boolean;
  /** Reading a bottle's label into the add-item form (item onboarding). */
  readonly labelRead: boolean;
  /** Reading a photographed menu into lines (menu scans). */
  readonly menuScan: boolean;
  /** Reading a photographed recipe into a draft. */
  readonly recipePhoto: boolean;
  /** A tier list's generated insights. */
  readonly tierListInsights: boolean;
};

/** A process with no AI provider installed: nothing model-backed works. */
export const NO_AI_CAPABILITIES: AiCapabilities = Object.freeze({
  semanticSearch: false,
  imageSearch: false,
  labelRead: false,
  menuScan: false,
  recipePhoto: false,
  tierListInsights: false,
});
