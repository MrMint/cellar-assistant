import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * The viewer and the first page of their cellars, for the add page's "Into"
 * row (X05). `myCellars` is ordered by recent activity (D13), so the first
 * one the viewer may add to is the default when nothing is remembered.
 */
export const CaptureCellarsQuery = graphql(
  `
  query CaptureCellars {
    me {
      id
    }
    myCellars(first: 100) {
      __typename
      ... on CellarConnection {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            __typename
            id
            name
            createdById
            coOwnerIds
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
