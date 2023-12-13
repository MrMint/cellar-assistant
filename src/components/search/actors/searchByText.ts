import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { getSearchVectorQuery } from "@shared/queries";
import { isNil, isNotNil } from "ramda";
import { type Client } from "urql";
import { fromPromise } from "xstate";
import { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";

type SearchByTextInput = {
  text: string;
  urqlClient: Client;
};

const textSearchQuery = graphql(`
  query TextSearchQuery($text: String!) {
    text_search(
      args: { text: $text }
      where: { distance: { _lte: 0.32 } }
      order_by: { distance: asc }
      limit: 10
    ) {
      distance
      beer {
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
      wine {
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
      spirit {
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
      coffee {
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

export const searchByText = fromPromise(
  async ({ input: { text, urqlClient } }: { input: SearchByTextInput }) => {
    if (isNil(text)) return [];
    const vector = await urqlClient.query(getSearchVectorQuery, {
      text,
    });

    let results = new Array<BarcodeSearchResult>();
    if (isNotNil(vector.data?.create_search_vector)) {
      const searchResults = await urqlClient.query(textSearchQuery, {
        text: JSON.stringify(vector.data.create_search_vector),
      });
      if (isNotNil(searchResults.data?.text_search)) {
        results = searchResults.data.text_search
          .map((x) => {
            if (isNotNil(x.wine)) {
              return {
                id: x.wine.id,
                name: x.wine.name,
                vintage: x.wine.vintage,
                type: ItemType.Wine,
                displayImageId: x.wine.item_images[0]?.file_id,
                placeholder: x.wine.item_images[0]?.placeholder,
                score: x.wine.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.wine.reviews_aggregate.aggregate?.count,
              } as BarcodeSearchResult;
            }
            if (isNotNil(x.beer)) {
              return {
                id: x.beer.id,
                name: x.beer.name,
                type: ItemType.Beer,
                displayImageId: x.beer.item_images[0]?.file_id,
                placeholder: x.beer.item_images[0]?.placeholder,
                score: x.beer.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.beer.reviews_aggregate.aggregate?.count,
              } as BarcodeSearchResult;
            }
            if (isNotNil(x.spirit)) {
              return {
                id: x.spirit.id,
                name: x.spirit.name,
                type: ItemType.Spirit,
                displayImageId: x.spirit.item_images[0]?.file_id,
                placeholder: x.spirit.item_images[0]?.placeholder,
                score: x.spirit.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.spirit.reviews_aggregate.aggregate?.count,
              } as BarcodeSearchResult;
            }
            if (isNotNil(x.coffee)) {
              return {
                id: x.coffee.id,
                name: x.coffee.name,
                type: ItemType.Coffee,
                displayImageId: x.coffee.item_images[0]?.file_id,
                placeholder: x.coffee.item_images[0]?.placeholder,
                score: x.coffee.reviews_aggregate.aggregate?.avg?.score,
                reviewCount: x.coffee.reviews_aggregate.aggregate?.count,
              } as BarcodeSearchResult;
            }
          })
          .filter(isNotNil);
      }
    }
    return results;
  },
);
