"use server";

import { graphql, type ResultOf } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation, serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";
import { UserCoreFragment } from "../shared/fragments/user-core";

/**
 * Query for fetching friend data (replaces subscription)
 */
const GetFriendsDataQuery = graphql(`
  query GetFriendsData($id: uuid!) {
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
 * Search for users that can be added as friends
 */
const SearchUsersQuery = graphql(
  `
  query SearchUsersForFriends($search: String, $userId: uuid!) {
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
    }
  }
`,
  [UserCoreFragment],
);

/**
 * Mutations for friend management
 */
const InsertFriendRequestMutation = graphql(`
  mutation InsertFriendRequestAction($friendId: uuid!) {
    insert_friend_requests_one(object: { friend_id: $friendId }) {
      id
    }
  }
`);

const AcceptFriendRequestMutation = graphql(`
  mutation AcceptFriendRequestAction($id: uuid!) {
    update_friend_requests_by_pk(
      pk_columns: { id: $id }
      _set: { status: ACCEPTED }
    ) {
      id
    }
  }
`);

const DeleteFriendRequestMutation = graphql(`
  mutation DeleteFriendRequestAction($id: uuid!) {
    delete_friend_requests_by_pk(id: $id) {
      id
    }
  }
`);

const RemoveFriendMutation = graphql(`
  mutation RemoveFriendAction($userId: uuid!, $friendId: uuid!) {
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

// Export types for use in components
export type FriendsData = ResultOf<typeof GetFriendsDataQuery>;
export type SearchUsersData = ResultOf<typeof SearchUsersQuery>;

/**
 * Fetch current user's friends data
 */
export async function getFriendsData(): Promise<FriendsData> {
  const userId = await getServerUserId();
  return serverQuery(GetFriendsDataQuery, { id: userId });
}

/**
 * Search for users to add as friends
 */
export async function searchUsers(search: string): Promise<SearchUsersData> {
  const userId = await getServerUserId();
  return serverQuery(SearchUsersQuery, {
    search: `%${search}%`,
    userId,
  });
}

/**
 * Send a friend request
 */
export async function insertFriendRequest(friendId: string): Promise<void> {
  await getServerUserId(); // Ensure authenticated
  await serverMutation(InsertFriendRequestMutation, { friendId });
  revalidatePath("/friends");
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  await getServerUserId(); // Ensure authenticated
  await serverMutation(AcceptFriendRequestMutation, { id: requestId });
  revalidatePath("/friends");
}

/**
 * Reject/delete a friend request
 */
export async function rejectFriendRequest(requestId: string): Promise<void> {
  await getServerUserId(); // Ensure authenticated
  await serverMutation(DeleteFriendRequestMutation, { id: requestId });
  revalidatePath("/friends");
}

/**
 * Remove an existing friend
 */
export async function removeFriend(friendId: string): Promise<void> {
  const userId = await getServerUserId();
  await serverMutation(RemoveFriendMutation, { userId, friendId });
  revalidatePath("/friends");
}
