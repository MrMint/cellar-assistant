import { fromPromise } from "xstate";
import { BarcodeSearchResult, SearchByBarcodeInput } from "./types";
import { isNil, isNotNil } from "ramda";
import { ItemType } from "@/constants";
import { graphql } from "@/gql";

const searchByBarcodeQuery = graphql(`
  query SearchByBarcode($code: String!) {
    barcodes_by_pk(code: $code) {
      wines {
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
      results = results.concat(
        searchResults.data.barcodes_by_pk.wines.map(
          (x) =>
            ({
              id: x.id,
              name: x.name,
              vintage: x.vintage,
              type: ItemType.Wine,
            }) as BarcodeSearchResult,
        ),
      );
    }
    return results;
  },
);
