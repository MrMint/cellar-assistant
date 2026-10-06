"use client";

import { useMemo } from "react";
import { useAllMyTierLists } from "@/components/tier-list/useAllMyTierLists";

/*
 * `82450ad1`'s `GetUserPlaceTierLists` (`list_type = place`, created by the
 * viewer, by name) → **every page** of `myTierLists` (`useAllMyTierLists`)
 * narrowed to the viewer's own place lists and sorted client-side (G33 is
 * not built). Narrowing only the first 100 visible lists dropped the
 * viewer's own for anyone who sees more. The list ids then go to
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
  const { lists, viewerId, loading } = useAllMyTierLists({
    active: Boolean(userId),
  });

  const tierLists: TierListFilterOption[] = useMemo(() => {
    if (viewerId === null) return [];
    return lists
      .filter((tl) => tl.listType === "place" && tl.createdById === viewerId)
      .map((tl) => ({ id: tl.id, name: tl.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lists, viewerId]);

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
    loading,
  };
}
