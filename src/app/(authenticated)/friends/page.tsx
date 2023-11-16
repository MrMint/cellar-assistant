"use client";

import {
  Avatar,
  Button,
  Card,
  Grid,
  List,
  ListItem,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { concat, isNil, without } from "ramda";
import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { useClient, useQuery, useSubscription } from "urql";
import { DebounceInput } from "@/components/common/DebouncedInput";

const searchUsersQuery = graphql(`
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
      id
      displayName
      avatarUrl
      friends {
        friend {
          id
        }
      }
    }
  }
`);

const insertFriendRequestMutation = graphql(`
  mutation InsertFriendRequest($request: friend_requests_insert_input!) {
    insert_friend_requests_one(object: $request) {
      id
    }
  }
`);

const acceptFriendRequestMutation = graphql(`
  mutation AcceptFriendRequest($id: uuid!) {
    update_friend_requests_by_pk(
      pk_columns: { id: $id }
      _set: { status: ACCEPTED }
    ) {
      id
    }
  }
`);

const deleteFriendRequestMutation = graphql(`
  mutation DeleteFriendRequest($id: uuid!) {
    delete_friend_requests_by_pk(id: $id) {
      id
    }
  }
`);

const getFriendRequests = graphql(`
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

const removeFriend = graphql(`
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

type AsyncFn = (id: string) => Promise<void>;

const EditProfile = () => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("User cannot be null");
  const client = useClient();
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(new Array<string>());
  const [{ data }] = useQuery({
    query: searchUsersQuery,
    variables: { search: `%${search}%`, userId },
  });

  const [{ data: friendRequests }] = useSubscription({
    query: getFriendRequests,
    variables: { id: userId },
  });

  const track =
    <T extends AsyncFn>(call: T): ((id: string) => Promise<void>) =>
    async (id: string) => {
      setFetching(concat([id], fetching));
      await call(id);
      setFetching(without([id], fetching));
    };

  const handleAddFriend = track(async (id: string) => {
    await client.mutation(insertFriendRequestMutation, {
      request: { friend_id: id },
    });
  });

  const handleAcceptFriend = track(async (id: string) => {
    await client.mutation(acceptFriendRequestMutation, { id });
  });

  const handleRejectFriend = track(async (id: string) => {
    await client.mutation(deleteFriendRequestMutation, { id });
  });

  const handleDeleteFriend = track(async (friendId: string) => {
    await client.mutation(removeFriend, { userId, friendId });
  });

  return (
    <Grid container spacing={2} justifyContent="center">
      <Grid xs={12} lg={4}>
        <Card>
          <Typography level="title-lg">Friends</Typography>
          <List size="lg">
            {friendRequests?.user?.friends
              .map((x) => x.friend)
              .map((x) => (
                <ListItem variant="outlined" key={x.id}>
                  <Avatar src={x.avatarUrl} />
                  <ListItemContent>
                    <Typography level="title-md">{x.displayName}</Typography>
                  </ListItemContent>
                  <Button
                    startDecorator={<MdDelete />}
                    color="danger"
                    variant="solid"
                    loading={fetching.includes(x.id)}
                    onClick={() => handleDeleteFriend(x.id)}
                  >
                    Remove
                  </Button>
                </ListItem>
              ))}
          </List>
        </Card>
      </Grid>
      <Grid xs={12} lg={4}>
        <Card>
          <Typography level="title-lg">Add Friends</Typography>
          <DebounceInput
            size="lg"
            placeholder="Search for users by name..."
            debounceTimeout={500}
            handleDebounce={setSearch}
          />
          <List size="lg">
            {data?.users.map((user) => (
              <ListItem variant="outlined" key={user.id}>
                <Avatar src={user.avatarUrl} />
                <ListItemContent>
                  <Typography level="title-md">{user.displayName}</Typography>
                </ListItemContent>
                <Button
                  color="primary"
                  variant="solid"
                  loading={fetching.includes(user.id)}
                  onClick={() => handleAddFriend(user.id)}
                >
                  Request
                </Button>
              </ListItem>
            ))}
          </List>
        </Card>
      </Grid>
      <Grid xs={12} lg={4}>
        <Card>
          <Typography level="title-lg">Incoming Requests</Typography>
          <List size="lg">
            {friendRequests?.user?.incomingFriendRequests.map((x) => (
              <ListItem variant="outlined" key={x.id}>
                <Avatar src={x.user.avatarUrl} />
                <ListItemContent>
                  <Typography level="title-md">{x.user.displayName}</Typography>
                </ListItemContent>
                <Button
                  color="danger"
                  variant="solid"
                  loading={fetching.includes(x.id)}
                  onClick={() => handleRejectFriend(x.id)}
                >
                  Reject
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  loading={fetching.includes(x.id)}
                  onClick={() => handleAcceptFriend(x.id)}
                >
                  Accept
                </Button>
              </ListItem>
            ))}
          </List>
          <Typography level="title-lg">Outgoing Requests</Typography>
          <List size="lg">
            {friendRequests?.user?.outgoingFriendRequests.map((x) => (
              <ListItem variant="outlined" key={x.id}>
                <Avatar src={x.friend.avatarUrl} />
                <ListItemContent>
                  <Typography level="title-md">
                    {x.friend.displayName}
                  </Typography>
                </ListItemContent>
                <Button
                  disabled
                  color="primary"
                  variant="solid"
                  loading={fetching.includes(x.id)}
                  onClick={() => handleAcceptFriend(x.id)}
                >
                  Cancel
                </Button>
              </ListItem>
            ))}
          </List>
        </Card>
      </Grid>
    </Grid>
  );
};

export default EditProfile;
