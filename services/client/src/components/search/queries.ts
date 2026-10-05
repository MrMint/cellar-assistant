/**
 * `/search`'s documents — the successors of the old page's Hasura queries
 * (`82450ad1:src/app/(authenticated)/search/actions.ts`,
 * `82450ad1:src/components/search/fragments.ts`).
 *
 * | old (Hasura)                                        | new (`services/api`)                     |
 * | --------------------------------------------------- | ---------------------------------------- |
 * | `create_search_vector(text:)` + `text_search(… limit: 10, distance ≤ 1)` | `itemSearch(text:, limit: 10, maxDistance: 1)` |
 * | six `*ItemCardFragment`s on the hit's `beer`/`wine`/… | `item { ...ItemCard }`                 |
 * | `searchByBarcode` (a stub that returned `[]`)       | `barcode(code:) { items { ...ItemCard } }` |
 * | `create_search_vector(image:)` + `image_search`     | nothing — G32, a chosen drop             |
 * | `cellars_aggregate` + six `*_aggregate` (own and co-owned, distinct items) | `me.collectionStats` (G36) |
 *
 * `itemSearch` is purely semantic: `text` is embedded and ranked by cosine
 * distance, exactly as the old `text_search` was. It is a shared actor keyed
 * on its inputs, so nothing viewer-specific goes into these variables;
 * `Item.isFavorite`/`myReview` are resolved per request on the *result*.
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * How many hits the old page showed: `text_search(… limit: 10)`.
 *
 * Also `itemSearch`'s `limit` (the actor's own ceiling, 1–50 — over it is a
 * `VALIDATION` error) and the one page's `first`, so the page holds the whole
 * result set the way the old grid did, with no paging UI the old page lacked.
 */
export const ITEM_SEARCH_LIMIT = 10;

/**
 * Cosine distance beyond which a hit is noise: the old `distance: { _lte: 1 }`.
 * 1.0 is orthogonal on a 0–2 scale.
 */
export const ITEM_SEARCH_MAX_DISTANCE = 1;

/**
 * Items sharing one scanned code. A real code names one product and a few
 * near-duplicates; each node resolves through the item loader, so one page is
 * capped well under the API's 100.
 */
export const BARCODE_SEARCH_LIMIT = 24;

/** The old `ServerSearchResults` → `searchByText`. */
export const SearchItemsQuery = graphql(
  `
  query SearchItems(
    $text: String!
    $first: Int!
    $limit: Int!
    $maxDistance: Float!
  ) {
    itemSearch(
      text: $text
      first: $first
      limit: $limit
      maxDistance: $maxDistance
    ) {
      __typename
      ... on ItemSearchConnection {
        edges {
          node {
            __typename
            id
            name
            type
            distance
            item {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

/** The old page's "Barcode search results" — which the stub never filled. */
export const SearchBarcodeQuery = graphql(
  `
  query SearchBarcode($code: String!, $first: Int!) {
    barcode(code: $code) {
      __typename
      ... on Barcode {
        items(first: $first) {
          edges {
            node {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

/**
 * The line under the greeting. The old `CollectionStats` summed six per-type
 * `*_aggregate` counts over cellars the viewer created or co-owns; the rewrite
 * summed `myCellars`, which lists every *visible* cellar — strangers' PUBLIC
 * and friends' FRIENDS ones too — so it over-counted. `collectionStats` is the
 * old question, answered server-side (G36).
 */
export const SearchCollectionStatsQuery = graphql(`
  query SearchCollectionStats {
    me {
      __typename
      id
      collectionStats {
        cellarCount
        itemCounts {
          total
          wine
          beer
          spirit
          coffee
          sake
          tea
        }
      }
    }
  }
`);
