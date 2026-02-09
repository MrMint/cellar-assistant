"use client";

import { useEffect, useRef } from "react";
import type { ItemType, VisitStatus } from "../types";
import { useMapActions } from "./useMapMachine";

interface MapSearchParamsValues {
  search: string;
  itemTypes: ItemType[];
  minRating: number | null;
  visitStatuses: VisitStatus[];
  tierLists: string[];
}

/**
 * Sync hook: watches nuqs URL state and sends corresponding XState events.
 * One-directional: nuqs → XState. URL is the source of truth for filters.
 *
 * Accepts values directly to avoid a second useMapSearchParams() call.
 * Initializes XState from URL on mount when URL has non-default values,
 * then tracks subsequent changes via prev refs.
 */
export function useSearchParamsSync(params: MapSearchParamsValues) {
  const { search, itemTypes, minRating, visitStatuses, tierLists } = params;
  const actions = useMapActions();

  const prevSearch = useRef<string | undefined>(undefined);
  const prevItemTypes = useRef<ItemType[] | undefined>(undefined);
  const prevMinRating = useRef<number | null | undefined>(undefined);
  const prevVisitStatuses = useRef<VisitStatus[] | undefined>(undefined);
  const prevTierLists = useRef<string[] | undefined>(undefined);

  // Sync item types (including initial URL → XState on mount)
  useEffect(() => {
    if (JSON.stringify(prevItemTypes.current) === JSON.stringify(itemTypes))
      return;
    prevItemTypes.current = itemTypes;
    actions.setItemTypes(itemTypes);
  }, [itemTypes, actions]);

  // Sync min rating
  useEffect(() => {
    if (prevMinRating.current === minRating) return;
    prevMinRating.current = minRating;
    actions.setMinRating(minRating ?? undefined);
  }, [minRating, actions]);

  // Sync visit statuses
  useEffect(() => {
    if (
      JSON.stringify(prevVisitStatuses.current) ===
      JSON.stringify(visitStatuses)
    )
      return;
    prevVisitStatuses.current = visitStatuses;
    actions.setVisitStatuses(visitStatuses);
  }, [visitStatuses, actions]);

  // Sync tier list IDs
  useEffect(() => {
    if (JSON.stringify(prevTierLists.current) === JSON.stringify(tierLists))
      return;
    prevTierLists.current = tierLists;
    actions.setTierListIds(tierLists);
  }, [tierLists, actions]);

  // Sync search — semantic search when non-empty, refresh when cleared
  useEffect(() => {
    if (prevSearch.current === search) return;
    const isInitialMount = prevSearch.current === undefined;
    prevSearch.current = search;

    if (search.trim().length > 0) {
      actions.performSemanticSearch(search);
    } else if (!isInitialMount) {
      // Only refresh when actively clearing, not on mount with empty search
      actions.setSearchQuery("");
      actions.refreshPlaces();
    }
  }, [search, actions]);
}
