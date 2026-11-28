"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { NoResults, People } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { useAppKey } from "@/components/app/overlays/app-keys";
import { PersonRow } from "@/components/app/parts/PersonRow";
import { useNavigate } from "@/components/app/useNavigate";
import { friendsSinceLine } from "@/components/profile/adapter";
import { SearchField } from "@/components/shell/SearchField";
import { Button } from "@/components/ui/button";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import type { ActorErrorReason } from "@/lib/api/errors";
import type { ResultOf } from "@/lib/api/graphql";
import type { ApiFailure } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type FriendActivity, friendActivityLine } from "./activity-line";
import { FriendPane } from "./FriendPane";
import {
  AcceptFriendRequestMutation,
  RejectFriendRequestMutation,
  SendFriendRequestMutation,
  UserSearchQuery,
} from "./fragments";
import { useAllFriendRequests, useAllFriends } from "./friend-lists";
import { InviteFriendButton } from "./InviteFriendButton";
import { openIncomingRequests } from "./open-requests";
import { useUndoableWrite } from "./undoable-write";

/** How often the lists refresh in the background — there is no subscription
 * in the new stack (plan §6 D8). A write refreshes at once; this is for the
 * other side's actions (a friend accepting, say). */
const POLL_INTERVAL_MS = 15_000;

type SearchResult = ResultOf<typeof UserSearchQuery>;

/**
 * `sendFriendRequest`'s refusals, told apart by `reason` (B4b), never by the
 * English `message`. An unknown or absent reason is "other": the enum is
 * additive.
 */
export const classifySendFriendRequestError = (
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

const usePolledRefresh = (refresh: () => void) => {
  const saved = useRef(refresh);
  saved.current = refresh;
  useEffect(() => {
    const id = window.setInterval(() => saved.current(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
};

/** A section: its heading and count, then its rows (Social-Friends 01). */
function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const id = `friends-${label.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 py-2">
        <h2 id={id} className="t-head text-ink">
          {label}
        </h2>
        <span className="t-cap tabular-nums text-ink-2">{count}</span>
      </div>
      <ul className="flex flex-col divide-y divide-hair">{children}</ul>
    </section>
  );
}

/** A list's read failed: what happened and the one way out. */
function ListFailure({
  failure,
  what,
  onRetry,
}: {
  failure: ApiFailure | null;
  what: string;
  onRetry: () => void;
}) {
  if (failure === null) return null;
  return (
    <ErrorState
      title={`Couldn't load your ${what}`}
      action={
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/**
 * `/friends` (Social-Friends 01 to 19, desktop 01 to 12): Invite in the
 * header, Search people, then Requests (outlined Accept, quiet Decline),
 * Friends (each into their profile) and Sent (quiet Cancel). Remove friend
 * lives on the profile now (lead's ruling 2). With nobody at all, one
 * solid Invite.
 *
 * From `md` up the list is a column and the chosen friend's profile and
 * compare open beside it; J/K or the arrows move the cursor ring through the
 * friends, Enter opens the full page.
 */
export const FriendsClient = () => {
  const navigate = useNavigate();
  const desktop = useMediaQuery(breakpointUp("md"));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  // Requests declined or canceled whose Undo toast is still up (F-91).
  const [setAside, setSetAside] = useState<ReadonlySet<string>>(new Set());
  const { hold: holdWrite } = useUndoableWrite();

  const friendsList = useAllFriends();
  // A relative time is a hydration mismatch: the clock starts after mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const incomingList = useAllFriendRequests("INCOMING");
  const outgoingList = useAllFriendRequests("OUTGOING");
  const searching = searchTerm.trim().length > 0;
  const [searchResult, reexecuteSearch] = useQuery({
    query: UserSearchQuery,
    variables: { term: searchTerm },
    pause: !searching,
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

  const friendRows = friendsList.rows;
  // W-13: an accepted request stays listed until the requester's actor
  // deletes it; the friendship is already written, so it is closed here.
  const incoming = openIncomingRequests(
    incomingList.rows,
    friendRows.map((row) => row.user.id),
  ).filter((row) => !setAside.has(row.id));
  const outgoing = outgoingList.rows.filter((row) => !setAside.has(row.id));

  const aside = (requestId: string, on: boolean) =>
    setSetAside((prev) => {
      const next = new Set(prev);
      if (on) next.add(requestId);
      else next.delete(requestId);
      return next;
    });

  const selected =
    friendRows.find((row) => row.user.id === chosen) ?? friendRows[0];
  const selectedId = selected?.user.id ?? null;

  const handleReject = (requestId: string, failureLine: string) =>
    withPending(requestId, async () => {
      const result = await rejectFriendRequest({ requestId });
      if (
        result.data?.rejectFriendRequest.__typename ===
        "RejectFriendRequestPayload"
      ) {
        refreshLists();
        return;
      }
      aside(requestId, false);
      notify(failureLine, { tone: "error" });
    });

  /** Decline or Cancel: the row goes at once, the write when Undo has
   * passed (KIT § 4; the board's "Declined …'s request", "Request to …
   * canceled"). */
  const rejectWithUndo = (
    requestId: string,
    message: string,
    failureLine: string,
  ) => {
    aside(requestId, true);
    holdWrite(requestId, {
      message,
      commit: () => void handleReject(requestId, failureLine),
      restore: () => aside(requestId, false),
    });
  };

  const handleAccept = (requestId: string, name: string) =>
    withPending(requestId, async () => {
      const result = await acceptFriendRequest({ requestId });
      if (
        result.data?.acceptFriendRequest.__typename ===
        "AcceptFriendRequestPayload"
      ) {
        refreshLists();
        notify(`${name} is your friend`, { tone: "success" });
        return;
      }
      notify("Couldn't accept that request", { tone: "error" });
    });

  const handleSendRequest = (userId: string, name: string) =>
    withPending(userId, async () => {
      const result = await sendFriendRequest({ userId });
      const payload = result.data?.sendFriendRequest;
      if (payload?.__typename === "FriendRequest") {
        const requestId = payload.id;
        refreshLists();
        reexecuteSearch({ requestPolicy: "network-only" });
        notify(`Request sent to ${name}`, {
          undo: () =>
            void handleReject(requestId, "Couldn't cancel the request"),
        });
        return;
      }
      if (payload !== undefined && "code" in payload) {
        const kind = classifySendFriendRequestError(payload.reason);
        const existing = incoming.find((row) => row.user.id === userId);
        if (kind === "pending-incoming" && existing !== undefined) {
          notify(`${name} already asked you`, {
            actionLabel: "Accept",
            undo: () => void handleAccept(existing.id, name),
          });
          return;
        }
        refreshLists();
        notify(payload.message, { tone: "error" });
        return;
      }
      notify("Couldn't send the request", { tone: "error" });
    });

  // Desktop keys (KIT § 3): J/K and the arrows move the cursor through the
  // friends; Enter opens the chosen one's page. Below `md` there is no
  // cursor, so each declines (`false`) and the key stays the browser's: the
  // arrows scroll, Enter presses what has focus (F-90).
  const move = (step: 1 | -1): boolean => {
    if (!desktop || friendRows.length === 0) return false;
    const at = friendRows.findIndex((row) => row.user.id === selectedId);
    const next =
      friendRows[Math.min(friendRows.length - 1, Math.max(0, at + step))];
    if (next !== undefined && next.user.id !== selectedId) {
      feedback("tick");
      setChosen(next.user.id);
    }
    return true;
  };
  useAppKey("ArrowDown", () => move(1));
  useAppKey("j", () => move(1));
  useAppKey("ArrowUp", () => move(-1));
  useAppKey("k", () => move(-1));
  useAppKey("Enter", () => {
    if (!desktop || selectedId === null) return false;
    navigate.push(`/users/${selectedId}`);
    return true;
  });

  const searchData: SearchResult | undefined = searchResult.data;
  const searchRows =
    searchData?.userSearch.__typename === "UserSearchConnection"
      ? searchData.userSearch.edges.map((edge) => edge.node)
      : [];

  const loaded =
    !friendsList.loading && !incomingList.loading && !outgoingList.loading;
  const nobody =
    loaded &&
    friendRows.length === 0 &&
    incoming.length === 0 &&
    outgoing.length === 0 &&
    friendsList.failure === null;

  const list = (
    <div className="flex min-w-0 flex-col gap-4">
      <SearchField
        placeholder="Search people"
        aria-label="Search people"
        debounceTimeout={400}
        onDebounced={setSearchTerm}
        searching={searching && searchResult.fetching}
      />

      {searching ? (
        <Section label="People" count={searchRows.length}>
          {searchRows.map((person) => (
            <li key={person.userId}>
              <PersonRow
                name={person.displayName}
                displayName={person.displayName}
                avatarUrl={person.avatarUrl}
                actions={
                  <Button
                    variant="outline"
                    disabled={pendingIds.has(person.userId)}
                    aria-busy={pendingIds.has(person.userId) || undefined}
                    aria-label={`Add ${person.displayName}`}
                    onClick={() =>
                      void handleSendRequest(person.userId, person.displayName)
                    }
                  >
                    Add
                  </Button>
                }
              />
            </li>
          ))}
          {!searchResult.fetching && searchRows.length === 0 && (
            <li className="list-none">
              <EmptyState
                illustration={<NoResults aria-hidden strokeWidth={1.5} />}
                title={`No one matches “${searchTerm.trim()}”`}
              />
            </li>
          )}
        </Section>
      ) : nobody ? (
        <EmptyState
          illustration={<People aria-hidden strokeWidth={1.5} />}
          title="No friends yet"
          action={<InviteFriendButton />}
          className="py-10"
        />
      ) : (
        <>
          {incoming.length > 0 && (
            <Section label="Requests" count={incoming.length}>
              {incoming.map((row) => (
                <li key={row.id}>
                  <PersonRow
                    name={row.user.displayName}
                    displayName={row.user.displayName}
                    avatarUrl={row.user.avatarUrl}
                    status="Wants to be friends"
                    actions={
                      <>
                        <Button
                          variant="quiet-muted"
                          disabled={pendingIds.has(row.id)}
                          aria-label={`Decline ${row.user.displayName}`}
                          onClick={() =>
                            rejectWithUndo(
                              row.id,
                              `Declined ${row.user.displayName}’s request`,
                              "Couldn't decline that request",
                            )
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          variant="outline"
                          disabled={pendingIds.has(row.id)}
                          aria-busy={pendingIds.has(row.id) || undefined}
                          aria-label={`Accept ${row.user.displayName}`}
                          onClick={() =>
                            void handleAccept(row.id, row.user.displayName)
                          }
                        >
                          Accept
                        </Button>
                      </>
                    }
                  />
                </li>
              ))}
            </Section>
          )}
          <ListFailure
            failure={incomingList.failure}
            what="requests"
            onRetry={incomingList.retry}
          />

          {friendRows.length > 0 && (
            <Section label="Friends" count={friendRows.length}>
              {friendRows.map((row) => {
                const current = desktop && row.user.id === selectedId;
                return (
                  <li
                    key={row.user.id}
                    data-slot="friend-row"
                    aria-current={current || undefined}
                    className={cn(
                      "rounded-md md:px-2",
                      current && "ring-2 ring-ring-select",
                    )}
                  >
                    <PersonRow
                      name={
                        <Link
                          href={`/users/${row.user.id}`}
                          overlay
                          underline="none"
                          data-slot="friend-profile-link"
                          className="text-ink"
                          onClick={(event) => {
                            if (!desktop) return;
                            event.preventDefault();
                            setChosen(row.user.id);
                          }}
                        >
                          {row.user.displayName}
                        </Link>
                      }
                      displayName={row.user.displayName}
                      avatarUrl={row.user.avatarUrl}
                      status={
                        friendActivityLine(
                          (row.latestActivity as FriendActivity | null) ?? null,
                          now,
                        ) ?? friendsSinceLine(row.since as string)
                      }
                      chevron
                    />
                  </li>
                );
              })}
            </Section>
          )}
          <ListFailure
            failure={friendsList.failure}
            what="friends"
            onRetry={friendsList.retry}
          />

          {outgoing.length > 0 && (
            <Section label="Sent" count={outgoing.length}>
              {outgoing.map((row) => (
                <li key={row.id}>
                  <PersonRow
                    name={row.user.displayName}
                    displayName={row.user.displayName}
                    avatarUrl={row.user.avatarUrl}
                    status="Request sent"
                    actions={
                      <Button
                        variant="quiet-muted"
                        disabled={pendingIds.has(row.id)}
                        aria-busy={pendingIds.has(row.id) || undefined}
                        aria-label={`Cancel request to ${row.user.displayName}`}
                        onClick={() =>
                          rejectWithUndo(
                            row.id,
                            `Request to ${row.user.displayName} canceled`,
                            "Couldn't cancel the request",
                          )
                        }
                      >
                        Cancel
                      </Button>
                    }
                  />
                </li>
              ))}
            </Section>
          )}
          <ListFailure
            failure={outgoingList.failure}
            what="sent requests"
            onRetry={outgoingList.retry}
          />
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <AppBar
          title="Friends"
          parent="/me"
          breadcrumbs={[{ label: "Me", href: "/me" }, { label: "Friends" }]}
          className="min-w-0 flex-1"
        />
        <InviteFriendButton variant="outline" className="shrink-0" />
      </div>
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start gap-6">
          {list}
          {selectedId !== null && !searching && (
            <div data-slot="friend-pane" className="min-w-0">
              <FriendPane
                key={selectedId}
                userId={selectedId}
                onRemoved={() => {
                  setChosen(null);
                  refreshLists();
                }}
              />
            </div>
          )}
        </div>
      ) : (
        list
      )}
    </div>
  );
};
