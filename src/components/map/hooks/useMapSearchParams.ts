"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useCallback } from "react";
import type { ItemType, VisitStatus } from "../types";

const VALID_ITEM_TYPES: ItemType[] = [
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
];
const VALID_VISIT_STATUSES: VisitStatus[] = [
  "visited",
  "unvisited",
  "favorites",
];

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
 * Search is debounced at 500ms; other filters update immediately.
 * Values are validated against known types before being returned.
 */
export function useMapSearchParams() {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      throttleMs: 500,
    }),
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
    setGlobalSearchRaw(null);
  }, [
    setSearch,
    setItemTypes,
    setMinRating,
    setVisitStatuses,
    setTierLists,
    setGlobalSearchRaw,
  ]);

  return {
    // Values (validated)
    search,
    itemTypes: parseItemTypes(rawItemTypes),
    minRating,
    visitStatuses: parseVisitStatuses(rawVisitStatuses),
    tierLists: rawTierLists,
    globalSearch,

    // Setters
    setSearch: (value: string) => setSearch(value || null),
    setItemTypes: (value: ItemType[]) =>
      setItemTypes(value.length > 0 ? value : null),
    setMinRating: (value: number | undefined | null) =>
      setMinRating(value ?? null),
    setVisitStatuses: (value: VisitStatus[]) =>
      setVisitStatuses(value.length > 0 ? value : null),
    setTierLists: (value: string[]) =>
      setTierLists(value.length > 0 ? value : null),
    setGlobalSearch: (value: boolean) =>
      setGlobalSearchRaw(value ? null : false),

    // Clear all
    clearAllFilters,
  };
}
