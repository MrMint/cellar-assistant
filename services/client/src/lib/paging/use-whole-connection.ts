/**
 * {@link usePagedConnection}, walked to the last page — for a client view
 * that shows a whole list, as the old UI's unbounded reads did. The rules are
 * in `whole-connection.ts`; this is the hook over them.
 *
 * The first page is fetched on mount (there is no server page to hand in).
 * `refresh()` re-reads from the first page, network-only, and walks again;
 * while it does, the last complete list stays on screen.
 */
import { useCallback, useEffect, useState } from "react";
import type { AnyVariables, DocumentInput, RequestPolicy } from "urql";
import type { ApiFailure, ApiResult } from "@/lib/api/result";
import type { Page } from "./paged-connection";
import { usePagedConnection } from "./use-paged-connection";
import { nextWalkStep, visibleRows } from "./whole-connection";

export type UseWholeConnection<TRow> = {
  /** Every row once the walk is done; see `visibleRows` for until then. */
  rows: readonly TRow[];
  /** True until the first walk has reached its end (or failed). */
  loading: boolean;
  /** The last request's failure — the walk stops on it. */
  failure: ApiFailure | null;
  /** Re-read from the first page, network-only, and walk again. */
  refresh: () => void;
  /** Ask again for the page a failed walk stopped before (or start over). */
  retry: () => void;
};

export function useWholeConnection<
  TData,
  TVariables extends AnyVariables,
  TRow,
>({
  query,
  variables,
  select,
  pageSize,
  requestPolicy,
}: {
  query: DocumentInput<TData, TVariables>;
  variables: (after: string | null) => TVariables;
  select: (data: TData | undefined) => ApiResult<Page<TRow>>;
  pageSize: number;
  /**
   * For every page of the walk — `usePagedConnection`'s option. Unset is
   * graphcache's cache-first, which answers a remount from whatever an
   * earlier mount cached; a list that a write elsewhere changes without
   * touching that cached field wants `"cache-and-network"` (its first
   * non-stale answer is the network's: `toPromise` skips stale results).
   */
  requestPolicy?: RequestPolicy;
}): UseWholeConnection<TRow> {
  const paged = usePagedConnection({
    query,
    variables: (_args: null, after) => variables(after),
    select,
    initial: null,
    initialArgs: null,
    requestPolicy,
  });
  const { rows, status, failure, hasNextPage, canLoadMore, reset, loadMore } =
    paged;

  const step = nextWalkStep(
    { rows, status, failure, hasNextPage, canLoadMore },
    pageSize,
  );

  useEffect(() => {
    if (step === "load") void loadMore();
  }, [step, loadMore]);

  const [settled, setSettled] = useState<readonly TRow[] | null>(null);
  useEffect(() => {
    if (step === "done") setSettled(rows);
  }, [step, rows]);

  const refresh = useCallback(() => {
    void reset(null, { fresh: true });
  }, [reset]);
  // A failed load-more keeps its cursor, so it can be asked again; a failed
  // first page has none, so a retry starts over.
  const retry = useCallback(() => {
    if (canLoadMore) void loadMore();
    else void reset(null, { fresh: true });
  }, [canLoadMore, loadMore, reset]);

  return {
    rows: visibleRows(rows, step, settled),
    loading: settled === null && step !== "done",
    failure,
    refresh,
    retry,
  };
}
