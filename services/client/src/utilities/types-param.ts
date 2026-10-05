/**
 * `?types=["WINE","BEER"]` → the type filter, without trusting the URL.
 *
 * The old `useTypesFilterState` did `JSON.parse(searchParams.get("types"))`,
 * so a hand-edited or truncated link threw during render and took the page
 * down (§7, "`JSON.parse` of raw `?types=`"). The URL format is kept — links
 * shared from production still filter — but anything that is not a JSON array
 * of known types reads as "no filter", and unknown members are dropped.
 */

import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";

const isItemType = (value: unknown): value is ApiItemType =>
  typeof value === "string" &&
  (ITEM_TYPES as readonly string[]).includes(value);

export const parseTypesParam = (
  raw: string | null | undefined,
): ApiItemType[] => {
  if (raw === null || raw === undefined || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isItemType)
    .filter((type, index, all) => all.indexOf(type) === index);
};
