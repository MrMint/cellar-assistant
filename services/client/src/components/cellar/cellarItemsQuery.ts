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
 * `?search=smoky&types=WINE,BEER`.
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

export type CellarItemsArgs = { search: string; types: ApiItemType[] };

/**
 * `GetCellarItemsQuery`'s variables.
 *
 * - **Order.** The old grid sorted by `distance, name` client-side, distance
 *   being `Infinity` without a search. With a search that is
 *   `semanticQuery` (distance, ties by name — the schema says so); without,
 *   `NAME_ASC` (G3). The two are never both sent: a semantic query overrides
 *   the sort.
 * - **Types.** None or all six is no filter, as the old `buildItemsWhereClause`
 *   had it (`types.length > 0 && types.length < 6`).
 * - **Empty bottles** are hidden by `status`'s ACTIVE default (decision 4).
 */
export const cellarItemsVariables = (
  cellarId: string,
  args: CellarItemsArgs,
  after: string | null,
) => {
  const search = args.search.trim();
  const types = parseItemTypes(args.types);
  return {
    cellarId,
    first: ITEMS_PAGE_SIZE,
    after,
    types: types.length > 0 && types.length < ITEM_TYPES.length ? types : null,
    sort: search === "" ? ("NAME_ASC" as const) : null,
    semanticQuery: search === "" ? null : search,
  };
};

/** The old grid's module-cache key: one entry per cellar, search and filter. */
export const cellarItemsCacheKey = (
  cellarId: string,
  args: CellarItemsArgs,
): string => `${cellarId}\0${args.search}\0${args.types.join(",")}`;
