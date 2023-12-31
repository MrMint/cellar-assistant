import { ItemType } from "@shared/gql/graphql";
import { addCellarItemMutation, addItemImageMutation } from "@shared/queries";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import {
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
          item_type: ItemType.Coffee,
          image: displayImage,
        },
      });

      imageId = addImageResult.data?.item_image_upload?.id;
      if (isNil(imageId) || isNotNil(addImageResult.error)) throw Error();
    }

    const addResult = await urqlClient.mutation(addCellarItemMutation, {
      item: {
        coffee_id: itemId,
        cellar_id: cellarId,
        display_image_id: imageId,
      },
    });

    if (isNil(addResult.data?.insert_cellar_items_one?.id)) throw Error();
    return { itemId: addResult.data?.insert_cellar_items_one?.id ?? "" };
  },
);
