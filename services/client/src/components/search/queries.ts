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

/**
 * The old feed's `limit: 6` per kind (UI parity G31). The server holds the
 * newest six of each kind and merges them; the old client merged its three
 * queries and kept {@link RECENT_ACTIVITY_CAP}.
 */
export const RECENT_ACTIVITY_PER_KIND = 6;
/** The old `buildActivityFeed`'s `entries.slice(0, 8)`. */
export const RECENT_ACTIVITY_CAP = 8;

/**
 * The old `RecentReviewsQuery`, `RecentTierListItemsQuery` and the
 * `recent_cellar_items` half of `SearchDiscoveryQuery`, as one viewer-scoped
 * field. The old three took `$userIds` from the browser and the tier-list one
 * leaked a friend's PRIVATE list; `me.recentActivity` decides whose activity
 * server-side and filters lists and cellars through the visibility policy.
 *
 * `item_images(limit: 1) { file_id placeholder }` → `images(first: 1)` with
 * `file { url }` (a presigned read, as `ItemCardFragment` selects it), and a
 * place's `google_photos(limit: 1)` → `photos(first: 1)`.
 */
export const SearchRecentActivityQuery = graphql(`
  query SearchRecentActivity($kinds: [ActivityKind!], $limit: Int!, $first: Int!) {
    me {
      __typename
      id
      recentActivity(kinds: $kinds, limit: $limit, first: $first) {
        edges {
          node {
            __typename
            id
            kind
            occurredAt
            rank
            cellarItemId
            user {
              __typename
              id
              displayName
              avatarUrl
            }
            item {
              __typename
              id
              type
              name
              images(first: 1) {
                edges {
                  node {
                    __typename
                    id
                    placeholder
                    file {
                      __typename
                      id
                      url
                    }
                  }
                }
              }
              ... on Wine {
                __typename
                vintage
              }
              ... on Sake {
                __typename
                vintageYear
              }
            }
            place {
              __typename
              id
              name
              displayName
              photos(first: 1) {
                edges {
                  node {
                    __typename
                    id
                    file {
                      __typename
                      id
                      url
                    }
                  }
                }
              }
            }
            review {
              __typename
              id
              score
              text
            }
            tierListItem {
              __typename
              id
              tierListId
              tierList {
                __typename
                id
                name
              }
            }
            cellar {
              __typename
              id
              name
            }
          }
        }
      }
    }
  }
`);

/** The old strip's `limit: 6`. */
export const NEARBY_PLACES_LIMIT = 6;

/**
 * The old `NearbyPlaces`' two server actions — `searchMapPlaces({ bounds:
 * ±0.018°, limit: 6 })` and `getPlaceSummaries(ids)` — as one read:
 * `me.nearbyPlaces` runs the same browse server-side and sorts by distance,
 * and each `place` carries the summary fields (`enrichment` for hours, price
 * and rating; the first stored photo).
 */
export const SearchNearbyPlacesQuery = graphql(`
  query SearchNearbyPlaces(
    $location: LngLatInput!
    $categories: [String!]
    $limit: Int!
    $first: Int!
  ) {
    me {
      __typename
      id
      nearbyPlaces(
        location: $location
        categories: $categories
        limit: $limit
        first: $first
      ) {
        edges {
          node {
            __typename
            distanceMeters
            place {
              __typename
              id
              name
              primaryCategory
              rating
              priceLevel
              location {
                __typename
                lng
                lat
              }
              enrichment {
                __typename
                placeId
                googleOpeningHours
                googlePriceLevel
                googleRating
                googleUserRatingsTotal
              }
              photos(first: 1) {
                edges {
                  node {
                    __typename
                    id
                    file {
                      __typename
                      id
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);
