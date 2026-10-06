import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsString,
} from "nuqs/server";

export {
  ITEMS_PAGE_SIZE,
  parseItemTypes,
} from "@/components/cellar/cellarItemsQuery";

/**
 * `82450ad1:…/items/searchParams.ts`: `?search=` and `?types=WINE,BEER`, the
 * URL format production links carry. The validation and page size moved to
 * `components/cellar/cellarItemsQuery.ts`, a plain module the client grid can
 * import without pulling in `nuqs/server`.
 */
export const itemsSearchParamsCache = createSearchParamsCache({
  search: parseAsString.withDefault(""),
  types: parseAsArrayOf(parseAsString).withDefault([]),
});
