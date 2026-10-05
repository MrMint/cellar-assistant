/**
 * Paging (migration plan §1.5: "All list reads are paged. There is no unbounded
 * read.") and §8.3 ("every list field is a Relay connection").
 *
 * The split is deliberate:
 *
 * - **Actors** speak `PageArgs` in and `Page<T>` out. They never know about
 *   Relay, edges, or `pageInfo`.
 * - **`services/api`** turns Relay connection arguments into `PageArgs` and a
 *   `Page<T>` into a connection (`services/api/src/schema/pagination.ts`).
 *
 * A cursor is an **opaque string owned by the actor that produced it**. Clients
 * must not parse one, and an actor must not accept one it did not mint. The two
 * helpers below cover every case in the catalog:
 *
 * - `offsetPage` — a capped result set already materialised in memory. This is
 *   what every search actor does (§1.5: "The actor runs the search once, holds
 *   the capped result set … and pages it in memory").
 * - `keysetPage` — rows fetched from Postgres with `limit(first + 1)` and an
 *   ordering key. This is what entity and collection actors do.
 */
import { ValidationError } from "./errors.ts";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** What an actor method receives. Forward-only: there is no `last`/`before`. */
export type PageArgs = {
  readonly first: number;
  readonly after: string | null;
};

export type PageEntry<T> = {
  /** Opaque; minted by the actor, echoed back by the client as `after`. */
  readonly cursor: string;
  readonly node: T;
};

/** What an actor method returns. */
export type Page<T> = {
  readonly entries: readonly PageEntry<T>[];
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  /** `null` when counting is not cheap (§8.3: "`totalCount` where cheap"). */
  readonly totalCount: number | null;
};

/**
 * Normalises client-supplied paging into `PageArgs`. Called by `services/api`, and
 * by any actor that takes paging from somewhere other than a resolver.
 *
 * Rejects rather than silently clamps an over-large `first`: a client asking for
 * 5000 rows has a bug, and returning 100 without saying so hides it.
 */
export const pageArgs = (input?: {
  first?: number | null;
  after?: string | null;
}): PageArgs => {
  const first = input?.first ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(first) || first < 1) {
    throw new ValidationError(`first must be a positive integer, got ${first}`);
  }
  if (first > MAX_PAGE_SIZE) {
    throw new ValidationError(
      `first must be at most ${MAX_PAGE_SIZE}, got ${first}`,
    );
  }
  return { first, after: input?.after ?? null };
};

export const emptyPage = <T>(): Page<T> => ({
  entries: [],
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: 0,
});

const OFFSET_CURSOR_PREFIX = "offset:";

export const offsetCursor = (offset: number): string =>
  `${OFFSET_CURSOR_PREFIX}${offset}`;

/** Throws rather than returning 0 for a cursor from a different actor's page. */
export const parseOffsetCursor = (cursor: string): number => {
  if (!cursor.startsWith(OFFSET_CURSOR_PREFIX)) {
    throw new ValidationError(`not an offset cursor: ${cursor}`);
  }
  const digits = cursor.slice(OFFSET_CURSOR_PREFIX.length);
  // Validate the text, not the coercion. `Number()` accepts an empty string as
  // 0, tolerates surrounding whitespace, and reads exponent notation -- so
  // "offset:", "offset: 3" and "offset:1e1" all used to parse, and a cursor the
  // server never minted silently shifted the page instead of being rejected.
  // `offsetPage` then dropped the first row with no error anywhere.
  if (!/^\d+$/.test(digits)) {
    throw new ValidationError(`not an offset cursor: ${cursor}`);
  }
  const offset = Number(digits);
  if (!Number.isSafeInteger(offset)) {
    throw new ValidationError(`not an offset cursor: ${cursor}`);
  }
  return offset;
};

/**
 * Page an in-memory, already-capped result set. The cursor is the index, so the
 * set must be stable for the life of the activation — which is exactly the
 * contract of a search actor keyed by a hash of its inputs (§1.5).
 */
export const offsetPage = <T>(all: readonly T[], args: PageArgs): Page<T> => {
  const start = args.after === null ? 0 : parseOffsetCursor(args.after) + 1;
  const end = Math.min(start + args.first, all.length);
  const entries: PageEntry<T>[] = [];
  for (let index = start; index < end; index += 1) {
    // `noUncheckedIndexedAccess`: the bound above guarantees this is defined.
    entries.push({ cursor: offsetCursor(index), node: all[index] as T });
  }
  return {
    entries,
    hasNextPage: end < all.length,
    hasPreviousPage: start > 0,
    totalCount: all.length,
  };
};

/**
 * Page rows read with `limit(first + 1)` and an ordering key.
 *
 * Pass the raw query result — the extra row is what proves `hasNextPage`, and
 * this helper drops it. `cursorOf` must return the ordering key the actor's
 * `where` clause compares `after` against.
 */
export const keysetPage = <T>(
  rows: readonly T[],
  args: PageArgs,
  cursorOf: (row: T) => string,
  totalCount: number | null = null,
): Page<T> => ({
  entries: rows
    .slice(0, args.first)
    .map((node) => ({ cursor: cursorOf(node), node })),
  hasNextPage: rows.length > args.first,
  hasPreviousPage: args.after !== null,
  totalCount,
});

/** Maps a page's nodes, keeping cursors and flags. Used to hydrate ids. */
export const mapPage = <T, U>(page: Page<T>, map: (node: T) => U): Page<U> => ({
  ...page,
  entries: page.entries.map(({ cursor, node }) => ({
    cursor,
    node: map(node),
  })),
});

/* -------------------------------------------------------------------------- */
/* Batched reverse edges (UI parity wave B)                                    */
/* -------------------------------------------------------------------------- */

/**
 * The most rows a batched reverse-edge call returns **per parent** — "the tier
 * lists this item is on", "the cellars holding it", "the recipes using it".
 *
 * A page of cards asks the same question of up to {@link MAX_PAGE_SIZE}
 * parents at once, and a connection's `first`/`after` cannot be honoured per
 * parent inside one batched SQL statement. So the actor answers each parent
 * with its first `REVERSE_EDGE_CAP` rows plus the true count, and
 * `services/api` pages that capped list in memory (`offsetPage`). `totalCount`
 * stays honest past the cap; rows beyond it are not reachable through the
 * edge, which is why the cap is the page maximum rather than something a
 * client could plausibly page past on one card.
 */
export const REVERSE_EDGE_CAP = MAX_PAGE_SIZE;

/** How many parents one batched reverse-edge call may name. */
export const REVERSE_EDGE_MAX_PARENTS = MAX_PAGE_SIZE;

/** One parent's answer to a batched reverse-edge call. */
export type CappedList<T> = {
  /** The first {@link REVERSE_EDGE_CAP} rows, in the edge's documented order. */
  readonly nodes: readonly T[];
  /** Every matching row the viewer may see, the cap notwithstanding. */
  readonly totalCount: number;
};

/** Refuses a batch naming more parents than {@link REVERSE_EDGE_MAX_PARENTS}. */
export const requireReverseEdgeBatch = <T>(
  parents: readonly T[],
  what: string,
): readonly T[] => {
  if (parents.length > REVERSE_EDGE_MAX_PARENTS) {
    throw new ValidationError(
      `${what}: at most ${REVERSE_EDGE_MAX_PARENTS} per call, got ${parents.length}`,
    );
  }
  return parents;
};

/** Pages one parent's capped list, keeping its honest `totalCount`. */
export const cappedPage = <T>(
  list: CappedList<T>,
  args: PageArgs,
): Page<T> => ({
  ...offsetPage(list.nodes, args),
  totalCount: list.totalCount,
});
