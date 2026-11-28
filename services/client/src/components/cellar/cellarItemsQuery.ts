/**
 * The cellar items page's list arguments, shared by the server component that
 * renders the first page and `CellarItemsGrid`, which pages the rest.
 *
 * A plain module, with no `"use client"`, for the reason
 * `cellar-api/pagination.ts` gives: a server component reading a value out of
 * a client module gets a reference, not the value. Both sides build their
 * variables here, so the first page and every later one ask for the same list
 * — the agreement `68ead15a` had to restore by hand in the rewrite.
 *
 * The URL format is the old one (`nuqs`' `parseAsArrayOf(parseAsString)`):
 * `?search=smoky&types=WINE,BEER`, plus N13b's `?sort=` and `?status=`, each
 * left out of the URL at its default.
 */

import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";

/** `82450ad1:…/items/searchParams.ts` `ITEMS_PAGE_SIZE`. */
export const ITEMS_PAGE_SIZE = 50;

/**
 * Validates `?types=` members: known types only, each once. Unknown values
 * are dropped rather than sent, where the API would refuse the whole request.
 */
export function parseItemTypes(types: readonly string[]): ApiItemType[] {
  return types.filter(
    (type, index, all): type is ApiItemType =>
      (ITEM_TYPES as readonly string[]).includes(type) &&
      all.indexOf(type) === index,
  );
}

/**
 * The sort chip's four orders (N13b), as URL values, each one of the API's
 * `CellarItemSort`s — the actor already sorts its cached list, so no new
 * query. "Open first" is the default: open bottles are the ones you are
 * drinking from.
 */
export const CELLAR_SORTS = [
  { value: "open", label: "Open first", api: "OPEN_FIRST" },
  { value: "recent", label: "Recently added", api: "ADDED_DESC" },
  { value: "almost-empty", label: "Almost empty", api: "PERCENTAGE_ASC" },
  { value: "a-z", label: "A–Z", api: "NAME_ASC" },
] as const;

export type CellarSort = (typeof CELLAR_SORTS)[number]["value"];
export const DEFAULT_CELLAR_SORT: CellarSort = "open";

/** The status segment (N13b): `Cellar.items(status:)`, ACTIVE by default. */
export const CELLAR_STATUSES = [
  { value: "in-cellar", label: "In cellar", api: "ACTIVE" },
  { value: "finished", label: "Finished", api: "EMPTY" },
  { value: "all", label: "All", api: "ALL" },
] as const;

export type CellarStatus = (typeof CELLAR_STATUSES)[number]["value"];
export const DEFAULT_CELLAR_STATUS: CellarStatus = "in-cellar";

/** A `?sort=` value, or the default for anything unknown or absent. */
export const parseCellarSort = (value: string | null | undefined): CellarSort =>
  CELLAR_SORTS.find((sort) => sort.value === value)?.value ??
  DEFAULT_CELLAR_SORT;

/** A `?status=` value, or the default for anything unknown or absent. */
export const parseCellarStatus = (
  value: string | null | undefined,
): CellarStatus =>
  CELLAR_STATUSES.find((status) => status.value === value)?.value ??
  DEFAULT_CELLAR_STATUS;

export type CellarItemsArgs = {
  search: string;
  types: ApiItemType[];
  /** Absent: {@link DEFAULT_CELLAR_SORT}. */
  sort?: CellarSort;
  /** Absent: {@link DEFAULT_CELLAR_STATUS}. */
  status?: CellarStatus;
};

/**
 * `GetCellarItemGroupsQuery`'s variables (X04).
 *
 * - **Order.** With a search, the search's: it **narrows** — name matches,
 *   then near meanings, nothing else — so the sort chip steps aside; without,
 *   the chip's choice, "Open first" by default (N13b). The two are never both
 *   sent.
 * - **Status.** The segment's choice; "In cellar" (ACTIVE) by default, which
 *   hides finished bottles (decision 4). "Finished" is the diary, which has
 *   its own query (`cellarDiaryVariables`).
 * - **Types.** None or all six is no filter, as the old `buildItemsWhereClause`
 *   had it (`types.length > 0 && types.length < 6`).
 */
export const cellarItemsVariables = (
  cellarId: string,
  args: CellarItemsArgs,
  after: string | null,
) => {
  const search = args.search.trim();
  const types = parseItemTypes(args.types);
  const sort = parseCellarSort(args.sort);
  const status = parseCellarStatus(args.status);
  return {
    cellarId,
    first: ITEMS_PAGE_SIZE,
    after,
    types: types.length > 0 && types.length < ITEM_TYPES.length ? types : null,
    sort:
      search === ""
        ? (CELLAR_SORTS.find((entry) => entry.value === sort)?.api ??
          "OPEN_FIRST")
        : null,
    status:
      CELLAR_STATUSES.find((entry) => entry.value === status)?.api ?? "ACTIVE",
    search: search === "" ? null : search,
  };
};

/** The Finished diary's pages: its order and status are fixed by the query. */
export const DIARY_PAGE_SIZE = 30;

export const cellarDiaryVariables = (
  cellarId: string,
  args: Pick<CellarItemsArgs, "search" | "types">,
  after: string | null,
) => {
  const { types, search } = cellarItemsVariables(
    cellarId,
    { ...args, status: "finished" },
    after,
  );
  return { cellarId, first: DIARY_PAGE_SIZE, after, types, search };
};

/**
 * The old grid's module-cache key: one entry per cellar, search, filter,
 * sort and status.
 */
export const cellarItemsCacheKey = (
  cellarId: string,
  args: CellarItemsArgs,
): string =>
  [
    cellarId,
    args.search,
    args.types.join(","),
    parseCellarSort(args.sort),
    parseCellarStatus(args.status),
  ].join("\0");
