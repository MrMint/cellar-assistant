"use client";

import { readFragment } from "@cellar-assistant/shared";
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
import { concat, isNil, without } from "ramda";
import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { useClient, useQuery, useSubscription } from "urql";
import { DebounceInput } from "@/components/common/DebouncedInput";
import { UserCoreFragment } from "../shared/fragments/user-core";
import {
  AcceptFriendRequestMutation,
  DeleteFriendRequestMutation,
  GetFriendRequestsSubscription,
  InsertFriendRequestMutation,
  RemoveFriendMutation,
  SearchUsersQuery,
} from "./fragments";

type AsyncFn = (id: string) => Promise<void>;

interface FriendsClientProps {
  userId: string;
}

export const FriendsClient = ({ userId }: FriendsClientProps) => {
  if (isNil(userId)) throw new Error("User cannot be null");
  const client = useClient();
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState([] as string[]);
  const [{ data }] = useQuery({
    query: SearchUsersQuery,
    variables: { search: `%${search}%`, userId },
  });

  const [{ data: friendRequests }] = useSubscription({
    query: GetFriendRequestsSubscription,
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
    await client.mutation(InsertFriendRequestMutation, {
      request: { friend_id: id },
    });
  });

  const handleAcceptFriend = track(async (id: string) => {
    await client.mutation(AcceptFriendRequestMutation, { id });
  });

  const handleRejectFriend = track(async (id: string) => {
    await client.mutation(DeleteFriendRequestMutation, { id });
  });

  const handleDeleteFriend = track(async (friendId: string) => {
    await client.mutation(RemoveFriendMutation, { userId, friendId });
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
                    variant="outlined"
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
            {data?.users.map((user) => {
              const userData = readFragment(UserCoreFragment, user);
              return (
                <ListItem variant="outlined" key={userData.id}>
                  <Avatar src={userData.avatarUrl} />
                  <ListItemContent>
                    <Typography level="title-md">
                      {userData.displayName}
                    </Typography>
                  </ListItemContent>
                  <Button
                    color="primary"
                    variant="solid"
                    loading={fetching.includes(userData.id)}
                    onClick={() => handleAddFriend(userData.id)}
                  >
                    Request
                  </Button>
                </ListItem>
              );
            })}
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
