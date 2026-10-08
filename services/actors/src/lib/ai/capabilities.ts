/**
 * The process's {@link AiCapabilities}, decided once at boot (N07, D25).
 *
 * `installAI` is the only thing that knows which provider was installed and
 * what its embedding model accepts, so it records the answer here and
 * `UserActor.aiCapabilities` (behind `viewer.aiCapabilities`) and
 * `TierListActor` read it back. Same registry shape as every seam setter in
 * this directory: a module-local value with a loud default — here, "nothing",
 * which is what a process that never installs a provider can really do.
 */
import type { AiCapabilities } from "@cellar-assistant/contracts";
import { NO_AI_CAPABILITIES } from "@cellar-assistant/contracts";

let installed: AiCapabilities = NO_AI_CAPABILITIES;

export const setAiCapabilities = (next: AiCapabilities): void => {
  installed = next;
};

export const aiCapabilities = (): AiCapabilities => installed;

/**
 * What an installed provider can do. Every chat seam is a prompt plus images
 * against the same provider, and every provider here sends images to its
 * chat model, so they are all available once one is installed — D25 asks for
 * parity, and a local model reading a label slowly is still reading it. The
 * one real difference between providers is whether the *embedding* model
 * takes a photograph, which `embeddingModelIdentity` already decides.
 */
export const capabilitiesForInstalledProvider = (input: {
  readonly embeddingAcceptsImages: boolean;
}): AiCapabilities => ({
  semanticSearch: true,
  imageSearch: input.embeddingAcceptsImages,
  labelRead: true,
  menuScan: true,
  recipePhoto: true,
  tierListInsights: true,
  detailSuggestions: true,
});
