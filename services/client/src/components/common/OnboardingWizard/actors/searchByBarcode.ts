import { isNil } from "ramda";
import { fromPromise } from "xstate";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import type { ExistingItem } from "../adapter";
import { BARCODE_MATCHES_LIMIT, OnboardingBarcodeQuery } from "../queries";
import type { SearchByBarcodeInput } from "./types";

/**
 * `82450ad1:…/actors/searchByBarcode.ts`: what a scanned code already points
 * at. The old query covered wine, beer, spirit and coffee only; `barcode(code)`
 * covers all six. A code nobody registered is `NotFoundError` — the ordinary
 * case — and, like any other failure, means "nothing to choose from": the
 * wizard moves on to the label photos, as the old empty result did.
 */
export const searchByBarcode = fromPromise(
  async ({
    input: { barcode, urqlClient },
  }: {
    input: SearchByBarcodeInput;
  }): Promise<ExistingItem[]> => {
    if (isNil(barcode)) return [];
    const response = await urqlClient
      .query(
        OnboardingBarcodeQuery,
        { code: barcode.text, first: BARCODE_MATCHES_LIMIT },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    const result = unwrapResult(response.data?.barcode, "Barcode");
    if (!result.ok) return [];
    return result.data.items.edges.map(({ node }) => ({
      item: itemCardFromFragment(node),
      type: readFragment(ItemCardFragment, node).type,
    }));
  },
);
