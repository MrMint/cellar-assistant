import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { isNil, isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { BarcodeSearchResult, SearchByImageInput } from "./types";

const getImageVector = graphql(`
  query GetImageVector($image: String!) {
    create_search_vector(image: $image)
  }
`);

const imageSearchQuery = graphql(`
  query ImageSearchQuery($image: String!) {
    image_search(
      args: { image: $image }
      where: { distance: { _lte: 0.3 } }
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

export const searchByImage = fromPromise(
  async ({
    input: { displayImage, urqlClient },
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
      });
      if (isNotNil(searchResults.data?.image_search)) {
        results = searchResults.data.image_search
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
