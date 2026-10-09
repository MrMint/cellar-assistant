/**
 * X18 — a friend's read-only profile (`/users/[id]`).
 *
 * `friendProfile(userId:)` is the server's gate: it answers a friend, and one
 * `NotFoundError` for anyone else — a stranger, yourself, nobody — so the page
 * turns every refusal into the same in-shell "doesn't exist or isn't shared
 * with you" (D24) and never learns more than the API decided to say.
 *
 * Each section is a connection the API re-gates per call (PUBLIC and FRIENDS
 * tier lists, cellars you could open, their drink log). The page reads the
 * first screenful of each in one round trip; the log pages on with
 * `FriendLogPageQuery`.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Lists and cellars on the page — a profile's worth, not a browser. */
export const PROFILE_SECTION_SIZE = 20;
/** Log entries per page. */
export const PROFILE_LOG_PAGE_SIZE = 10;

/** One entry of a friend's log: what, when, the score, the words, where. */
export const FriendLogEntryFragment = graphql(`
  fragment FriendLogEntry on ItemCheckIn @_unmask {
    __typename
    id
    createdAt
    score
    note
    tags
    companionIds
    companions(first: 3) {
      edges {
        node {
          __typename
          id
          displayName
        }
      }
    }
    place {
      __typename
      id
      name
      displayName
    }
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

export const FriendProfileQuery = graphql(
  `
  query FriendProfile($userId: ID!, $sections: Int!, $logs: Int!) {
    friendProfile(userId: $userId) {
      __typename
      ... on FriendProfile {
        id
        since
        user {
          __typename
          id
          displayName
          avatarUrl
        }
        tierLists(first: $sections) {
          totalCount
          edges {
            node {
              __typename
              id
              name
              itemCount
              privacy
            }
          }
        }
        cellars(first: $sections) {
          totalCount
          edges {
            node {
              __typename
              id
              name
              itemCounts {
                total
              }
            }
          }
        }
        checkIns(first: $logs) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendLogEntry
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, FriendLogEntryFragment],
);

/** The log, from `after` on — the "Show more" under the first page. */
export const FriendLogPageQuery = graphql(
  `
  query FriendLogPage($userId: ID!, $first: Int!, $after: String) {
    friendProfile(userId: $userId) {
      __typename
      ... on FriendProfile {
        id
        checkIns(first: $first, after: $after) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendLogEntry
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, FriendLogEntryFragment],
);
