import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Compare rows per page: a friend's whole overlap is usually one page. */
export const COMPARE_PAGE_SIZE = 50;

/** One compare row: the drink, my score and theirs (MC-compare, L11). */
export const TasteCompareRowFragment = graphql(`
  fragment TasteCompareRowFields on TasteCompareRow @_unmask {
    myScore
    theirScore
    item {
      __typename
      id
      type
      name
      ... on Wine {
        vintage
      }
      ... on Sake {
        vintageYear
      }
    }
  }
`);

/**
 * MC-compare: the drinks you and this friend both rated, biggest gap first.
 * A non-friend, a missing user and a malformed id all answer with no rows,
 * so nothing here can show a stranger's scores.
 */
export const TasteCompareQuery = graphql(
  `
    query TasteCompare(
      $userId: ID!
      $itemType: ItemType
      $first: Int!
      $after: String
    ) {
      tasteCompare(userId: $userId, itemType: $itemType) {
        __typename
        ... on TasteCompare {
          rows(first: $first, after: $after) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              cursor
              node {
                ...TasteCompareRowFields
              }
            }
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment, TasteCompareRowFragment],
);
