"use client";

import { graphql } from "@cellar-assistant/shared";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "urql";

const GetUserPlaceTierListsQuery = graphql(`
  query GetUserPlaceTierLists($userId: uuid!) {
    tier_lists(
      where: { list_type: { _eq: "place" }, created_by_id: { _eq: $userId } }
      order_by: { name: asc }
    ) {
      id
      name
    }
  }
`);

export interface TierListFilterOption {
  id: string;
  name: string;
}

export function useTierListFilter(
  selectedTierListIds: string[],
  onInitialize?: (ids: string[]) => void,
  userId?: string,
) {
  const [{ data, fetching }] = useQuery({
    query: GetUserPlaceTierListsQuery,
    variables: { userId: userId ?? "" },
    pause: !userId,
  });

  const [initialized, setInitialized] = useState(false);

  const tierLists: TierListFilterOption[] = useMemo(() => {
    if (!data?.tier_lists) return [];
    return data.tier_lists.map((tl) => ({
      id: tl.id,
      name: tl.name,
    }));
  }, [data]);

  const allTierListIds = useMemo(
    () => tierLists.map((tl) => tl.id),
    [tierLists],
  );

  // On first data load, if no URL param exists, write all tier list IDs
  // to the URL so subsequent toggles work correctly.
  useEffect(() => {
    if (
      !initialized &&
      selectedTierListIds.length === 0 &&
      allTierListIds.length > 0 &&
      onInitialize
    ) {
      setInitialized(true);
      onInitialize(allTierListIds);
    }
  }, [initialized, selectedTierListIds, allTierListIds, onInitialize]);

  // Before initialization, default to all selected to avoid a flash
  // of unfiltered places. Once initialized is true, only use the
  // explicit URL param value.
  const effectiveSelectedIds = useMemo(() => {
    if (
      !initialized &&
      selectedTierListIds.length === 0 &&
      tierLists.length > 0
    ) {
      return allTierListIds;
    }
    return selectedTierListIds;
  }, [initialized, selectedTierListIds, tierLists, allTierListIds]);

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
