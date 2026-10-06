"use client";

import { useEffect } from "react";
import { unwrapResult } from "@/lib/api/result";
import { type Page, toPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { MyTierListOptionsPageQuery, TIER_LISTS_PAGE_SIZE } from "./queries";

/**
 * Every tier list the viewer may see, walked to the last page — for the two
 * pickers that offer "your own lists of this type": the map's tier-list
 * filter and the "Add to Tier List" modal.
 *
 * The old queries filtered server-side (`list_type`, `created_by_id`).
 * `myTierLists` takes no filter (G33 is not built) and pages at 100, so a
 * viewer who could see more than 100 lists — friends' and public ones count —
 * used to lose their own lists off the end of the first page. Owner and type
 * are still narrowed by the caller; this only makes sure the narrowing sees
 * every list first.
 *
 * `active` false holds the hook (a closed modal, no viewer). Each time it
 * turns true the walk restarts from the first page, network-only when
 * `fresh` — a list created elsewhere must show on reopen.
 */

export type TierListOptionNode = {
  id: string;
  name: string;
  listType: string;
  createdById: string;
};

/** A runaway guard, not a product limit: 50 pages is 5,000 visible lists. */
const MAX_PAGES = 50;

const EMPTY: Page<TierListOptionNode, string | null> = {
  rows: [],
  endCursor: null,
  hasNextPage: false,
};

export function useAllMyTierLists({
  active,
  fresh = false,
}: {
  active: boolean;
  fresh?: boolean;
}): {
  lists: readonly TierListOptionNode[];
  viewerId: string | null;
  /** True until the last page has landed. */
  loading: boolean;
  error: string | null;
} {
  const paged = usePagedConnection({
    query: MyTierListOptionsPageQuery,
    variables: (_args: null, after) => ({ first: TIER_LISTS_PAGE_SIZE, after }),
    select: (data) => {
      const result = unwrapResult(data?.myTierLists, "TierListConnection");
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          ...toPage(result.data, (edge) => ({
            id: edge.node.id,
            name: edge.node.name,
            listType: edge.node.listType,
            createdById: edge.node.createdById,
          })),
          meta: data?.me?.id ?? null,
        },
      };
    },
    initial: EMPTY,
    initialArgs: null,
  });
  const { reset, loadMore, status, hasNextPage, canLoadMore, rows, failure } =
    paged;

  useEffect(() => {
    if (active) void reset(null, { fresh });
  }, [active, fresh, reset]);

  const pages = Math.ceil(rows.length / TIER_LISTS_PAGE_SIZE);
  // A failed page stops the walk (no retry loop); the error is surfaced.
  const walking =
    active &&
    status === "idle" &&
    failure === null &&
    hasNextPage &&
    pages < MAX_PAGES;
  useEffect(() => {
    if (walking && canLoadMore) void loadMore();
  }, [walking, canLoadMore, loadMore]);

  return {
    lists: rows,
    viewerId: paged.meta ?? null,
    loading: active && (status !== "idle" || walking),
    error: failure?.message ?? null,
  };
}
