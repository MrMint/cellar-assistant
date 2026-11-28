import { isNil } from "ramda";
import { fromPromise } from "xstate";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { offeredBy } from "@/lib/ai/capabilities";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { IMAGE_SEARCH_LIMIT } from "@/lib/items/image-search";
import type { ExistingItem } from "../adapter";
import { OnboardingImageMatchQuery } from "../queries";
import type { SearchByImageInput } from "./types";

/**
 * `82450ad1:…/OnboardingWizard/actors/searchByImage.ts`: what a display photo
 * of a new item already looks like in the catalogue (G32). The old actor sent
 * the capture's data URL to `create_search_vector` and the vector to
 * `image_search`; now the photo is uploaded (`image-search`) and
 * `itemSearch(imageFileId:)` does both server-side.
 *
 * Like the old actor, "nothing to choose from" is the answer to everything
 * that is not a match — no photo, a deployment that cannot embed photos
 * (`IMAGE_SEARCH_UNAVAILABLE`), any other refusal — and the wizard moves on to
 * `done` with the photo kept, as it did when the vector came back null.
 *
 * One narrowing the old query did not have: `itemTypes` is the type being
 * added. The old search offered wines while adding a beer, and choosing one
 * filed the bottle under the wizard's type with another type's id.
 *
 * **One upload (X06).** The query is the front label's own file, uploaded once
 * at the shutter for the read — not a second `image-search` copy of the same
 * bytes. `ItemSearchActor` discards only `image-search` files after a search,
 * so the label the session reads (and the bottle's display image) survives.
 */
export const searchByImage = fromPromise(
  async ({
    input: { imageFileId, urqlClient, itemType },
  }: {
    input: SearchByImageInput;
  }): Promise<ExistingItem[]> => {
    if (isNil(imageFileId)) return [];
    // N07/D25: a deployment that cannot embed a photo is not asked to — no
    // refusal; the wizard simply has nothing to offer.
    if (!(await offeredBy(urqlClient, "imageSearch"))) return [];
    const response = await urqlClient
      .query(
        OnboardingImageMatchQuery,
        {
          imageFileId,
          itemTypes: isNil(itemType) ? null : [itemType],
          first: IMAGE_SEARCH_LIMIT,
        },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    const result = unwrapResult(
      response.data?.itemSearch,
      "ItemSearchConnection",
    );
    if (!result.ok) return [];
    return result.data.edges.map(({ node }) => ({
      item: itemCardFromFragment(node.item),
      type: readFragment(ItemCardFragment, node.item).type,
    }));
  },
);
