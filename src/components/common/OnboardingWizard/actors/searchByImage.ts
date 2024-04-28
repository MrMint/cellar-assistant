import { graphql } from "@shared/gql";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import { fromPromise } from "xstate";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";
import { getItemType } from "@/utilities";
import { BarcodeSearchResult, SearchByImageInput } from "./types";

const getImageVector = graphql(`
  query GetImageVector($image: String!) {
    create_search_vector(image: $image)
  }
`);

const imageSearchQuery = graphql(
  `
    query ImageSearchQuery($image: String!, $userId: uuid!) {
      image_search(
        args: { image: $image }
        where: { distance: { _lte: 0.3 } }
        order_by: { distance: asc }
        limit: 10
      ) {
        beer {
          ...beerItemCardFragment
        }
        wine {
          ...wineItemCardFragment
        }
        spirit {
          ...spiritItemCardFragment
        }
        coffee {
          ...coffeeItemCardFragment
        }
      }
    }
  `,
  [
    beerItemCardFragment,
    wineItemCardFragment,
    spiritItemCardFragment,
    coffeeItemCardFragment,
  ],
);

export const searchByImage = fromPromise(
  async ({
    input: { displayImage, urqlClient, userId },
  }: {
    input: SearchByImageInput;
  }) => {
    if (isNil(displayImage)) return [];
    const vector = await urqlClient.query(getImageVector, {
      image: displayImage,
    });

    let results = new Array<BarcodeSearchResult>();
    if (isNotNil(vector.data?.create_search_vector)) {
      const searchResults = await urqlClient.query(imageSearchQuery, {
        image: JSON.stringify(vector.data.create_search_vector),
        userId,
      });
      if (isNotNil(searchResults.data?.image_search)) {
        results = searchResults.data.image_search
          .map((x) => {
            const result = nth(
              0,
              without(
                [undefined, null],
                [
                  x.beer,
                  x.wine,
                  x.spirit,
                  isNotNil(x.coffee)
                    ? { ...x.coffee, vintage: undefined }
                    : undefined,
                ],
              ),
            );
            if (isNil(result)) return undefined;
            return {
              id: result.id,
              type: getItemType(result.__typename),
              itemId: result.id,
              name: result.name,
              vintage: result.vintage ?? undefined,
              displayImageId: result.item_images[0]?.file_id,
              placeholder: result.item_images[0]?.placeholder,
              score: result.reviews_aggregate.aggregate?.avg?.score,
              reviewCount: result.reviews_aggregate.aggregate?.count,
              favoriteCount: result.item_favorites_aggregate.aggregate?.count,
              favoriteId: nth(0, result.item_favorites)?.id,
              reviewed: defaultTo(0, result.user_reviews.aggregate?.count) > 0,
            } satisfies BarcodeSearchResult;
          })
          .filter(isNotNil);
      }
    }
    return results;
  },
);
