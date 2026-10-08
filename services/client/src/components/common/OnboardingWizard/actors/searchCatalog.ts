import { fromPromise } from "xstate";
import {
  itemCardFromFragment,
  primaryBrandName,
} from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import {
  type CatalogMatch,
  catalogSearchText,
  findCatalogMatch,
} from "../catalog-match";
import {
  CATALOG_MATCH_LIMIT,
  CATALOG_MATCH_MAX_DISTANCE,
  OnboardingCatalogMatchQuery,
} from "../queries";
import type { SearchCatalogInput } from "./types";

/**
 * N19: does the catalogue already hold the bottle the label names?
 *
 * `itemSearch(text:, itemTypes:)` over the name as read, then
 * `findCatalogMatch` — same type, explicit vintage compare, the person's
 * earlier "no" excluded, the item's brand carried so a same-name bottle from
 * another producer is never counted down. Like the other searches, anything that is not a hit
 * (nothing read, no AI provider, a refusal) resolves `null`: the wizard goes
 * on to the form, as it did before this step existed.
 */
export const searchCatalog = fromPromise(
  async ({
    input: { urqlClient, itemType, defaults, excludeItemIds },
  }: {
    input: SearchCatalogInput;
  }): Promise<CatalogMatch | null> => {
    const text = catalogSearchText({
      name: defaults.values.name,
      brandName: defaults.brandName,
    });
    if (text === null) return null;
    const response = await urqlClient
      .query(
        OnboardingCatalogMatchQuery,
        {
          text,
          itemTypes: [itemType],
          first: CATALOG_MATCH_LIMIT,
          limit: CATALOG_MATCH_LIMIT,
          maxDistance: CATALOG_MATCH_MAX_DISTANCE,
        },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    const result = unwrapResult(
      response.data?.itemSearch,
      "ItemSearchConnection",
    );
    if (!result.ok) return null;
    return findCatalogMatch({
      type: itemType,
      values: defaults.values,
      brandName: defaults.brandName,
      excludeItemIds,
      candidates: result.data.edges.map(({ node }) => {
        const card = readFragment(ItemCardFragment, node.item);
        return {
          item: itemCardFromFragment(node.item),
          type: card.type,
          source: "search" as const,
          distance: node.distance,
          brandName: primaryBrandName(card),
        };
      }),
    });
  },
);
