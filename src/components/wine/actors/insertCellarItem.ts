import {
  addCellarItemMutation,
  addItemImageMutation,
} from "@cellar-assistant/shared/queries";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import type {
  InsertCellarItemInput,
  InsertCellarItemResult,
} from "../../common/OnboardingWizard/actors/types";

export const insertCellarItem = fromPromise(
  async ({
    input: { itemId, cellarId, displayImage, urqlClient },
  }: {
    input: InsertCellarItemInput;
  }): Promise<InsertCellarItemResult> => {
    let imageId: string | undefined;
    if (isNotNil(displayImage)) {
      const addImageResult = await urqlClient.mutation(addItemImageMutation, {
        input: {
          item_id: itemId,
          item_type: "WINE",
          image: displayImage,
        },
      });

      imageId = addImageResult.data?.item_image_upload?.id;
      if (isNil(imageId) || isNotNil(addImageResult.error)) {
        console.error("Failed to upload image:", addImageResult.error);
        throw new Error(
          `Image upload failed: ${addImageResult.error?.message ?? "Unknown error"}`,
        );
      }
    }

    const addResult = await urqlClient.mutation(addCellarItemMutation, {
      item: {
        wine_id: itemId,
        cellar_id: cellarId,
        display_image_id: imageId,
      },
    });

    if (isNil(addResult.data?.insert_cellar_items_one?.id)) {
      console.error("Failed to add cellar item:", addResult.error);
      throw new Error(
        `Failed to add cellar item: ${addResult.error?.message ?? "Unknown error"}`,
      );
    }
    return { itemId: addResult.data?.insert_cellar_items_one?.id ?? "" };
  },
);
