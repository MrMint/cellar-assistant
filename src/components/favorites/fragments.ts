import { graphql } from "@cellar-assistant/shared";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";

/**
 * User favorites fragment for server-side rendering
 * Includes all item types with their card data
 */
export const UserFavoritesFragment = graphql(
  `
  fragment UserFavorites on users @_unmask {
    id
    item_favorites {
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

/**
 * Query to get user favorites for server-side rendering
 * Fetches all favorites which can then be filtered client-side
 */
export const GetUserFavoritesQuery = graphql(
  `
  query GetUserFavorites($userId: uuid!) {
    user(id: $userId) {
      ...UserFavorites
    }
  }
`,
  [UserFavoritesFragment],
);
