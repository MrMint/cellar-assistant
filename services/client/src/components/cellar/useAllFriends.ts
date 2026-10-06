"use client";

import { MyFriendsQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { useWholeConnection } from "@/lib/paging/use-whole-connection";

/** The API's page cap — a request size; the walk reads every page. */
const FRIENDS_PAGE_SIZE = 100;

/**
 * Every friend of the viewer, for the cellar forms' co-owner picker.
 *
 * The old forms read `user(id).friends` unbounded
 * (`82450ad1:src/components/cellar/AddCellarClient.tsx:12-30`,
 * `EditCellarClient.tsx:12-36`); `myFriends` pages at 100, and a single
 * `first: 100` read left everyone after the hundredth out of the picker.
 */
export const useAllFriends = () =>
  useWholeConnection({
    query: MyFriendsQuery,
    variables: (after) => ({ first: FRIENDS_PAGE_SIZE, after }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.myFriends, "FriendConnection"),
        (edge) => edge.node.user,
      ),
    pageSize: FRIENDS_PAGE_SIZE,
  });
