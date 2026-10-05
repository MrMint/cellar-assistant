/**
 * {@link createPagedConnection}, as a hook over one URQL query.
 *
 * A component names the query, how its variables come from the list's
 * arguments and a cursor, and how to read a {@link Page} out of the answer;
 * the hook owns the request, the gate and every piece of paging state. It is
 * the only place under `src/components/**`'s reach that calls `.toPromise()`
 * for a list — `dev-checks/no-to-promise.test.ts` bans it in components, so a
 * new paged list comes here instead of growing its own cursor.
 *
 * The first page is **handed in**, not fetched: every list but one is
 * server-rendered, and graphcache's `relayPagination` was rejected for the
 * same reason — it wants to own the first page too. A list with no server
 * page passes `initial: null`, and the hook fetches its first page on mount.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type AnyVariables,
  type DocumentInput,
  type RequestPolicy,
  useClient,
} from "urql";
import {
  type ApiFailure,
  type ApiResult,
  failureFromTransport,
} from "@/lib/api/result";
import {
  createPagedConnection,
  type Page,
  type PagedConnection,
  type PagedState,
} from "./paged-connection";

export type UsePagedConnectionOptions<
  TData,
  TVariables extends AnyVariables,
  TRow,
  TArgs,
  TMeta = undefined,
> = {
  query: DocumentInput<TData, TVariables>;
  /** The variables for one page of the list described by `args`. */
  variables: (args: TArgs, after: string | null) => TVariables;
  /** The page in an answer — `pageOf(unwrapResult(…), map?)`, usually. */
  select: (data: TData | undefined) => ApiResult<Page<TRow, TMeta>>;
  initial: Page<TRow, TMeta> | null;
  initialArgs: TArgs;
  initialFailure?: ApiFailure | null;
  /**
   * For every request this list makes. Leave it unset (graphcache's default);
   * a reset that must see a write the cache has not passes `{ fresh: true }`
   * to `reset`, which is `"network-only"` for that one request.
   */
  requestPolicy?: RequestPolicy;
};

export type UsePagedConnection<TRow, TArgs, TMeta = undefined> = PagedState<
  TRow,
  TArgs,
  TMeta
> &
  Pick<
    PagedConnection<TRow, TArgs, TMeta>,
    "reset" | "loadMore" | "replace" | "updateRows"
  >;

export function usePagedConnection<
  TData,
  TVariables extends AnyVariables,
  TRow,
  TArgs,
  TMeta = undefined,
>(
  options: UsePagedConnectionOptions<TData, TVariables, TRow, TArgs, TMeta>,
): UsePagedConnection<TRow, TArgs, TMeta> {
  const client = useClient();

  // The controller outlives renders, but `variables` and `select` close over
  // props that may change; read them at request time, never at creation.
  const latest = useRef({ options, client });
  latest.current = { options, client };

  const [connection] = useState(() =>
    createPagedConnection<TRow, TArgs, TMeta>({
      initial: options.initial,
      initialArgs: options.initialArgs,
      initialFailure: options.initialFailure,
      fetchPage: async (args, after, { fresh }) => {
        const { options: current, client: urql } = latest.current;
        const { query, variables, select } = current;
        const requestPolicy = fresh ? "network-only" : current.requestPolicy;
        const response = await urql
          .query(
            query,
            variables(args, after),
            requestPolicy === undefined ? undefined : { requestPolicy },
          )
          .toPromise();
        if (response.error !== undefined) {
          return { ok: false, error: failureFromTransport(response.error) };
        }
        return select(response.data);
      },
    }),
  );

  // `initial: null` — no server page, so fetch the first one. Read once, at
  // mount: `initial` is a seed, and a later prop is a `replace`, not this.
  const [fetchesOwnFirstPage] = useState(options.initial === null);
  useEffect(() => {
    if (fetchesOwnFirstPage) void connection.reset();
  }, [connection, fetchesOwnFirstPage]);

  const state = useSyncExternalStore(
    connection.subscribe,
    connection.getState,
    connection.getState,
  );

  const reset = useCallback<PagedConnection<TRow, TArgs, TMeta>["reset"]>(
    (args, resetOptions) => connection.reset(args, resetOptions),
    [connection],
  );
  const loadMore = useCallback(() => connection.loadMore(), [connection]);
  const replace = useCallback<PagedConnection<TRow, TArgs, TMeta>["replace"]>(
    (page, args) => connection.replace(page, args),
    [connection],
  );
  const updateRows = useCallback<
    PagedConnection<TRow, TArgs, TMeta>["updateRows"]
  >((update) => connection.updateRows(update), [connection]);

  return { ...state, reset, loadMore, replace, updateRows };
}
