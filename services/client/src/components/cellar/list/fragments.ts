import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import { CellarItemGroupCardFragment } from "../fragments";

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
