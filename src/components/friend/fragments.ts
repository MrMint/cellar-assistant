import { graphql } from "@cellar-assistant/shared";
import { UserCoreFragment } from "../shared/fragments/user-core";

/**
 * Search results for users that can be added as friends
 * Excludes users who already have pending requests or are friends
 */
export const SearchUsersQuery = graphql(
  `
  query SearchUsers($search: String, $userId: uuid!) {
    users(
      where: {
        _and: [
          { displayName: { _ilike: $search }, id: { _neq: $userId } }
          { _not: { incomingFriendRequests: { user_id: { _eq: $userId } } } }
          { _not: { outgoingFriendRequests: { friend_id: { _eq: $userId } } } }
          { _not: { friends: { friend_id: { _eq: $userId } } } }
        ]
      }
      limit: 10
    ) {
      ...UserCore
      friends {
        friend {
          id
        }
      }
    }
  }
`,
  [UserCoreFragment],
);

/**
 * Complete friends data subscription
 * Includes current friends, incoming and outgoing requests
 */
export const GetFriendRequestsSubscription = graphql(`
  subscription GetFriendRequests($id: uuid!) {
    user(id: $id) {
      id
      outgoingFriendRequests {
        id
        status
        friend {
          id
          displayName
          avatarUrl
        }
      }
      incomingFriendRequests {
        id
        status
        user {
          id
          displayName
          avatarUrl
        }
      }
      friends {
        friend {
          id
          displayName
          avatarUrl
        }
      }
    }
  }
`);

/**
 * Mutations for friend management
 */
export const InsertFriendRequestMutation = graphql(`
  mutation InsertFriendRequest($request: friend_requests_insert_input!) {
    insert_friend_requests_one(object: $request) {
      id
    }
  }
`);

export const AcceptFriendRequestMutation = graphql(`
  mutation AcceptFriendRequest($id: uuid!) {
    update_friend_requests_by_pk(
      pk_columns: { id: $id }
      _set: { status: ACCEPTED }
    ) {
      id
    }
  }
`);

export const DeleteFriendRequestMutation = graphql(`
  mutation DeleteFriendRequest($id: uuid!) {
    delete_friend_requests_by_pk(id: $id) {
      id
    }
  }
`);

export const RemoveFriendMutation = graphql(`
  mutation RemoveFriend($userId: uuid!, $friendId: uuid!) {
    mine: delete_friends_by_pk(user_id: $userId, friend_id: $friendId) {
      user_id
      friend_id
    }
    theirs: delete_friends_by_pk(user_id: $friendId, friend_id: $userId) {
      user_id
      friend_id
    }
  }
`);
