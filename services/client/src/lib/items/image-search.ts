import type { Client } from "urql";
import { uploadFile } from "@/lib/api/files";
import type { ApiFailure } from "@/lib/api/result";
import { dataUrlToFile } from "@/lib/items/data-url";

/**
 * G32 — the client half of image search, shared by the `/search` Photo button
 * and the onboarding wizard's display-photo match.
 *
 * Legacy posted the capture's base64 data URL to a server action that asked
 * `create_search_vector(image:)` for a vector and then `image_search` for
 * rows (`82450ad1:src/app/(authenticated)/search/actions.ts` 193-247,
 * `OnboardingWizard/actors/searchByImage.ts`). Now the photo goes up the same
 * presigned path every other image takes and `itemSearch(imageFileId:)` does
 * the rest server-side: no base64 in GraphQL, no vector in the browser.
 */

/** Legacy's `image_search(… limit: 10)`. */
export const IMAGE_SEARCH_LIMIT = 10;

/**
 * Upload a camera capture as an `image-search` file and verify it — the
 * server reads it only once `FileActor.verify` has seen the bytes land.
 * Throws when the capture is not a usable image.
 */
export const uploadSearchPhoto = async (
  client: Client,
  dataUrl: string,
): Promise<string> => {
  const file = dataUrlToFile(dataUrl, "search-photo.jpg");
  if (file === null) {
    throw new Error("The photo could not be read. Try taking it again.");
  }
  return uploadFile(client, file, "image-search", { verify: true });
};

/**
 * The deployment cannot embed a photo — `AI_PROVIDER` unset, or a text-only
 * embedding model such as the local lane's Ollama. Not a failure of this
 * search: the page says photo search is not available rather than "no items".
 */
export const isImageSearchUnavailable = (error: ApiFailure): boolean =>
  error.reason === "IMAGE_SEARCH_UNAVAILABLE";
