import { graphql } from "../_gql";

export const insertFriendsAndDeleteRequest = graphql(`
  mutation InsertFriends(
    $friends: [friends_insert_input!]!
    $requestId: uuid!
  ) {
    insert_friends(objects: $friends) {
      affected_rows
    }

    delete_friend_requests_by_pk(id: $requestId) {
      id
    }
  }
`);
