"use client";

import { graphql } from "@cellar-assistant/shared";
import { useMemo } from "react";
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
  userId?: string,
) {
  const [{ data, fetching }] = useQuery({
    query: GetUserPlaceTierListsQuery,
    variables: { userId: userId ?? "" },
    pause: !userId,
  });

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
