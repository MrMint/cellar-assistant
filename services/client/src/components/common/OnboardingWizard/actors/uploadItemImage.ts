import { isNil } from "ramda";
import type { Client } from "urql";
import { fromPromise } from "xstate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { UploadRejectedError, uploadFile } from "@/lib/api/files";
import { readFragment } from "@/lib/api/graphql";
import { AttachItemImageMutation, ItemImageFragment } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { dataUrlToFile } from "@/lib/items/data-url";
import type { UploadItemImageInput, UploadItemImageResult } from "./types";

/** The display photo's file: the one already uploaded, else a fresh upload. */
const displayFileId = async (
  urqlClient: Client,
  displayImage: string | undefined,
  uploaded: string | undefined,
): Promise<string | undefined> => {
  if (uploaded !== undefined) return uploaded;
  if (isNil(displayImage)) return undefined;
  const file = dataUrlToFile(displayImage, "display.jpg");
  if (file === null) return undefined;
  try {
    return await uploadFile(urqlClient, file, "item-image");
  } catch (cause) {
    if (cause instanceof UploadRejectedError) {
      throw new Error(`Image upload failed: ${cause.failure.message}`);
    }
    throw cause;
  }
};

/**
 * Attach a display photo to the item as a public image —
 * `item_image_upload(image: base64)` as it is now: presigned PUT, then
 * `attachItemImage`, which verifies the file before writing the row. A photo
 * already uploaded (`uploadedFileId`: the front label, N21) is attached as it
 * is — the label is the display photo, so its bytes go up once (X06).
 * `undefined` when there was no photo; throws with the API's message on a
 * refusal.
 */
export const attachDisplayImage = async (
  urqlClient: Client,
  itemId: string,
  itemType: ApiItemType,
  displayImage: string | undefined,
  uploadedFileId?: string,
): Promise<string | undefined> => {
  const fileId = await displayFileId(urqlClient, displayImage, uploadedFileId);
  if (fileId === undefined) return undefined;
  const response = await urqlClient
    .mutation(AttachItemImageMutation, {
      itemId,
      type: itemType,
      input: { fileId, isPublic: true },
    })
    .toPromise();
  const attached = unwrapResult(response.data?.attachItemImage, "ItemImage");
  if (!attached.ok) {
    throw new Error(`Image upload failed: ${attached.error.message}`);
  }
  return readFragment(ItemImageFragment, attached.data).id;
};

/** `82450ad1:…/actors/uploadItemImage.ts` — no cellar, so just the item. */
export const uploadItemImage = fromPromise(
  async ({
    input: { itemId, itemType, displayImage, displayImageFileId, urqlClient },
  }: {
    input: UploadItemImageInput;
  }): Promise<UploadItemImageResult> => ({
    imageId: await attachDisplayImage(
      urqlClient,
      itemId,
      itemType,
      displayImage,
      displayImageFileId,
    ),
  }),
);
