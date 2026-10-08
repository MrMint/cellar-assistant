"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import {
  Delete,
  ErrorIcon,
  ICON_STROKE,
  Warning,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { UserAvatar } from "@/components/app/UserAvatar";
import { SearchField } from "@/components/shell/SearchField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActorErrorReason } from "@/lib/api/errors";
import type { ResultOf } from "@/lib/api/graphql";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { useWholeConnection } from "@/lib/paging/use-whole-connection";
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
      variant="destructive"
      className="flex items-center gap-3 border-destructive/40"
    >
      <ErrorIcon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-4 shrink-0"
      />
      <span className="type-callout flex-1">{failure.message}</span>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={onRetry}
      >
        Retry
      </Button>
    </Alert>
  );

/** A pending-aware button: disabled with a spinner while its row's call runs. */
const RowButton = ({
  pending,
  variant,
  onClick,
  icon,
  children,
}: {
  pending: boolean;
  variant?: "default" | "destructive";
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Button
    variant={variant}
    disabled={pending}
    aria-busy={pending || undefined}
    onClick={onClick}
  >
    {pending ? <Spinner aria-hidden /> : icon}
    {children}
  </Button>
);

/** A titled panel: one of the three columns from `lg` up. */
const Panel = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
    <h2 className="type-headline">{title}</h2>
    {children}
  </section>
);

/** A person row: avatar, name, then the row's actions. */
const PersonRow = ({
  avatarUrl,
  displayName,
  children,
}: {
  avatarUrl?: string | null;
  displayName: string;
  children: React.ReactNode;
}) => (
  <li className="flex min-h-14 items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
    <UserAvatar avatarUrl={avatarUrl} displayName={displayName} />
    <span className="type-headline min-w-0 flex-1 truncate">{displayName}</span>
    <div className="flex shrink-0 gap-2">{children}</div>
  </li>
);

const EmptyRow = ({ children }: { children: React.ReactNode }) => (
  <li className="type-callout px-1 py-2 text-ink-3">{children}</li>
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
  /**
   * X23: Remove asks first. Unfriending cannot be undone from this side —
   * being friends again takes a new request the other person must accept —
   * so it is the one person-level action here that confirms (design §4.7:
   * reversible actions toast with Undo, irreversible ones confirm). Open is
   * its own flag so the name outlives the sheet's closing animation.
   */
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
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

  const handleRemove = (userId: string, displayName: string) => {
    void withPending(userId, async () => {
      const result = await removeFriend({ userId });
      const payload = result.data?.removeFriend;
      if (payload?.__typename === "RemoveFriendPayload") {
        setBanner(null);
        refreshLists();
        notify(`You and ${displayName} are no longer friends`);
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {banner !== null && (
        <Alert
          variant={banner.color === "danger" ? "destructive" : "default"}
          className="flex items-center gap-3 lg:col-span-3"
        >
          {banner.color === "danger" ? (
            <ErrorIcon
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-4 shrink-0"
            />
          ) : (
            <Warning
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-4 shrink-0"
            />
          )}
          <AlertDescription className="type-callout flex-1 text-current">
            {banner.message}
          </AlertDescription>
          {banner.action !== undefined && (
            <Button size="sm" onClick={banner.action.onClick}>
              {banner.action.label}
            </Button>
          )}
        </Alert>
      )}

      <Panel title="Friends">
        <ListFailure
          failure={friendsList.failure}
          onRetry={friendsList.retry}
        />
        <ul className="flex flex-col gap-2">
          {friendRows.length === 0 && !friendsList.loading && (
            <EmptyRow>
              No friends yet. Search for users to add friends.
            </EmptyRow>
          )}
          {friendRows.map((row) => (
            <PersonRow
              key={row.user.id}
              avatarUrl={row.user.avatarUrl}
              displayName={row.user.displayName}
            >
              <RowButton
                variant="destructive"
                icon={<Delete aria-hidden strokeWidth={ICON_STROKE} />}
                pending={pendingIds.has(row.user.id)}
                onClick={() => {
                  setRemoveTarget({
                    id: row.user.id,
                    name: row.user.displayName,
                  });
                  setRemoveOpen(true);
                }}
              >
                Remove
              </RowButton>
            </PersonRow>
          ))}
        </ul>
      </Panel>

      <Panel title="Add Friends">
        <SearchField
          placeholder="Search for users by name..."
          aria-label="Find people to add as friends"
          debounceTimeout={500}
          onDebounced={setSearchTerm}
        />
        <ul className="flex flex-col gap-2">
          {searchRows
            .filter((edge) => !alreadyRequestedOrFriends.has(edge.node.userId))
            .map((edge) => (
              <PersonRow
                key={edge.node.userId}
                avatarUrl={edge.node.avatarUrl}
                displayName={edge.node.displayName}
              >
                <RowButton
                  pending={
                    pendingIds.has(edge.node.userId) || searchResult.fetching
                  }
                  onClick={() => handleSendRequest(edge.node.userId)}
                >
                  Request
                </RowButton>
              </PersonRow>
            ))}
        </ul>
      </Panel>

      <Panel title="Incoming Requests">
        <ListFailure
          failure={incomingList.failure}
          onRetry={incomingList.retry}
        />
        <ul className="flex flex-col gap-2">
          {incoming.length === 0 && !incomingList.loading && (
            <EmptyRow>No incoming requests.</EmptyRow>
          )}
          {incoming.map((row) => (
            <PersonRow
              key={row.id}
              avatarUrl={row.user.avatarUrl}
              displayName={row.user.displayName}
            >
              <RowButton
                variant="destructive"
                pending={pendingIds.has(row.id)}
                onClick={() => handleReject(row.id)}
              >
                Reject
              </RowButton>
              <RowButton
                pending={pendingIds.has(row.id)}
                onClick={() => handleAccept(row.id)}
              >
                Accept
              </RowButton>
            </PersonRow>
          ))}
        </ul>
        <h2 className="type-headline">Outgoing Requests</h2>
        <ListFailure
          failure={outgoingList.failure}
          onRetry={outgoingList.retry}
        />
        <ul className="flex flex-col gap-2">
          {outgoing.length === 0 && !outgoingList.loading && (
            <EmptyRow>No outgoing requests.</EmptyRow>
          )}
          {outgoing.map((row) => (
            <PersonRow
              key={row.id}
              avatarUrl={row.user.avatarUrl}
              displayName={row.user.displayName}
            >
              <RowButton
                variant="destructive"
                pending={pendingIds.has(row.id)}
                onClick={() => handleReject(row.id)}
              >
                Cancel
              </RowButton>
            </PersonRow>
          ))}
        </ul>
      </Panel>

      <ConfirmSheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${removeTarget?.name ?? "this friend"}?`}
        description={
          <>
            You&apos;ll stop seeing each other&apos;s friends-only cellars and
            lists. To be friends again, one of you sends a new request.
          </>
        }
        confirmLabel="Remove friend"
        onConfirm={() => {
          setRemoveOpen(false);
          if (removeTarget !== null) {
            handleRemove(removeTarget.id, removeTarget.name);
          }
        }}
      />
    </div>
  );
};
