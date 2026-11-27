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

/**
 * Lists and cellars per page: the first screenful, then "Show more" walks
 * on (leftovers 6). Well under the server's cap (`MAX_PAGE_SIZE`, 100), which
 * clamps anything larger rather than refusing it.
 */
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
    recipe {
      __typename
      id
      name
    }
  }
`);

/** One of their tier lists, as the profile lists it. */
export const FriendTierListRowFragment = graphql(`
  fragment FriendTierListRow on TierList @_unmask {
    __typename
    id
    name
    itemCount
    privacy
  }
`);

/** One of their cellars, as the profile lists it. */
export const FriendCellarRowFragment = graphql(`
  fragment FriendCellarRow on Cellar @_unmask {
    __typename
    id
    name
    itemCounts {
      total
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
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendTierListRow
            }
          }
        }
        cellars(first: $sections) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendCellarRow
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
  [
    ActorErrorFieldsFragment,
    FriendLogEntryFragment,
    FriendTierListRowFragment,
    FriendCellarRowFragment,
  ],
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

/** Their tier lists, from `after` on — "Show more" under the first 20. */
export const FriendTierListsPageQuery = graphql(
  `
  query FriendTierListsPage($userId: ID!, $first: Int!, $after: String) {
    friendProfile(userId: $userId) {
      __typename
      ... on FriendProfile {
        id
        tierLists(first: $first, after: $after) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendTierListRow
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, FriendTierListRowFragment],
);

/** Their cellars, from `after` on — "Show more" under the first 20. */
export const FriendCellarsPageQuery = graphql(
  `
  query FriendCellarsPage($userId: ID!, $first: Int!, $after: String) {
    friendProfile(userId: $userId) {
      __typename
      ... on FriendProfile {
        id
        cellars(first: $first, after: $after) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...FriendCellarRow
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, FriendCellarRowFragment],
);

/**
 * Who someone is, for a profile you may not open (Social-Friends 17, 18): the
 * name and picture any signed-in viewer may see (`user(id:)`), so a
 * non-friend's page can offer Add friend. One `NotFoundError` for an id that
 * names nobody, so the page cannot say more than that.
 */
export const PersonQuery = graphql(
  `
  query Person($userId: ID!) {
    user(id: $userId) {
      __typename
      ... on UserProfile {
        id
        displayName
        avatarUrl
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
