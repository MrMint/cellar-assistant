/**
 * `/favorites`' documents — the successor of
 * `82450ad1:src/components/favorites/fragments.ts`.
 *
 * The old pair (`UserFavoritesFragment` for the server, `favoritesQuery` in
 * the client) read `user.item_favorites` with four per-table card fragments —
 * no sake, no tea — and the server's answer was then thrown away
 * (`Favorites.tsx` passed only `userId` on). Now there is one document, read
 * once on the server for the first page and again from the client for the
 * next pages and for a type change.
 *
 * `types` is `Viewer.favorites(types:)` (UI parity G25): it filters before
 * paging, so a type filter no longer short-pages the connection the way a
 * client-side filter over loaded rows would.
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Cards per page. The API caps any `first` at 100. */
export const FAVORITES_PAGE_SIZE = 48;

export const FavoritesQuery = graphql(
  `
  query Favorites($first: Int!, $after: String, $types: [ItemType!]) {
    me {
      id
      favorites(first: $first, after: $after, types: $types) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...ItemCard
          }
        }
      }
    }
  }
`,
  [ItemCardFragment],
);

/**
 * D9 / X15: the recipes you Love, newest Love first — Me › Lists › Loved
 * shows them above the bottles. Fifty is a screenful of rows and more than
 * anyone Loves in a sitting; "Show all" expands to these fifty — it does not
 * page past them (a follow-up if anyone Loves more).
 */
export const LOVED_RECIPES_PAGE_SIZE = 50;

export const LovedRecipesQuery = graphql(
  `
  query LovedRecipes($first: Int!, $after: String) {
    lovedRecipes(first: $first, after: $after) {
      __typename
      ... on RecipeConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            id
            name
            type
            ingredientCount
            recipeGroup {
              id
              name
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
