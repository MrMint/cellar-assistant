import { FILTER_KINDS, type FilterKind } from "../core/map-places";

/**
 * The map's URL, read (L40). A tier list links to its places on the map as
 * `/map?list=<id>`; the map's own filter writes `tierLists=a,b`. Both land
 * in the same `tierListIds`, the list once, after any already chosen.
 */
export function tierListIdsFromUrl({
  list,
  tierLists,
}: {
  list: string | null;
  tierLists: readonly string[];
}): string[] {
  const ids = [...tierLists];
  const linked = list?.trim();
  if (linked && !ids.includes(linked)) ids.push(linked);
  return ids;
}

/** The kind chips' URL value (`kinds=coffee,bar`), unknown words dropped. */
export function kindsFromUrl(raw: readonly string[]): FilterKind[] {
  return FILTER_KINDS.filter((kind) => raw.includes(kind));
}
