"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type FilterKind,
  kindCounts,
  matchesKinds,
  type PlaceKind,
  placesInView,
} from "../core/map-places";
import type { MapBounds, PlaceResult, UserLocation } from "../types";
import { useMapData, useMapFilters } from "./useMapMachine";
import { useMapSearchParams } from "./useMapSearchParams";
import { useTierListFilter } from "./useTierListFilter";

export type MapList = {
  /** What the list shows, filtered, nearest first. */
  places: PlaceResult[];
  counts: Record<PlaceKind, number>;
  /** Every place before the kind chips. */
  total: number;
  title: string;
  /** The search as typed, trimmed, while a search is on; else "". */
  query: string;
  loading: boolean;
  kinds: FilterKind[];
  setKinds: (kinds: FilterKind[]) => void;
  mine: boolean;
  mineAvailable: boolean;
  setMine: (on: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  /** Bumped when something outside the field empties the search. */
  resetKey: number;
  clearSearch: () => void;
  globalSearch: boolean;
  setGlobalSearch: (global: boolean) => void;
};

/**
 * The map's list (Map board "In view" and search results; desktop/Places):
 * what the dock, the desktop column, the quick look and the pins agree on.
 * In view: the places inside the map's bounds, nearest the viewer first.
 * Searching: the search's results, in their own order. The kind chips filter
 * both on the client and live in the URL (`kinds`); "Mine" is the owner's
 * place lists (`tierLists`, or a list's `/map?list=<id>` link, L40).
 */
export function useMapList({
  bounds,
  origin,
  userId,
}: {
  bounds: MapBounds | null;
  origin: UserLocation | null;
  userId: string;
}): MapList {
  const params = useMapSearchParams();
  const { mapItems, semanticResults, semanticResultsQuery, isLoading } =
    useMapData();
  const { isSemanticSearch, searchQuery } = useMapFilters();
  const { allTierListIds } = useTierListFilter(params.tierLists, userId);
  const [resetKey, setResetKey] = useState(0);

  const query = isSemanticSearch ? searchQuery.trim() : "";
  const answered =
    query !== "" && (semanticResultsQuery ?? "").trim() === query;

  const base = useMemo(
    () =>
      query !== ""
        ? answered
          ? [...(semanticResults ?? [])]
          : []
        : placesInView(mapItems, bounds, origin),
    [query, answered, semanticResults, mapItems, bounds, origin],
  );

  const kinds = params.kinds;
  const places = useMemo(
    () => base.filter((place) => matchesKinds(place, kinds)),
    [base, kinds],
  );
  const counts = useMemo(() => kindCounts(base), [base]);

  const { setSearch: setSearchParam, setTierLists } = params;
  const clearSearch = useCallback(() => {
    setSearchParam("");
    setResetKey((key) => key + 1);
  }, [setSearchParam]);

  return {
    places,
    counts,
    total: base.length,
    title: query !== "" ? "Results" : "In view",
    query,
    loading: isLoading || (query !== "" && !answered),
    kinds,
    setKinds: params.setKinds,
    mine: params.tierLists.length > 0,
    mineAvailable: allTierListIds.length > 0 || params.tierLists.length > 0,
    setMine: (on) => setTierLists(on ? allTierListIds : []),
    search: params.search,
    setSearch: setSearchParam,
    resetKey,
    clearSearch,
    globalSearch: params.globalSearch,
    setGlobalSearch: params.setGlobalSearch,
  };
}
