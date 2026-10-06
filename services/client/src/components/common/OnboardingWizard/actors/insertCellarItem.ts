import { fromPromise } from "xstate";
import { AddItemToCellarFromItemMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import type { InsertCellarItemInput, InsertCellarItemResult } from "./types";
import { attachDisplayImage } from "./uploadItemImage";

/**
 * The six `82450ad1:src/components/{type}/actors/insertCellarItem.ts`, as
 * one: upload the display photo (if any) as an item image, then file the
 * bottle with it as the display image — `insert_cellar_items_one` →
 * `addItemToCellar`, with a client-minted `cellarItemId` so a retry files one
 * bottle, not two. Who may add to the cellar is the server's call
 * (creator or co-owner); a refusal is thrown with its message.
 */
export const insertCellarItem = fromPromise(
  async ({
    input: {
      itemId,
      itemType,
      cellarId,
      cellarItemId,
      displayImage,
      urqlClient,
    },
  }: {
    input: InsertCellarItemInput;
  }): Promise<InsertCellarItemResult> => {
    const displayImageId = await attachDisplayImage(
      urqlClient,
      itemId,
      itemType,
      displayImage,
    );
    const response = await urqlClient
      .mutation(AddItemToCellarFromItemMutation, {
        cellarId,
        input: {
          cellarItemId,
          item: { id: itemId, type: itemType },
          displayImageId: displayImageId ?? null,
        },
      })
      .toPromise();
    const added = unwrapResult(response.data?.addItemToCellar, "CellarItem");
    if (!added.ok) {
      throw new Error(`Failed to add cellar item: ${added.error.message}`);
    }
    return { itemId: added.data.id };
  },
);
