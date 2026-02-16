import { addItemImageMutation } from "@cellar-assistant/shared/queries";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { compressImage } from "@/utilities";
import type { UploadItemImageInput, UploadItemImageResult } from "./types";

export const uploadItemImage = fromPromise(
  async ({
    input: { itemId, itemType, displayImage, urqlClient },
  }: {
    input: UploadItemImageInput;
  }): Promise<UploadItemImageResult> => {
    if (isNotNil(displayImage)) {
      const compressedImage = await compressImage(displayImage);
      const addImageResult = await urqlClient.mutation(addItemImageMutation, {
        input: {
          item_id: itemId,
          item_type: itemType,
          image: compressedImage,
        },
      });

      const imageId = addImageResult.data?.item_image_upload?.id;
      if (isNil(imageId) || isNotNil(addImageResult.error)) {
        console.error("Failed to upload image:", addImageResult.error);
        throw new Error(
          `Image upload failed: ${addImageResult.error?.message ?? "Unknown error"}`,
        );
      }

      return { imageId };
    }
    return {};
  },
);
