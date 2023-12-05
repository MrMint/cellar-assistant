import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { BarcodeSearchResult, SearchByBarcodeInput } from "./types";

const searchByBarcodeQuery = graphql(`
  query SearchByBarcode($code: String!) {
    barcodes_by_pk(code: $code) {
      wines {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
        reviews_aggregate {
          aggregate {
            count
            avg {
              score
            }
          }
        }
      }
      beers {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
        reviews_aggregate {
          aggregate {
            count
            avg {
              score
            }
          }
        }
      }
      spirits {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
        reviews_aggregate {
          aggregate {
            count
            avg {
              score
            }
          }
        }
      }
      coffees {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
        reviews_aggregate {
          aggregate {
            count
            avg {
              score
            }
          }
        }
      }
    }
  }
`);

export const searchByBarcode = fromPromise(
  async ({
    input: { barcode, urqlClient },
  }: {
    input: SearchByBarcodeInput;
  }) => {
    if (isNil(barcode)) return [];
    const searchResults = await urqlClient.query(searchByBarcodeQuery, {
      code: barcode.text,
    });

    let results = new Array<BarcodeSearchResult>();
    if (
      isNotNil(searchResults.data) &&
      isNotNil(searchResults.data.barcodes_by_pk)
    ) {
      const { wines, beers, spirits, coffees } =
        searchResults.data.barcodes_by_pk;
      results = results
        .concat(
          wines.map(
            (x) =>
              ({
                id: x.id,
                name: x.name,
                vintage: x.vintage,
                type: ItemType.Wine,
                displayImageId: x.item_images[0]?.file_id,
                placeholder: x.item_images[0]?.placeholder,
                score: x.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.reviews_aggregate.aggregate?.count,
              }) as BarcodeSearchResult,
          ),
        )
        .concat(
          beers.map(
            (x) =>
              ({
                id: x.id,
                name: x.name,
                vintage: x.vintage,
                type: ItemType.Beer,
                displayImageId: x.item_images[0]?.file_id,
                placeholder: x.item_images[0]?.placeholder,
                score: x.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.reviews_aggregate.aggregate?.count,
              }) as BarcodeSearchResult,
          ),
        )
        .concat(
          spirits.map(
            (x) =>
              ({
                id: x.id,
                name: x.name,
                vintage: x.vintage,
                type: ItemType.Spirit,
                displayImageId: x.item_images[0]?.file_id,
                placeholder: x.item_images[0]?.placeholder,
                score: x.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.reviews_aggregate.aggregate?.count,
              }) as BarcodeSearchResult,
          ),
        )
        .concat(
          coffees.map(
            (x) =>
              ({
                id: x.id,
                name: x.name,
                type: ItemType.Coffee,
                displayImageId: x.item_images[0]?.file_id,
                placeholder: x.item_images[0]?.placeholder,
                score: x.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.reviews_aggregate.aggregate?.count,
              }) as BarcodeSearchResult,
          ),
        );
    }
    return results;
  },
);
