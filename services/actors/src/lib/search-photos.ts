/**
 * G32 — discarding a search photo once the search has used it.
 *
 * A photo uploaded as `image-search` (`SEARCH_PHOTO_KIND`) is verified and
 * never attached: its whole use is one `itemSearch(imageFileId:)`. Left alone
 * it would sit in the bucket forever, because `MaintenanceActor`'s original
 * reap only took *unverified* files. So `ItemSearchActor` discards it as soon
 * as the photo's vector has been used, and `MaintenanceActor` reaps any left
 * over (a discard that failed, a search never run) after `SEARCH_PHOTO_TTL_MS`.
 *
 * The rule about *which* files may go lives in `FileActor.discardSearchPhoto`,
 * beside the table it guards: only an `image-search` file, only the caller's
 * own, only when nothing references it. This module is the sidecar hop to it,
 * injectable so the no-Dapr harness can substitute a recorder — the same
 * shape as `./embedding-client.ts`.
 *
 * The edge is search → `FileActor`, like the image loader's
 * `presignReadInternal` inside the same search turn; `FileActor` calls no
 * actor back, so the graph stays acyclic (§8.5).
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { FileActorDescriptor } from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

export type DiscardSearchPhoto = (ctx: Ctx, fileId: string) => Promise<void>;

export const daprDiscardSearchPhoto: DiscardSearchPhoto = async (
  ctx,
  fileId,
) => {
  await internal(ctx)(FileActorDescriptor, fileId).discardSearchPhoto();
};
