"use client";

import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { useWholeConnection } from "@/lib/paging/use-whole-connection";
import { MyFriendRequestsQuery, MyFriendsQuery } from "./fragments";

/**
 * The API's page cap. Each list is walked to its end — a page here is a
 * request size, not a limit on what shows.
 */
const PAGE_SIZE = 100;

/** Every friend, walked page by page to the end. */
export const useAllFriends = () =>
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
export const useAllFriendRequests = (direction: "INCOMING" | "OUTGOING") =>
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
 * The open request between the viewer and `userId`, in one direction: the
 * row whose other person is exactly them, never anyone else's. Cancel and
 * Accept write against this id, so a wrong match would act on someone else.
 */
export const requestWith = <TRow extends { id: string; user: { id: string } }>(
  rows: readonly TRow[],
  userId: string,
): TRow | undefined => rows.find((row) => row.user.id === userId);
