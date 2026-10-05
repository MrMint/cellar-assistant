/**
 * What an `ItemCard` reads off an `Item` — the new-schema successor of the six
 * `*ItemCardFragment`s at `82450ad1:src/components/item/ItemCard/fragments.ts`.
 *
 * One fragment on the `Item` interface instead of six per-table ones; the
 * per-type half is only the vintage and the subtitle descriptor, which are the
 * old `subtitle_field` aliases: wine `variety`, beer and spirit `style`,
 * coffee `roastLevel`, sake and tea `category`.
 *
 * Old field → new field:
 *
 * - `reviews_aggregate { count avg { score } }` → `score { count average }`.
 * - `item_favorites(where user = me) { id }` → `isFavorite` (A7c).
 * - `item_images(limit: 1) { file_id placeholder }` →
 *   `images(first: 1) { … file { url } }`. `file { url }` presigns, and throws
 *   on an unverified file, which would null the connection — safe here for the
 *   reason `ItemImageFragment` in `lib/api/items.ts` gives: `ItemActor` only
 *   ever attaches a verified file, and the foreign key is `RESTRICT`.
 * - `brands(order_by: is_primary desc, limit: 1)` → `brands(first: 1)`.
 * - `item_favorites_aggregate { count }` → `favoriteCount` (G6, API wave A).
 * - the viewer's `user_reviews: reviews_aggregate` → `myReview` (G7, API wave
 *   A): non-null means "you reviewed this", the gold star.
 *
 * `style` is aliased per type for the reason `ItemAttributesFragment` gives:
 * the same response name may not carry two types across sibling fragments.
 */

import { graphql } from "@/lib/api/graphql";

export const ItemCardFragment = graphql(`
  fragment ItemCard on Item {
    __typename
    id
    type
    name
    isFavorite
    favoriteCount
    myReview {
      __typename
      id
      score
    }
    score {
      average
      count
    }
    images(first: 1) {
      edges {
        node {
          __typename
          id
          fileId
          placeholder
          file {
            __typename
            id
            url
          }
        }
      }
    }
    brands(first: 1) {
      edges {
        node {
          __typename
          id
          isPrimary
          brand {
            __typename
            id
            name
          }
        }
      }
    }
    ... on Wine {
      __typename
      vintage
      variety
    }
    ... on Beer {
      __typename
      vintage
      beerStyle: style
    }
    ... on Spirit {
      __typename
      vintage
      spiritStyle: style
    }
    ... on Coffee {
      __typename
      roastLevel
    }
    ... on Sake {
      __typename
      vintageYear
      category
    }
    ... on Tea {
      __typename
      category
    }
  }
`);
