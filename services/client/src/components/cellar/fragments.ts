/**
 * The restored cellars pages' documents — the new-schema successor of
 * `82450ad1:src/components/cellar/fragments.ts` and `queries.ts`.
 *
 * Old (`82450ad1`) selection → new field:
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
 *   the default) with a sort — and since X04 `Cellar.itemGroups`, which groups
 *   identical bottles (×N) and whose `search` **narrows** (names, then near
 *   meanings) where the old semantic sort re-ordered everything.
 * - the six per-type item fragments → `...ItemCard` on `CellarItem.item`.
 *
 * Fragment and operation names are distinct from `lib/api/cellars.ts`'s.
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
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

/**
 * `/cellars` — one page of one section: Yours, From friends or Discover
 * (`section`, decision D2). Without a section `myCellars` is everything the
 * viewer may see, strangers' PUBLIC cellars included.
 */
export const GetCellarsQuery = graphql(
  `
  query GetCellars(
    $first: Int!
    $after: String
    $section: CollectionSection
  ) {
    myCellars(first: $first, after: $after, section: $section) {
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
    finishedCount
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
 * One bottle on a `BottleCard` (N13b): the item's card fields, plus what the
 * bottle itself knows — opened when, finished when, how full — and its own
 * chosen photo (G15), which beats the item's first image. The same fields
 * `CellarItemRow` (`lib/api/cellars.ts`) reads for the bottle page; nothing
 * here is new to the schema.
 */
export const CellarBottleCardFragment = graphql(
  `
  fragment CellarBottleCard on CellarItem {
    __typename
    id
    createdAt
    openAt
    emptyAt
    percentageRemaining
    displayImage {
      __typename
      id
      placeholder
      file {
        __typename
        id
        url
      }
    }
    item {
      ...ItemCard
    }
  }
`,
  [ItemCardFragment],
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
 * X04's ×N: one grid cell — every bottle of one item, led by the bottle the
 * list's order put highest. `match` says how a search found it.
 */
export const CellarItemGroupCardFragment = graphql(
  `
  fragment CellarItemGroupCard on CellarItemGroup {
    __typename
    count
    openCount
    match
    lead {
      ...CellarBottleCard
    }
  }
`,
  [CellarBottleCardFragment],
);

/**
 * The grid's pages (X04): `Cellar.itemGroups` — grouped, and narrowed by a
 * search rather than re-sorted. `bottleCount` and `meaning` describe the
 * whole list, for the line above it.
 */
export const GetCellarItemGroupsQuery = graphql(
  `
  query GetCellarItemGroups(
    $cellarId: ID!
    $first: Int!
    $after: String
    $types: [ItemType!]
    $sort: CellarItemSort
    $status: CellarItemStatus
    $search: String
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        itemGroups(
          first: $first
          after: $after
          types: $types
          sort: $sort
          status: $status
          search: $search
        ) {
          totalCount
          bottleCount
          meaning
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...CellarItemGroupCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemGroupCardFragment, ActorErrorFieldsFragment],
);

/**
 * One finished bottle in the diary (X04): the card's fields, plus your own
 * logs from it — never anyone else's notes.
 */
export const CellarDiaryEntryFragment = graphql(
  `
  fragment CellarDiaryEntry on CellarItemGroup {
    __typename
    lead {
      ...CellarBottleCard
      myLog {
        __typename
        count
        lastAt
        lastScore
        lastNote
      }
    }
  }
`,
  [CellarBottleCardFragment],
);

/** The Finished diary's pages: one entry per bottle, latest finished first. */
export const GetCellarDiaryQuery = graphql(
  `
  query GetCellarDiary(
    $cellarId: ID!
    $first: Int!
    $after: String
    $types: [ItemType!]
    $search: String
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        itemGroups(
          first: $first
          after: $after
          types: $types
          status: EMPTY
          sort: FINISHED_DESC
          search: $search
          group: false
        ) {
          totalCount
          meaning
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...CellarDiaryEntry
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarDiaryEntryFragment, ActorErrorFieldsFragment],
);

/**
 * The top of the cellar page (X04, D3): the dashboard's numbers, the "Open
 * now" shelf (open bottles, the most recently opened first) and the
 * "Recently added" one. One request with the header's `CellarInfo`.
 */
export const GetCellarHomeQuery = graphql(
  `
  query GetCellarHome(
    $cellarId: ID!
    $timeZone: String
    $shelf: Int!
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        ...CellarInfo
        dashboard(timeZone: $timeZone) {
          __typename
          bottleCount
          openCount
          almostEmptyCount
          almostEmptyAt
          finishedThisMonth
          finishedCount
          addedRecently
          recentDays
          logsByMonth
          currentMonth
          timeZone
        }
        openNow: itemGroups(
          first: $shelf
          status: OPEN
          sort: OPENED_DESC
          group: false
        ) {
          totalCount
          edges {
            cursor
            node {
              ...CellarItemGroupCard
            }
          }
        }
        recent: itemGroups(first: $shelf, status: ACTIVE, sort: ADDED_DESC) {
          totalCount
          edges {
            cursor
            node {
              ...CellarItemGroupCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarInfoFragment, CellarItemGroupCardFragment, ActorErrorFieldsFragment],
);

/**
 * X04's fan-out: the same phrase asked of your other cellars, by name —
 * "Lagavulin is in Bar Cart".
 */
export const CellarSearchElsewhereQuery = graphql(
  `
  query CellarSearchElsewhere(
    $search: String!
    $excludeCellarId: ID
    $first: Int!
  ) {
    cellarSearchElsewhere(
      search: $search
      excludeCellarId: $excludeCellarId
      first: $first
    ) {
      __typename
      ... on CellarSearchElsewhereConnection {
        totalCount
        edges {
          cursor
          node {
            __typename
            cellar {
              __typename
              id
              name
            }
            group {
              ...CellarItemGroupCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemGroupCardFragment, ActorErrorFieldsFragment],
);

/**
 * L02: this cellar's Drink soon — opened bottles past their typical days and
 * sealed ones whose window closes within three months, ranked by the server
 * (`Cellar.drinkSoon`). Owner-only: anyone else gets an empty page.
 */
export const CellarDrinkSoonQuery = graphql(
  `
  query CellarDrinkSoon($cellarId: ID!, $first: Int!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        drinkSoon(first: $first) {
          totalCount
          edges {
            node {
              reason
              urgency
              openDays
              openLifeFromDays
              openLifeUntilDays
              typicalFor
              window {
                until
                untilSource
              }
              bottle {
                __typename
                id
                cellarId
                item {
                  __typename
                  id
                  type
                  name
                  ... on Wine {
                    vintage
                  }
                }
              }
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

/* C1: the cellar list and the cellars index (components/cellar/list). */

/**
 * One tile of the cellar list: the grid cell (`CellarItemGroupCard`) plus
 * the owner's own note and when it was written, for the wide note tile
 * (combined-05). The note is the owner's review of the item, never anyone
 * else's.
 */
export const CellarListGroupFragment = graphql(
  `
  fragment CellarListGroup on CellarItemGroup {
    __typename
    ...CellarItemGroupCard
    lead {
      __typename
      id
      openAt
      item {
        __typename
        id
        myReview {
          __typename
          id
          text
          updatedAt
        }
      }
    }
  }
`,
  [CellarItemGroupCardFragment],
);

/**
 * The whole list, a page at a time: the server page reads every page
 * (`loadWholeCellar`), because the arrangements the board draws (by maker,
 * by style, my rating, jump to a letter) need every bottle and the API sorts
 * by none of them.
 */
export const GetCellarListQuery = graphql(
  `
  query GetCellarList(
    $cellarId: ID!
    $first: Int!
    $after: String
    $status: CellarItemStatus
    $search: String
  ) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        itemGroups(
          first: $first
          after: $after
          sort: NAME_ASC
          status: $status
          search: $search
        ) {
          totalCount
          bottleCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...CellarListGroup
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarListGroupFragment, ActorErrorFieldsFragment],
);

/** MC-drafts: how many of this cellar's bottles still need details. */
export const CellarNeedsDetailsCountQuery = graphql(`
  query CellarNeedsDetailsCount($cellarId: ID!) {
    needsDetailsCount(cellarId: $cellarId)
  }
`);

/**
 * One card of the cellars index (lot-cellars-shelves-01): the old grid card
 * (name, owners, per-kind counts), how many bottles are open, and the four
 * newest bottles for the card's mosaic (a photo, else the label plate).
 */
export const CellarIndexCardFragment = graphql(
  `
  fragment CellarIndexCard on Cellar {
    __typename
    ...CellarGridCard
    open: itemGroups(first: 1, status: OPEN) {
      bottleCount
    }
    recent: itemGroups(first: 4, sort: ADDED_DESC) {
      edges {
        node {
          ...CellarItemGroupCard
        }
      }
    }
  }
`,
  [CellarCardFragment, CellarItemGroupCardFragment],
);

/** `/cellars`: one page of one section (Yours, From friends, Discover). */
export const GetCellarIndexQuery = graphql(
  `
  query GetCellarIndex(
    $first: Int!
    $after: String
    $section: CollectionSection
  ) {
    myCellars(first: $first, after: $after, section: $section) {
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
            ...CellarIndexCard
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarIndexCardFragment, ActorErrorFieldsFragment],
);
