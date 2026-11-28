"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useCallback } from "react";
import type { FilterKind } from "../core/map-places";
import type { ItemType, VisitStatus } from "../types";
import { kindsFromUrl, tierListIdsFromUrl } from "./map-url";

const VALID_ITEM_TYPES: ItemType[] = [
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
  "tea",
];
// "favorites" is not accepted from the URL any more: the old map showed a
// chip for it and filtered nothing (it never reached SQL, §7), and the API's
// `VisitStatusFilter` has no FAVORITE (G34). The filter panel only ever
// offered Any / New Places / Visited, and those all work.
const VALID_VISIT_STATUSES: VisitStatus[] = ["visited", "unvisited"];

function parseItemTypes(raw: string[]): ItemType[] {
  return raw.filter((t): t is ItemType =>
    VALID_ITEM_TYPES.includes(t as ItemType),
  );
}

function parseVisitStatuses(raw: string[]): VisitStatus[] {
  return raw.filter((s): s is VisitStatus =>
    VALID_VISIT_STATUSES.includes(s as VisitStatus),
  );
}

/**
 * Hook providing nuqs-backed URL state for all map filter parameters.
 * Search updates URL immediately; debouncing is handled at the component level
 * (MapControls) to decouple the input value from URL state and prevent text reversion.
 * Values are validated against known types before being returned.
 */
export function useMapSearchParams() {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  );

  const [rawItemTypes, setItemTypes] = useQueryState(
    "itemTypes",
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const [minRating, setMinRating] = useQueryState("minRating", parseAsInteger);

  const [rawVisitStatuses, setVisitStatuses] = useQueryState(
    "visitStatuses",
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const [rawTierLists, setTierLists] = useQueryState(
    "tierLists",
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // The kind chips (Map board: Coffee / Food / Bar), filtered on the client.
  const [rawKinds, setKinds] = useQueryState(
    "kinds",
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // L40: a tier list's map link, `/map?list=<id>`.
  const [list, setList] = useQueryState("list", parseAsString);

  // Deep-link to a specific place (e.g. after creating one)
  const [placeId, setPlaceId] = useQueryState("placeId", parseAsString);

  // FS-1: `/map?add=1` opens the Add a place sheet over the map (the
  // capture sheets' "Add a place", `/map/create-place` without a pin).
  const [add, setAdd] = useQueryState("add", parseAsBoolean);

  // Global search defaults to true — semantic search ignores viewport bounds
  const [globalSearch, setGlobalSearchRaw] = useQueryState(
    "global",
    parseAsBoolean.withDefault(true),
  );

  const clearAllFilters = useCallback(() => {
    setSearch(null);
    setItemTypes(null);
    setMinRating(null);
    setVisitStatuses(null);
    setTierLists(null);
    setList(null);
    setKinds(null);
    setGlobalSearchRaw(null);
  }, [
    setSearch,
    setItemTypes,
    setMinRating,
    setVisitStatuses,
    setTierLists,
    setList,
    setKinds,
    setGlobalSearchRaw,
  ]);

  return {
    // Values (validated)
    search,
    itemTypes: parseItemTypes(rawItemTypes),
    minRating,
    visitStatuses: parseVisitStatuses(rawVisitStatuses),
    tierLists: tierListIdsFromUrl({ list, tierLists: rawTierLists }),
    /** L40 / F-191: the `?list=<id>` a list's Map link carries, or null. */
    list,
    placeId,
    /** FS-1: open the Add a place sheet on arrival. */
    add: add === true,
    globalSearch,
    kinds: kindsFromUrl(rawKinds),

    // Setters
    setSearch: (value: string) => setSearch(value || null),
    setItemTypes: (value: ItemType[]) =>
      setItemTypes(value.length > 0 ? value : null),
    setMinRating: (value: number | undefined | null) =>
      setMinRating(value ?? null),
    setVisitStatuses: (value: VisitStatus[]) =>
      setVisitStatuses(value.length > 0 ? value : null),
    // The filter's own choice replaces a list link's (L40): one param holds it.
    setTierLists: (value: string[]) => {
      setList(null);
      return setTierLists(value.length > 0 ? value : null);
    },
    setPlaceId: (
      value: string | null,
      options?: { history?: "push" | "replace" },
    ) => setPlaceId(value, options),
    clearAdd: () => setAdd(null, { history: "replace" }),
    setKinds: (value: FilterKind[]) =>
      setKinds(value.length > 0 ? value : null),
    setGlobalSearch: (value: boolean) =>
      setGlobalSearchRaw(value ? null : false),

    // Clear all
    clearAllFilters,
  };
}
