import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * `/friends` — B4's `UserActor` friend methods and C3's
 * `FriendsCollectionActor`, against the new API (`services/api`).
 *
 * Written as a straight rewrite of the Nhost-era `fragments.ts` rather than an
 * edit to it, per the plan's "delete the replaced server actions" (§6 D2–D8).
 * D8 deleted the original along with `actions.ts`.
 *
 * `@_unmask` on `UserSummaryFragment` is gql.tada's own directive, stripped
 * before the request is sent — it just turns off fragment masking so callers
 * can read `user.displayName` directly instead of threading it through
 * `readFragment`.
 */

export const UserSummaryFragment = graphql(`
  fragment UserSummary on UserProfile @_unmask {
    id
    displayName
    avatarUrl
  }
`);

/**
 * `/friends`' friends list, a page at a time — `FriendsClient` walks it to
 * the end, as the old unbounded subscription read it. `myFriends` returns ids
 * through C3's `FriendsCollectionActor`; `Friend.user` batches those ids
 * through the `UserProfile` DataLoader server-side (plan §1.5) — this query
 * never fetches profiles one at a time.
 */
export const MyFriendsQuery = graphql(
  `
  query MyFriends($first: Int!, $after: String) {
    myFriends(first: $first, after: $after) {
      __typename
      ... on FriendConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            since
            user {
              ...UserSummary
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [UserSummaryFragment, ActorErrorFieldsFragment],
);

/**
 * One direction of `/friends`' requests, a page at a time: `direction` is a
 * required argument on `myFriendRequests`, and incoming and outgoing page
 * independently (each walks to its own end), so they are two lists rather
 * than one aliased query.
 */
export const MyFriendRequestsQuery = graphql(
  `
  query MyFriendRequests(
    $direction: FriendRequestDirection!
    $first: Int!
    $after: String
  ) {
    myFriendRequests(direction: $direction, first: $first, after: $after) {
      __typename
      ... on FriendRequestConnection {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            status
            user {
              ...UserSummary
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [UserSummaryFragment, ActorErrorFieldsFragment],
);

/**
 * Friend search (`UserSearchActor`). Already excludes the viewer, existing
 * friends, and anyone with a request open in either direction — see
 * `UserSearchResult`'s description in `packages/schema/schema.graphql`.
 *
 * A7e gave `userSearch` a result union, so a rejection is a member here rather
 * than an ordinary GraphQL error. Narrow with
 * `unwrapResult(…, "UserSearchConnection")`.
 */
export const UserSearchQuery = graphql(
  `
  query FriendUserSearch($term: String!) {
    userSearch(term: $term, first: 10) {
      __typename
      ... on UserSearchConnection {
        edges {
          node {
            userId
            displayName
            avatarUrl
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
 * Rejected for yourself (`ValidationError`), an existing friend, a request
 * you already sent, or one already sent to you (all `ConflictError`). The
 * three conflicts are told apart by `reason` — `ALREADY_FRIENDS`,
 * `FRIEND_REQUEST_ALREADY_SENT`, `FRIEND_REQUEST_ALREADY_RECEIVED` — which
 * `...ActorErrorFields` selects; see `FriendsClient.tsx`'s
 * `classifySendFriendRequestError`. Never `message`.
 */
export const SendFriendRequestMutation = graphql(
  `
  mutation SendFriendRequest($userId: ID!) {
    sendFriendRequest(userId: $userId) {
      __typename
      ... on FriendRequest {
        id
        status
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const AcceptFriendRequestMutation = graphql(
  `
  mutation AcceptFriendRequestAction($requestId: ID!) {
    acceptFriendRequest(requestId: $requestId) {
      __typename
      ... on AcceptFriendRequestPayload {
        requestId
        friendId
        created
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Cancelling a request you sent, or declining one you got — same field. */
export const RejectFriendRequestMutation = graphql(
  `
  mutation RejectFriendRequestAction($requestId: ID!) {
    rejectFriendRequest(requestId: $requestId) {
      __typename
      ... on RejectFriendRequestPayload {
        requestId
        deleted
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const RemoveFriendMutation = graphql(
  `
  mutation RemoveFriendAction($userId: ID!) {
    removeFriend(userId: $userId) {
      __typename
      ... on RemoveFriendPayload {
        userId
        removed
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
