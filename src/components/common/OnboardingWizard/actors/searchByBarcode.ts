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
      }
      beers {
        id
        name
        vintage
      }
      spirits {
        id
        name
        vintage
      }
      coffees {
        id
        name
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
              }) as BarcodeSearchResult,
          ),
        );
    }
    return results;
  },
);
