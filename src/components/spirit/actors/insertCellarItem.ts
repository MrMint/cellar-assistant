import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { ItemType } from "@/gql/graphql";
import { addItemImageMutation, addSpiritToCellarMutation } from "@/queries";
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
          item_type: ItemType.Spirit,
          image: displayImage,
        },
      });

      imageId = addImageResult.data?.item_image_upload?.id;
      if (isNil(imageId) || isNotNil(addImageResult.error)) throw Error();
    }

    const addResult = await urqlClient.mutation(addSpiritToCellarMutation, {
      spirit: {
        spirit_id: itemId,
        cellar_id: cellarId,
        display_image_id: imageId,
      },
    });

    if (isNil(addResult.data?.insert_cellar_spirit_one?.id)) throw Error();
    return { itemId: addResult.data?.insert_cellar_spirit_one?.id ?? "" };
  },
);
