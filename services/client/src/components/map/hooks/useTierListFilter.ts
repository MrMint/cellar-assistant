"use client";

import { useMemo } from "react";
import { useQuery } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { MAP_TIER_LISTS_PAGE_SIZE, MapTierListsQuery } from "../queries";

/*
 * `82450ad1`'s `GetUserPlaceTierLists` (`list_type = place`, created by the
 * viewer, by name) → `myTierLists` narrowed to the viewer's own place lists
 * and sorted client-side (G33 is not built). The list ids then go to
 * `mapBrowse`/`placeSearch`, which reduce them through `canSeeTierList`.
 */

export interface TierListFilterOption {
  id: string;
  name: string;
}

export function useTierListFilter(
  selectedTierListIds: string[],
  userId?: string,
) {
  const [{ data, fetching }] = useQuery({
    query: MapTierListsQuery,
    variables: { first: MAP_TIER_LISTS_PAGE_SIZE },
    pause: !userId,
  });

  const tierLists: TierListFilterOption[] = useMemo(() => {
    const result = unwrapResult(data?.myTierLists, "TierListConnection");
    const viewerId = data?.me?.id ?? null;
    if (!result.ok || viewerId === null) return [];
    return result.data.edges
      .map((edge) => edge.node)
      .filter((tl) => tl.listType === "place" && tl.createdById === viewerId)
      .map((tl) => ({ id: tl.id, name: tl.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const allTierListIds = useMemo(
    () => tierLists.map((tl) => tl.id),
    [tierLists],
  );

  // Default to no tier list filtering — show all places.
  // Users can opt in to tier list filtering via the UI.
  const effectiveSelectedIds = selectedTierListIds;

  // Whether the filter is actively restricting results
  // (not all tier lists are selected, meaning some are deselected)
  const isFilterActive = useMemo(() => {
    if (tierLists.length === 0) return false;
    return (
      effectiveSelectedIds.length > 0 &&
      effectiveSelectedIds.length < tierLists.length
    );
  }, [tierLists, effectiveSelectedIds]);

  return {
    tierLists,
    allTierListIds,
    effectiveSelectedIds,
    isFilterActive,
    loading: fetching,
  };
}
