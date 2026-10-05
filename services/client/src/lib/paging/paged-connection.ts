/**
 * One paged list: a first page, "load more", and a reset when what is being
 * listed changes — with exactly one rule about which answer may land.
 *
 * Fifteen components tracked `endCursor` by hand and eleven appended pages by
 * hand, and only four of them gated the answers (`latest-only.ts`). The other
 * eleven had the bugs that module's header describes, waiting for a slow
 * network: a "Load more" still in flight when a filter changed landed after
 * the reset and appended the old filter's rows *and cursor* to the new first
 * page; a double click on "Load more" fetched the same page twice and
 * rendered every row in it twice, keys and all. None of that is visible in
 * the code of any one request, which is why it belongs in one place.
 *
 * ## The rules
 *
 * - **Every request goes through one {@link createLatestOnly} gate.** A reset
 *   retires everything in flight; only the newest request's answer is applied,
 *   and it is applied whole — rows, cursor, `hasNextPage` and `totalCount`
 *   together, never a page from one request and a cursor from another.
 * - **No load-more during a reset, and no second load-more during a first.**
 *   Both return `false` without fetching. A load-more during a reset would ask
 *   for the page after the *old* cursor under the *new* arguments.
 * - **A failed reset leaves nothing to load more from.** The rows on screen
 *   (if not cleared) belong to the previous arguments; paging on from their
 *   cursor under the new ones would splice two lists together.
 * - **`replace` adopts a page someone else fetched** — a server component's,
 *   after `router.refresh()` — and retires anything in flight, since that page
 *   is by definition newer than a request started before it arrived.
 *
 * No React here: the rules are plain data, unit-tested in
 * `paged-connection.test.ts` the way `latest-only.ts` is, and
 * `use-paged-connection.ts` is the thin hook over it.
 */
import type { ApiFailure, ApiResult } from "@/lib/api/result";
import { createLatestOnly } from "@/lib/latest-only";

/**
 * One page of a connection, reduced to what paging needs — plus, optionally,
 * `meta`: anything else the same answer carries that must land *with* the
 * page and never apart from it (a recipe's score beside its reviews).
 */
export type Page<TRow, TMeta = undefined> = {
  rows: readonly TRow[];
  endCursor: string | null;
  hasNextPage: boolean;
  /**
   * The connection's own count, `null` when it reports none (several return
   * null today — A7d item 1), `undefined` when this page did not say. Only a
   * page that says anything overwrites the count held.
   */
  totalCount?: number | null;
  /** Kept when a page leaves it `undefined`, like `totalCount`. */
  meta?: TMeta;
};

/**
 * - `idle` — nothing in flight.
 * - `resetting` — a first page for (possibly new) arguments is in flight.
 * - `loadingMore` — the page after `endCursor` is in flight.
 */
export type PagedStatus = "idle" | "resetting" | "loadingMore";

export type PagedState<TRow, TArgs, TMeta = undefined> = {
  readonly rows: readonly TRow[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
  readonly totalCount: number | null;
  readonly meta: TMeta | undefined;
  /** The arguments the rows are for — or, while resetting, are about to be. */
  readonly args: TArgs;
  readonly status: PagedStatus;
  readonly failure: ApiFailure | null;
  /** True exactly when {@link PagedConnection.loadMore} would fetch. */
  readonly canLoadMore: boolean;
};

/**
 * Fetch one page for `args` after `after` (`null` for the first page).
 * `fresh` asks the fetcher to bypass any cache — a reset after a write.
 */
export type PageFetcher<TRow, TArgs, TMeta = undefined> = (
  args: TArgs,
  after: string | null,
  options: { fresh: boolean },
) => Promise<ApiResult<Page<TRow, TMeta>>>;

export type ResetOptions = {
  /**
   * Empty the list immediately, for a list whose old rows would mislead under
   * the new arguments (a new search phrase). Otherwise they stay on screen
   * until the new page lands.
   */
  clear?: boolean;
  /**
   * Bypass the cache: the reset exists because something was written that a
   * cached first page would not show.
   */
  fresh?: boolean;
};

export type PagedConnection<TRow, TArgs, TMeta = undefined> = {
  getState(): PagedState<TRow, TArgs, TMeta>;
  subscribe(listener: () => void): () => void;
  /**
   * Fetch the first page for `args` (default: the current ones) and replace
   * the list with it. Resolves true when this reset's answer was applied.
   */
  reset(args?: TArgs, options?: ResetOptions): Promise<boolean>;
  /** Append the next page. Resolves true when a page was appended. */
  loadMore(): Promise<boolean>;
  /** Adopt a page fetched elsewhere, retiring anything in flight. */
  replace(page: Page<TRow, TMeta>, args?: TArgs): void;
  /** Edit the held rows in place — an optimistic update, a settled row. */
  updateRows(update: (rows: readonly TRow[]) => readonly TRow[]): void;
};

export type PagedConnectionOptions<TRow, TArgs, TMeta = undefined> = {
  fetchPage: PageFetcher<TRow, TArgs, TMeta>;
  /**
   * The first page, usually server-rendered — or `null` for a list that
   * fetches its own, which then starts out `resetting` (so the first paint is
   * a spinner, not a false "nothing here") until its owner calls `reset()`.
   */
  initial: Page<TRow, TMeta> | null;
  initialArgs: TArgs;
  /** A failure the server render already hit, shown until the next request. */
  initialFailure?: ApiFailure | null;
};

const TRANSPORT_FAILURE = (thrown: unknown): ApiFailure => ({
  __typename: "TransportError",
  code: "TRANSPORT",
  reason: null,
  message:
    thrown instanceof Error
      ? thrown.message
      : "The server did not answer. Check your connection and try again.",
});

export const createPagedConnection = <TRow, TArgs, TMeta = undefined>(
  options: PagedConnectionOptions<TRow, TArgs, TMeta>,
): PagedConnection<TRow, TArgs, TMeta> => {
  const gate = createLatestOnly();
  const listeners = new Set<() => void>();

  const derive = (
    next: Omit<PagedState<TRow, TArgs, TMeta>, "canLoadMore">,
  ): PagedState<TRow, TArgs, TMeta> => ({
    ...next,
    canLoadMore:
      next.status === "idle" && next.hasNextPage && next.endCursor !== null,
  });

  const initial = options.initial;
  let state: PagedState<TRow, TArgs, TMeta> = derive({
    rows: initial?.rows ?? [],
    endCursor: initial?.endCursor ?? null,
    hasNextPage: initial?.hasNextPage ?? false,
    totalCount: initial?.totalCount ?? null,
    meta: initial?.meta,
    args: options.initialArgs,
    status: initial === null ? "resetting" : "idle",
    failure: options.initialFailure ?? null,
  });

  const set = (
    patch: Partial<Omit<PagedState<TRow, TArgs, TMeta>, "canLoadMore">>,
  ) => {
    state = derive({ ...state, ...patch });
    listeners.forEach((listener) => {
      listener();
    });
  };

  /** Never rejects: a thrown fetch is a transport failure like any other. */
  const fetchSafely = async (
    args: TArgs,
    after: string | null,
    fresh: boolean,
  ): Promise<ApiResult<Page<TRow, TMeta>>> => {
    try {
      return await options.fetchPage(args, after, { fresh });
    } catch (thrown) {
      return { ok: false, error: TRANSPORT_FAILURE(thrown) };
    }
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async reset(args = state.args, { clear = false, fresh = false } = {}) {
      const isCurrent = gate.begin();
      set({
        args,
        status: "resetting",
        failure: null,
        ...(clear
          ? { rows: [], endCursor: null, hasNextPage: false, totalCount: null }
          : {}),
      });
      const result = await fetchSafely(args, null, fresh);
      if (!isCurrent()) return false;
      if (!result.ok) {
        set({
          status: "idle",
          failure: result.error,
          endCursor: null,
          hasNextPage: false,
        });
        return false;
      }
      set({
        status: "idle",
        rows: result.data.rows,
        endCursor: result.data.endCursor,
        hasNextPage: result.data.hasNextPage,
        totalCount: result.data.totalCount ?? null,
        ...(result.data.meta === undefined ? {} : { meta: result.data.meta }),
      });
      return true;
    },

    async loadMore() {
      if (!state.canLoadMore) return false;
      const after = state.endCursor;
      const args = state.args;
      const isCurrent = gate.begin();
      set({ status: "loadingMore", failure: null });
      const result = await fetchSafely(args, after, false);
      if (!isCurrent()) return false;
      if (!result.ok) {
        // The rows and cursor held are still right; a retry asks again.
        set({ status: "idle", failure: result.error });
        return false;
      }
      set({
        status: "idle",
        rows: [...state.rows, ...result.data.rows],
        endCursor: result.data.endCursor,
        hasNextPage: result.data.hasNextPage,
        ...(result.data.totalCount === undefined
          ? {}
          : { totalCount: result.data.totalCount }),
        ...(result.data.meta === undefined ? {} : { meta: result.data.meta }),
      });
      return true;
    },

    replace(page, args = state.args) {
      gate.invalidate();
      set({
        args,
        status: "idle",
        failure: null,
        rows: page.rows,
        endCursor: page.endCursor,
        hasNextPage: page.hasNextPage,
        totalCount: page.totalCount ?? null,
        ...(page.meta === undefined ? {} : { meta: page.meta }),
      });
    },

    updateRows(update) {
      set({ rows: update(state.rows) });
    },
  };
};

/** The shape every connection in the schema shares. */
type ConnectionLike<TEdge> = {
  readonly edges: readonly TEdge[];
  readonly pageInfo: {
    readonly endCursor?: string | null;
    readonly hasNextPage: boolean;
  };
  readonly totalCount?: number | null;
};

/**
 * A connection as a {@link Page}: its edges as the rows, or `map`ped to rows
 * (a view model, say). A connection that does not select `totalCount` leaves
 * the count held alone rather than zeroing it.
 */
export function toPage<TEdge>(connection: ConnectionLike<TEdge>): Page<TEdge>;
export function toPage<TEdge, TRow>(
  connection: ConnectionLike<TEdge>,
  map: (edge: TEdge) => TRow,
): Page<TRow>;
export function toPage<TEdge, TRow>(
  connection: ConnectionLike<TEdge>,
  map?: (edge: TEdge) => TRow,
): Page<TEdge | TRow> {
  return {
    rows: map === undefined ? connection.edges : connection.edges.map(map),
    endCursor: connection.pageInfo.endCursor ?? null,
    hasNextPage: connection.pageInfo.hasNextPage,
    ...("totalCount" in connection
      ? { totalCount: connection.totalCount ?? null }
      : {}),
  };
}

/** {@link toPage} over an `unwrapResult` answer, failures passed through. */
export function pageOf<TEdge>(
  result: ApiResult<ConnectionLike<TEdge>>,
): ApiResult<Page<TEdge>>;
export function pageOf<TEdge, TRow>(
  result: ApiResult<ConnectionLike<TEdge>>,
  map: (edge: TEdge) => TRow,
): ApiResult<Page<TRow>>;
export function pageOf<TEdge, TRow>(
  result: ApiResult<ConnectionLike<TEdge>>,
  map?: (edge: TEdge) => TRow,
): ApiResult<Page<TEdge | TRow>> {
  if (!result.ok) return result;
  return {
    ok: true,
    data: map === undefined ? toPage(result.data) : toPage(result.data, map),
  };
}
