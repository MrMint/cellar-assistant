import { graphql } from "@shared/gql";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import { fromPromise } from "xstate";
import { getItemType } from "@/utilities";
import { BarcodeSearchResult, SearchByBarcodeInput } from "./types";

const searchByBarcodeQuery = graphql(`
  query SearchByBarcode($code: String!, $userId: uuid!) {
    barcodes_by_pk(code: $code) {
      beers {
        ...beerItemCardFragment
      }
      wines {
        ...wineItemCardFragment
      }
      spirits {
        ...spiritItemCardFragment
      }
      coffees {
        ...coffeeItemCardFragment
      }
    }
  }
`);

export const searchByBarcode = fromPromise(
  async ({
    input: { barcode, urqlClient, userId },
  }: {
    input: SearchByBarcodeInput;
  }) => {
    if (isNil(barcode)) return [];
    const searchResults = await urqlClient.query(searchByBarcodeQuery, {
      code: barcode.text,
      userId,
    });

    let results = new Array<BarcodeSearchResult>();
    if (
      isNotNil(searchResults.data) &&
      isNotNil(searchResults.data.barcodes_by_pk)
    ) {
      const { wines, beers, spirits, coffees } =
        searchResults.data.barcodes_by_pk;
      results = [
        ...wines,
        ...beers,
        ...spirits,
        ...coffees.map((x) => ({ ...x, vintage: undefined })),
      ]
        .map((result) => {
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
    return results;
  },
);
