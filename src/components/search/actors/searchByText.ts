import { graphql } from "@cellar-assistant/shared";
import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import type { Client } from "urql";
import { fromPromise } from "xstate";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";
import { buildItemSubtitle, getItemType } from "@/utilities";

type SearchByTextInput = {
  text: string;
  userId: string;
  urqlClient: Client;
};

const textSearchQuery = graphql(
  `
    query TextSearchQuery($text: String!, $userId: uuid!) {
      text_search(
        args: { text: $text }
        where: { distance: { _lte: 1 } }
        order_by: { distance: asc }
        limit: 10
      ) {
        distance
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

export const searchByText = fromPromise(
  async ({
    input: { text, urqlClient, userId },
  }: {
    input: SearchByTextInput;
  }) => {
    if (isNil(text)) return [];
    const vector = await urqlClient.query(getSearchVectorQuery, {
      text,
    });

    let results: BarcodeSearchResult[] = [];
    if (isNotNil(vector.data?.create_search_vector)) {
      const searchResults = await urqlClient.query(textSearchQuery, {
        text: JSON.stringify(vector.data.create_search_vector),
        userId,
      });
      if (isNotNil(searchResults.data?.text_search)) {
        results = searchResults.data.text_search
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
              subtitle: buildItemSubtitle(result),
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
