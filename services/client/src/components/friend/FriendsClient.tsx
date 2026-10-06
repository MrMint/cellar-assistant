"use client";

import {
  Alert,
  Button,
  Card,
  Grid,
  List,
  ListItem,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { useEffect, useRef, useState } from "react";
import { MdDelete } from "react-icons/md";
import { useMutation, useQuery } from "urql";
import { DebounceInput } from "@/components/common/DebouncedInput";
import type { ActorErrorReason } from "@/lib/api/errors";
import type { ResultOf } from "@/lib/api/graphql";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { useWholeConnection } from "@/lib/paging/use-whole-connection";
import { UserAvatar } from "../common/UserAvatar";
import {
  AcceptFriendRequestMutation,
  MyFriendRequestsQuery,
  MyFriendsQuery,
  RejectFriendRequestMutation,
  RemoveFriendMutation,
  SendFriendRequestMutation,
  UserSearchQuery,
} from "./fragments";

/** How often the friends and requests lists refresh in the background — there
 * is no subscription in the new stack (plan §6 D8: "polling replaces the
 * subscription"). A mutation also forces an immediate refresh, so this is
 * only for the other side's actions (a friend accepting, say). */
const POLL_INTERVAL_MS = 15_000;
/**
 * The API's page cap. Each list is walked to its end — the old page read all
 * three unbounded off one subscription, so a page here is a request size, not
 * a limit on what shows.
 */
const PAGE_SIZE = 100;

type SearchResult = ResultOf<typeof UserSearchQuery>;

/** Every friend, walked page by page to the end. */
const useAllFriends = () =>
  useWholeConnection({
    query: MyFriendsQuery,
    variables: (after) => ({ first: PAGE_SIZE, after }),
    select: (data) =>
      pageOf(unwrapResult(data?.myFriends, "FriendConnection"), (edge) => ({
        since: edge.node.since,
        user: edge.node.user,
      })),
    pageSize: PAGE_SIZE,
  });

/** Every request in one direction, walked page by page to the end. */
const useAllFriendRequests = (direction: "INCOMING" | "OUTGOING") =>
  useWholeConnection({
    query: MyFriendRequestsQuery,
    variables: (after) => ({ direction, first: PAGE_SIZE, after }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.myFriendRequests, "FriendRequestConnection"),
        (edge) => edge.node,
      ),
    pageSize: PAGE_SIZE,
  });

/**
 * A list's read failed — the first page, or one partway through the walk
 * (the rows read so far stay above it). The next poll re-reads anyway; Retry
 * is for not waiting.
 */
const ListFailure = ({
  failure,
  onRetry,
}: {
  failure: ApiFailure | null;
  onRetry: () => void;
}) =>
  failure === null ? null : (
    <Alert
      color="danger"
      variant="soft"
      size="sm"
      endDecorator={
        <Button size="sm" variant="plain" color="danger" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {failure.message}
    </Alert>
  );

/**
 * `sendFriendRequest` rejects four cases (plan's D8 brief): to yourself
 * (`ValidationError`), an existing friend, a request you already sent, and a
 * request already sent to you — the last three are all `ConflictError`, so
 * `code` cannot tell them apart and `reason` (B4b) does. The fourth gets
 * special handling: it should offer the accept action rather than read as a
 * dead end.
 *
 * This used to substring-match the actor's English `message`, which is the
 * exact bug `reason` was added to the contract to fix — a reworded sentence in
 * `user-actor.ts` would silently have turned "Accept their request" into a
 * dead-end error. An unrecognised or absent `reason` is "other": the enum is
 * additive, so a newer API may send one this build does not know.
 */
const classifySendFriendRequestError = (
  reason: ActorErrorReason | null,
):
  | "self"
  | "already-friends"
  | "pending-outgoing"
  | "pending-incoming"
  | "other" => {
  switch (reason) {
    case "CANNOT_FRIEND_SELF":
      return "self";
    case "ALREADY_FRIENDS":
      return "already-friends";
    case "FRIEND_REQUEST_ALREADY_RECEIVED":
      return "pending-incoming";
    case "FRIEND_REQUEST_ALREADY_SENT":
      return "pending-outgoing";
    default:
      return "other";
  }
};

/**
 * Polls both list queries on an interval, forcing a network fetch each time —
 * there is no subscription transport in the new stack, and a mutation on
 * *this* viewer's own actions already triggers an immediate refresh via
 * `refreshLists`. This is for the other side: a friend accepting or removing
 * you shows up within one interval instead of only on next page load.
 */
const usePolledRefresh = (refresh: () => void) => {
  const savedRefresh = useRef(refresh);
  savedRefresh.current = refresh;

  useEffect(() => {
    const id = window.setInterval(() => {
      savedRefresh.current();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
};

export const FriendsClient = () => {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [banner, setBanner] = useState<{
    color: "danger" | "warning";
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);

  const friendsList = useAllFriends();
  const incomingList = useAllFriendRequests("INCOMING");
  const outgoingList = useAllFriendRequests("OUTGOING");
  const [searchResult, reexecuteSearch] = useQuery({
    query: UserSearchQuery,
    variables: { term: searchTerm },
    pause: searchTerm.trim().length === 0,
  });

  const refreshLists = () => {
    friendsList.refresh();
    incomingList.refresh();
    outgoingList.refresh();
  };

  usePolledRefresh(refreshLists);

  const [, sendFriendRequest] = useMutation(SendFriendRequestMutation);
  const [, acceptFriendRequest] = useMutation(AcceptFriendRequestMutation);
  const [, rejectFriendRequest] = useMutation(RejectFriendRequestMutation);
  const [, removeFriend] = useMutation(RemoveFriendMutation);

  const withPending = async (id: string, action: () => Promise<void>) => {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await action();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const incoming = incomingList.rows;
  const outgoing = outgoingList.rows;

  const handleSendRequest = (userId: string) => {
    void withPending(userId, async () => {
      const result = await sendFriendRequest({ userId });
      const payload = result.data?.sendFriendRequest;

      if (payload?.__typename === "FriendRequest") {
        setBanner(null);
        refreshLists();
        reexecuteSearch({ requestPolicy: "network-only" });
        return;
      }
      if (payload !== undefined && "code" in payload) {
        const kind = classifySendFriendRequestError(payload.reason);
        if (kind === "pending-incoming") {
          const existing = incoming.find((row) => row.user.id === userId);
          setBanner({
            color: "warning",
            message: payload.message,
            action:
              existing === undefined
                ? undefined
                : {
                    label: "Accept their request",
                    onClick: () => handleAccept(existing.id),
                  },
          });
        } else {
          setBanner({ color: "danger", message: payload.message });
        }
        return;
      }
      setBanner({
        color: "danger",
        message: result.error?.message ?? "Something went wrong.",
      });
    });
  };

  const handleAccept = (requestId: string) => {
    void withPending(requestId, async () => {
      const result = await acceptFriendRequest({ requestId });
      const payload = result.data?.acceptFriendRequest;
      if (payload?.__typename === "AcceptFriendRequestPayload") {
        setBanner(null);
        refreshLists();
        return;
      }
      setBanner({
        color: "danger",
        message:
          (payload !== undefined && "message" in payload
            ? payload.message
            : undefined) ??
          result.error?.message ??
          "Couldn't accept that request.",
      });
    });
  };

  const handleReject = (requestId: string) => {
    void withPending(requestId, async () => {
      const result = await rejectFriendRequest({ requestId });
      const payload = result.data?.rejectFriendRequest;
      if (payload?.__typename === "RejectFriendRequestPayload") {
        setBanner(null);
        refreshLists();
        return;
      }
      setBanner({
        color: "danger",
        message:
          (payload !== undefined && "message" in payload
            ? payload.message
            : undefined) ??
          result.error?.message ??
          "Couldn't update that request.",
      });
    });
  };

  const handleRemove = (userId: string) => {
    void withPending(userId, async () => {
      const result = await removeFriend({ userId });
      const payload = result.data?.removeFriend;
      if (payload?.__typename === "RemoveFriendPayload") {
        setBanner(null);
        refreshLists();
        return;
      }
      setBanner({
        color: "danger",
        message:
          (payload !== undefined && "message" in payload
            ? payload.message
            : undefined) ??
          result.error?.message ??
          "Couldn't remove that friend.",
      });
    });
  };

  const friendRows = friendsList.rows;

  // A7e made `userSearch` a result union; narrowed the same way `myFriends`
  // above already is, so a refusal shows an empty list rather than crashing.
  const searchData: SearchResult | undefined = searchResult.data;
  const searchRows =
    searchData?.userSearch.__typename === "UserSearchConnection"
      ? searchData.userSearch.edges
      : [];
  const alreadyRequestedOrFriends = new Set([
    ...friendRows.map((row) => row.user.id),
    ...incoming.map((row) => row.user.id),
    ...outgoing.map((row) => row.user.id),
  ]);

  return (
    <Grid container spacing={2} justifyContent="center">
      {banner !== null && (
        <Grid xs={12}>
          <Alert
            color={banner.color}
            variant="soft"
            endDecorator={
              banner.action === undefined ? undefined : (
                <Button
                  size="sm"
                  variant="solid"
                  onClick={banner.action.onClick}
                >
                  {banner.action.label}
                </Button>
              )
            }
          >
            {banner.message}
          </Alert>
        </Grid>
      )}

      <Grid xs={12} lg={4}>
        <Card>
          <Typography level="title-lg">Friends</Typography>
          <ListFailure
            failure={friendsList.failure}
            onRetry={friendsList.retry}
          />
          <List size="lg">
            {friendRows.length === 0 && !friendsList.loading && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No friends yet. Search for users to add friends.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {friendRows.map((row) => (
              <ListItem variant="outlined" key={row.user.id}>
                <UserAvatar
                  avatarUrl={row.user.avatarUrl}
                  displayName={row.user.displayName}
                />
                <ListItemContent>
                  <Typography level="title-md">
                    {row.user.displayName}
                  </Typography>
                </ListItemContent>
                <Button
                  startDecorator={<MdDelete />}
                  color="danger"
                  variant="outlined"
                  loading={pendingIds.has(row.user.id)}
                  onClick={() => handleRemove(row.user.id)}
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
            handleDebounce={setSearchTerm}
          />
          <List size="lg">
            {searchRows
              .filter(
                (edge) => !alreadyRequestedOrFriends.has(edge.node.userId),
              )
              .map((edge) => (
                <ListItem variant="outlined" key={edge.node.userId}>
                  <UserAvatar
                    avatarUrl={edge.node.avatarUrl}
                    displayName={edge.node.displayName}
                  />
                  <ListItemContent>
                    <Typography level="title-md">
                      {edge.node.displayName}
                    </Typography>
                  </ListItemContent>
                  <Button
                    color="primary"
                    variant="solid"
                    loading={
                      pendingIds.has(edge.node.userId) || searchResult.fetching
                    }
                    onClick={() => handleSendRequest(edge.node.userId)}
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
          <ListFailure
            failure={incomingList.failure}
            onRetry={incomingList.retry}
          />
          <List size="lg">
            {incoming.length === 0 && !incomingList.loading && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No incoming requests.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {incoming.map((row) => (
              <ListItem variant="outlined" key={row.id}>
                <UserAvatar
                  avatarUrl={row.user.avatarUrl}
                  displayName={row.user.displayName}
                />
                <ListItemContent>
                  <Typography level="title-md">
                    {row.user.displayName}
                  </Typography>
                </ListItemContent>
                <Button
                  color="danger"
                  variant="solid"
                  loading={pendingIds.has(row.id)}
                  onClick={() => handleReject(row.id)}
                >
                  Reject
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  loading={pendingIds.has(row.id)}
                  onClick={() => handleAccept(row.id)}
                >
                  Accept
                </Button>
              </ListItem>
            ))}
          </List>
          <Typography level="title-lg">Outgoing Requests</Typography>
          <ListFailure
            failure={outgoingList.failure}
            onRetry={outgoingList.retry}
          />
          <List size="lg">
            {outgoing.length === 0 && !outgoingList.loading && (
              <ListItem>
                <ListItemContent>
                  <Typography level="body-sm" sx={{ color: "neutral.500" }}>
                    No outgoing requests.
                  </Typography>
                </ListItemContent>
              </ListItem>
            )}
            {outgoing.map((row) => (
              <ListItem variant="outlined" key={row.id}>
                <UserAvatar
                  avatarUrl={row.user.avatarUrl}
                  displayName={row.user.displayName}
                />
                <ListItemContent>
                  <Typography level="title-md">
                    {row.user.displayName}
                  </Typography>
                </ListItemContent>
                <Button
                  color="danger"
                  variant="outlined"
                  loading={pendingIds.has(row.id)}
                  onClick={() => handleReject(row.id)}
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
