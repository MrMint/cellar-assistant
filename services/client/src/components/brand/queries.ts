/**
 * `/brands` and `/brands/[brandId]`' documents — the successor of
 * `82450ad1:src/components/brand/queries.ts`, carrying over what
 * `lib/api/brands.ts` (D4, A7g) established about the new API.
 *
 * Old → new:
 *
 * - `BrandsList` (`brands(where name _ilike, limit 200, offset)` plus
 *   `item_brands_aggregate`) → two documents. The index is
 *   {@link BrandsListQuery}, `Query.brands`, a Relay connection — 200 is over
 *   the API's cap of 100 and would be a `ValidationError`. The search box is
 *   {@link BrandsSearchQuery}, `brandSearch(term:)`, which takes a term rather
 *   than an `_ilike` pattern (`%` matches itself), so `escapeLike` goes.
 *   The count is `Brand.itemCount` (G23).
 * - `BrandDetail` (`brands_by_pk` with `item_brands { is_primary wine {…} … }`
 *   over six nullable per-table relations) → {@link BrandDetailQuery}:
 *   `brand(id:)`, a result union, with `itemLinks` (G24 — the links
 *   themselves, primary first, each carrying `isPrimary` and its `item`),
 *   `places`, `parentBrand` and `childBrands`.
 * - `BrandPlaces`, the separate defensive read for a relationship not every
 *   Hasura deployment tracked → `places` on the same document; it always
 *   exists now.
 *
 * ## Page sizes differ because the edges cost different things
 *
 * `childBrands` and `places` are one collection call each whatever the page
 * size; `itemLinks` resolves `item` through one `ItemActor.get` per row. So
 * the items list asks for a screenful and pages on ("Show more"), where the
 * old page read every link at once. Every `first` over 100 is a `VALIDATION`
 * error rather than a clamp — and on `itemLinks`/`places`, plain connections
 * inside the `... on Brand` branch, a top-level one that blanks the page —
 * which `queries.test.ts` asserts against these constants.
 */

import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Cards per page on `/brands`. The API caps any `first` at 100. */
export const BRANDS_PAGE_SIZE = 48;

/**
 * Brands the search box shows. `brandSearch`'s `limit` (how many the actor
 * holds) caps at 50, so one page of 50 is the whole result set.
 */
export const BRAND_SEARCH_LIMIT = 50;

/** Item links per page on a brand's page — the one per-row-cost edge. */
export const BRAND_ITEMS_PAGE_SIZE = 12;

/** Places on a brand's page, in one go: they arrive joined. */
export const BRAND_PLACES_PAGE_SIZE = 20;

/** Sub-brands on a brand's page: one collection call. */
export const BRAND_CHILDREN_PAGE_SIZE = 24;

/**
 * A brand as `BrandCard` draws it. `__typename` is selected because the
 * fragment is spread into union branches (D2: `readFragment` types `never`
 * otherwise).
 */
export const BrandCoreFragment = graphql(`
  fragment BrandCore on Brand {
    __typename
    id
    name
    brandType
    description
    logoUrl
    parentBrandId
    createdAt
  }
`);

/** The index's card: the core fields plus `itemCount` (G23). */
export const BrandListCardFragment = graphql(`
  fragment BrandListCard on Brand {
    __typename
    id
    name
    brandType
    description
    logoUrl
    parentBrandId
    itemCount
  }
`);

/**
 * One item link on a brand's page: what the old `item_brands` row carried —
 * `is_primary` and the item's name (and a wine's vintage) — for whichever of
 * six tables it pointed at, now one `Item` with its `type`.
 */
export const BrandItemLinkFragment = graphql(`
  fragment BrandItemLink on ItemBrand {
    __typename
    id
    isPrimary
    item {
      __typename
      id
      type
      name
      ... on Wine {
        __typename
        vintage
      }
    }
  }
`);

/** One `place_brands` link: the place and how it relates to the brand. */
export const BrandPlaceLinkFragment = graphql(`
  fragment BrandPlaceLink on PlaceBrand {
    __typename
    id
    relationshipType
    place {
      __typename
      id
      name
    }
  }
`);

/** `/brands` — the alphabetical index, paged. */
export const BrandsListQuery = graphql(
  `
  query BrandsList($first: Int!, $after: String) {
    brands(first: $first, after: $after) {
      __typename
      ... on BrandConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...BrandListCard
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BrandListCardFragment, ActorErrorFieldsFragment],
);

/** The `/brands` search box: brands by name, as whole cards. */
export const BrandsSearchQuery = graphql(
  `
  query BrandsSearch($term: String!, $limit: Int!, $first: Int!) {
    brandSearch(term: $term, limit: $limit, first: $first) {
      __typename
      ... on BrandSearchConnection {
        edges {
          cursor
          node {
            __typename
            id
            brand {
              ...BrandListCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BrandListCardFragment, ActorErrorFieldsFragment],
);

/**
 * `/brands/[brandId]` — the brand and all four reverse edges in one read.
 * The page sizes are variables so the constants above are the only place
 * they are written, and the cap test has one number each to check.
 */
export const BrandDetailQuery = graphql(
  `
  query BrandDetail(
    $id: ID!
    $itemsFirst: Int!
    $placesFirst: Int!
    $childrenFirst: Int!
  ) {
    brand(id: $id) {
      __typename
      ... on Brand {
        ...BrandCore
        parentBrand {
          ...BrandCore
        }
        childBrands(first: $childrenFirst) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...BrandCore
            }
          }
        }
        itemLinks(first: $itemsFirst) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...BrandItemLink
            }
          }
        }
        places(first: $placesFirst) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...BrandPlaceLink
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [
    BrandCoreFragment,
    BrandItemLinkFragment,
    BrandPlaceLinkFragment,
    ActorErrorFieldsFragment,
  ],
);

/** The next page of one brand's item links, and nothing else. */
export const BrandItemLinksPageQuery = graphql(
  `
  query BrandItemLinksPage($id: ID!, $first: Int!, $after: String) {
    brand(id: $id) {
      __typename
      ... on Brand {
        __typename
        id
        itemLinks(first: $first, after: $after) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...BrandItemLink
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BrandItemLinkFragment, ActorErrorFieldsFragment],
);
