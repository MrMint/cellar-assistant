import { graphql } from "@cellar-assistant/shared";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  sakeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";

export const GetCellarItemsQuery = graphql(
  `
    query GetCellarItemsQuery(
      $cellarId: uuid!
      $itemsWhereClause: cellar_items_bool_exp
      $search: halfvec
      $userId: uuid!
    ) {
      cellars_by_pk(id: $cellarId) {
        id
        name
        created_by_id
        co_owners {
          user_id
        }
        item_counts: items_aggregate(where: { empty_at: { _is_null: true } }) {
          beers: aggregate {
            count(columns: [beer_id])
          }
          wines: aggregate {
            count(columns: [wine_id])
          }
          spirits: aggregate {
            count(columns: [spirit_id])
          }
          coffees: aggregate {
            count(columns: [coffee_id])
          }
          sakes: aggregate {
            count(columns: [sake_id])
          }
        }
        items(where: $itemsWhereClause) {
          id
          type
          display_image {
            file_id
            placeholder
          }
          beer {
            ...beerItemCardFragment
            item_vectors {
              distance(args: { search: $search })
            }
          }
          wine {
            ...wineItemCardFragment
            item_vectors {
              distance(args: { search: $search })
            }
          }
          spirit {
            ...spiritItemCardFragment
            item_vectors {
              distance(args: { search: $search })
            }
          }
          coffee {
            ...coffeeItemCardFragment
            item_vectors {
              distance(args: { search: $search })
            }
          }
          sake {
            ...sakeItemCardFragment
            item_vectors {
              distance(args: { search: $search })
            }
          }
        }
      }
    }
  `,
  [
    beerItemCardFragment,
    wineItemCardFragment,
    spiritItemCardFragment,
    coffeeItemCardFragment,
    sakeItemCardFragment,
  ],
);
