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
import { useState, useTransition } from "react";
import { MdDelete } from "react-icons/md";
import { DebounceInput } from "@/components/common/DebouncedInput";
import { UserCoreFragment } from "../shared/fragments/user-core";
import {
  acceptFriendRequest,
  type FriendsData,
  insertFriendRequest,
  rejectFriendRequest,
  removeFriend,
  searchUsers,
  type SearchUsersData,
} from "./actions";

interface FriendsClientProps {
  initialData: FriendsData;
}

export const FriendsClient = ({ initialData }: FriendsClientProps) => {
  const [, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<SearchUsersData | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);

  const user = initialData.user;

  const withPending = (id: string, action: () => Promise<void>) => {
    startTransition(async () => {
      setPendingIds((prev) => new Set(prev).add(id));
      try {
        await action();
        // revalidatePath in server actions triggers refresh automatically
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  };

  const handleSearch = async (search: string) => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchUsers(search);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = (id: string) => {
    withPending(id, async () => {
      await insertFriendRequest(id);
      // Remove the user from search results after sending request
      setSearchResults((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.filter((u) => {
                const userData = readFragment(UserCoreFragment, u);
                return userData.id !== id;
              }),
            }
          : null,
      );
    });
  };

  const handleAcceptFriend = (id: string) => {
    withPending(id, () => acceptFriendRequest(id));
  };

  const handleRejectFriend = (id: string) => {
    withPending(id, () => rejectFriendRequest(id));
  };

  const handleDeleteFriend = (friendId: string) => {
    withPending(friendId, () => removeFriend(friendId));
  };

  return (
    <Grid container spacing={2} justifyContent="center">
      <Grid xs={12} lg={4}>
        <Card>
          <Typography level="title-lg">Friends</Typography>
          <List size="lg">
            {user?.friends.length === 0 && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No friends yet. Search for users to add friends.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {user?.friends
              .map((x) => x.friend)
              .map((x) => (
                <ListItem variant="outlined" key={x.id}>
                  <Avatar src={x.avatarUrl ?? undefined} />
                  <ListItemContent>
                    <Typography level="title-md">{x.displayName}</Typography>
                  </ListItemContent>
                  <Button
                    startDecorator={<MdDelete />}
                    color="danger"
                    variant="outlined"
                    loading={pendingIds.has(x.id)}
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
            handleDebounce={handleSearch}
          />
          <List size="lg">
            {searchResults?.users.map((user) => {
              const userData = readFragment(UserCoreFragment, user);
              return (
                <ListItem variant="outlined" key={userData.id}>
                  <Avatar src={userData.avatarUrl ?? undefined} />
                  <ListItemContent>
                    <Typography level="title-md">
                      {userData.displayName}
                    </Typography>
                  </ListItemContent>
                  <Button
                    color="primary"
                    variant="solid"
                    loading={pendingIds.has(userData.id) || isSearching}
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
            {user?.incomingFriendRequests.length === 0 && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No incoming requests.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {user?.incomingFriendRequests.map((x) => (
              <ListItem variant="outlined" key={x.id}>
                <Avatar src={x.user.avatarUrl ?? undefined} />
                <ListItemContent>
                  <Typography level="title-md">{x.user.displayName}</Typography>
                </ListItemContent>
                <Button
                  color="danger"
                  variant="solid"
                  loading={pendingIds.has(x.id)}
                  onClick={() => handleRejectFriend(x.id)}
                >
                  Reject
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  loading={pendingIds.has(x.id)}
                  onClick={() => handleAcceptFriend(x.id)}
                >
                  Accept
                </Button>
              </ListItem>
            ))}
          </List>
          <Typography level="title-lg">Outgoing Requests</Typography>
          <List size="lg">
            {user?.outgoingFriendRequests.length === 0 && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No outgoing requests.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {user?.outgoingFriendRequests.map((x) => (
              <ListItem variant="outlined" key={x.id}>
                <Avatar src={x.friend.avatarUrl ?? undefined} />
                <ListItemContent>
                  <Typography level="title-md">
                    {x.friend.displayName}
                  </Typography>
                </ListItemContent>
                <Button
                  color="danger"
                  variant="outlined"
                  loading={pendingIds.has(x.id)}
                  onClick={() => handleRejectFriend(x.id)}
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
