import { useQuery } from "urql";
import { MyFriendRequestsQuery } from "@/components/friend/fragments";

/**
 * A search row knows a person and where things stand with them, not the id
 * of the request between you (`UserSearchResult` carries none). Cancel and
 * Accept need that id, so a pending row reads your own requests — the
 * same `myFriendRequests` `/friends` reads, one query that every pending
 * row on the page shares — and answers only the pending one with this
 * person. No new mutation: Cancel is `rejectFriendRequest`
 * (L2), which cancels a request you sent.
 */

export type RequestEdge = {
  readonly node: {
    readonly id: string;
    readonly status: string;
    readonly user: { readonly id: string };
  };
};

/** Your most recent open requests one way that a row looks through. */
export const REQUEST_LOOKUP_SIZE = 50;

/**
 * The pending request with `userId`, or null. Never another person's: a
 * row that cannot find its own request does nothing rather than answer one
 * that happens to be there.
 */
export const pendingRequestFor = (
  edges: readonly RequestEdge[],
  userId: string,
): string | null =>
  edges.find(({ node }) => node.user.id === userId && node.status === "PENDING")
    ?.node.id ?? null;

/**
 * Your pending request with this person in one direction, read while
 * `direction` is set. `id` is null until it is found, or when there is none
 * among your latest {@link REQUEST_LOOKUP_SIZE}.
 */
export function usePendingRequest(
  direction: "INCOMING" | "OUTGOING" | null,
  userId: string,
): { id: string | null; fetching: boolean } {
  const [{ data, fetching }] = useQuery({
    query: MyFriendRequestsQuery,
    variables: {
      direction: direction ?? "OUTGOING",
      first: REQUEST_LOOKUP_SIZE,
      after: null,
    },
    pause: direction === null,
  });
  const connection = data?.myFriendRequests;
  return {
    id:
      direction !== null && connection?.__typename === "FriendRequestConnection"
        ? pendingRequestFor(connection.edges, userId)
        : null,
    fetching,
  };
}
