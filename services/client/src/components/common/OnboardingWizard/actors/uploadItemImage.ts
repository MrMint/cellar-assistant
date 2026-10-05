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

/**
 * Upload a display photo and attach it to the item as a public image —
 * `item_image_upload(image: base64)` as it is now: presigned PUT, then
 * `attachItemImage`, which verifies the file before writing the row.
 * `undefined` when there was no photo; throws with the API's message on a
 * refusal.
 */
export const attachDisplayImage = async (
  urqlClient: Client,
  itemId: string,
  itemType: ApiItemType,
  displayImage: string | undefined,
): Promise<string | undefined> => {
  if (isNil(displayImage)) return undefined;
  const file = dataUrlToFile(displayImage, "display.jpg");
  if (file === null) return undefined;
  let fileId: string;
  try {
    fileId = await uploadFile(urqlClient, file, "item-image");
  } catch (cause) {
    if (cause instanceof UploadRejectedError) {
      throw new Error(`Image upload failed: ${cause.failure.message}`);
    }
    throw cause;
  }
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
    input: { itemId, itemType, displayImage, urqlClient },
  }: {
    input: UploadItemImageInput;
  }): Promise<UploadItemImageResult> => ({
    imageId: await attachDisplayImage(
      urqlClient,
      itemId,
      itemType,
      displayImage,
    ),
  }),
);
