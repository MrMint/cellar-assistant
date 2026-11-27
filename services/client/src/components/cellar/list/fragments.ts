import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import { CellarCardFragment, CellarItemGroupCardFragment } from "../fragments";

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
