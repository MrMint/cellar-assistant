import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { graphql } from "@/gql";
import { ItemType } from "@/gql/graphql";
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
      const { wines, beers, spirits } = searchResults.data.barcodes_by_pk;
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
        );
    }
    return results;
  },
);
