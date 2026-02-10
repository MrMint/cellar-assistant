import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

export const mapSearchParamsCache = createSearchParamsCache({
  search: parseAsString.withDefault(""),
  itemTypes: parseAsArrayOf(parseAsString).withDefault([]),
  minRating: parseAsInteger,
  visitStatuses: parseAsArrayOf(parseAsString).withDefault([]),
});
