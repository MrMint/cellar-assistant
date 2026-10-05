/**
 * The restored cellars pages' documents — the new-schema successor of
 * `82450ad1:src/components/cellar/fragments.ts` and `queries.ts`.
 *
 * Old Hasura selection → new field:
 *
 * - `createdBy { id displayName avatarUrl }` → `Cellar.createdBy` (G4). Null
 *   only for an anonymous viewer, which the `(authenticated)` layout rules out;
 *   the adapter still copes.
 * - `co_owners { user { … } }` → `Cellar.coOwners(first:)` (G4), in
 *   `coOwnerIds` order. The old select permission under-counted them (§7); this
 *   is every co-owner.
 * - six `items_aggregate(where: { empty_at: { _is_null: true } })` aliases →
 *   `Cellar.itemCounts` (G1): non-empty bottles per type, decision 4.
 * - `cellars_by_pk.items(where: { empty_at null, type _in })` + a client sort
 *   on `distance, name` → `Cellar.items(types:, status: ACTIVE)` (G2, ACTIVE is
 *   the default) with `sort: NAME_ASC` (G3), or `semanticQuery`, which orders
 *   by distance with name as the tie-break — the old two-key sort, server-side.
 * - the six per-type item fragments → `...ItemCard` on `CellarItem.item`.
 *
 * Fragment and operation names are distinct from `lib/api/cellars.ts`'s, which
 * the check-ins overview still uses.
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { CheckInRowFragment } from "@/lib/api/cellars";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * What `CellarCard` shows: name, owners' avatars, per-type counts.
 *
 * `coOwners(first: 20)`, not the 100 cap: the API prices a nested page as the
 * product of the `first`s, and inside a `myCellars(first: $first)` page (a
 * variable, so priced at its 100 maximum) 100 × 100 is over the 10 000-row
 * budget — `/cellars` 500'd on exactly that. Twenty avatars is more than an
 * `AvatarGroup` on a card can show anyway.
 */
export const CellarCardFragment = graphql(`
  fragment CellarGridCard on Cellar {
    __typename
    id
    name
    createdById
    coOwnerIds
    createdBy {
      __typename
      id
      displayName
      avatarUrl
    }
    coOwners(first: 20) {
      edges {
        node {
          __typename
          id
          displayName
          avatarUrl
        }
      }
    }
    itemCounts {
      __typename
      beer
      wine
      spirit
      coffee
      sake
      tea
      total
    }
  }
`);

/** `/cellars` — one page of the grid. `myCellars` is everything you may see. */
export const GetCellarsQuery = graphql(
  `
  query GetCellars($first: Int!, $after: String) {
    myCellars(first: $first, after: $after) {
      __typename
      ... on CellarConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...CellarGridCard
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarCardFragment, ActorErrorFieldsFragment],
);

/** The items page header: name, who may add, and the filter's counts. */
export const CellarInfoFragment = graphql(`
  fragment CellarInfo on Cellar {
    __typename
    id
    name
    createdById
    coOwnerIds
    itemCounts {
      __typename
      beer
      wine
      spirit
      coffee
      sake
      tea
      total
    }
  }
`);

export const GetCellarInfoQuery = graphql(
  `
  query GetCellarInfo($cellarId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ...CellarInfo
      ...ActorErrorFields
    }
  }
`,
  [CellarInfoFragment, ActorErrorFieldsFragment],
);

/**
 * One page of a cellar's bottles for the grid. Empty bottles are hidden by
 * `status`'s ACTIVE default (decision 4), so `totalCount` counts what the old
 * grid counted.
 */
export const GetCellarItemsQuery = graphql(
  `
  query GetCellarItems(
    $cellarId: ID!
    $first: Int!
    $after: String
    $types: [ItemType!]
    $sort: CellarItemSort
    $semanticQuery: String
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        items(
          first: $first
          after: $after
          types: $types
          sort: $sort
          semanticQuery: $semanticQuery
        ) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              __typename
              id
              item {
                ...ItemCard
              }
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
 * `/cellars/[cellarId]/edit` — the old `EditCellarQuery` read the cellar and
 * the viewer's friends in one go; friends now come from `myFriends` on the
 * client, and this is the cellar half, with co-owner profiles so a co-owner
 * who is not (or no longer) a friend still shows by name in the picker.
 */
export const GetCellarEditQuery = graphql(
  `
  query GetCellarEdit($cellarId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        name
        privacy
        createdById
        coOwnerIds
        itemCount
        coOwners(first: 100) {
          edges {
            node {
              __typename
              id
              displayName
              avatarUrl
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

/**
 * `/cellars/[cellarId]` — a page the old app never had (it printed the id),
 * kept under decision 2 and drawn with the restored blocks: the cellar's
 * header, a fixed preview of its bottles as `ItemCard`s, and its check-ins.
 * `CheckInRow` comes from `lib/api/cellars.ts`, which `CellarCheckIns`'
 * "Show more" re-reads through `CellarDetailQuery`.
 */
export const GetCellarOverviewQuery = graphql(
  `
  query GetCellarOverview(
    $cellarId: ID!
    $items: Int!
    $checkIns: Int!
    $sort: CellarItemSort
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        ...CellarInfo
        items(first: $items, sort: $sort) {
          totalCount
          edges {
            cursor
            node {
              __typename
              id
              item {
                ...ItemCard
              }
            }
          }
        }
        checkIns(first: $checkIns) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...CheckInRow
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [
    CellarInfoFragment,
    ItemCardFragment,
    CheckInRowFragment,
    ActorErrorFieldsFragment,
  ],
);
