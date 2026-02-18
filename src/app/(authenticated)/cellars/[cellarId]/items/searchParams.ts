import { ITEM_TYPES, type ItemTypeValue } from "@cellar-assistant/shared";
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

export const ITEMS_PAGE_SIZE = 50;

export const itemsSearchParamsCache = createSearchParamsCache({
  search: parseAsString.withDefault(""),
  types: parseAsArrayOf(parseAsString).withDefault([]),
  limit: parseAsInteger.withDefault(ITEMS_PAGE_SIZE),
});

/**
 * Validates and filters an array of strings to only include valid ItemTypeValue values.
 * Returns an empty array if input is empty or contains no valid types.
 */
export function parseItemTypes(types: string[]): ItemTypeValue[] {
  return types.filter((t): t is ItemTypeValue =>
    ITEM_TYPES.includes(t as ItemTypeValue),
  );
}
