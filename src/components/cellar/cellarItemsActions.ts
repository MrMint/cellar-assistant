"use server";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { getServerAuthHeaders } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";
import {
  type CachedCellarItemsResult,
  getCachedCellarItems,
} from "./cellarItemsServer";

export type LoadMoreResult = CachedCellarItemsResult;

/**
 * Server action to load the next batch of cellar items.
 * Reads from the same cache populated by the initial RSC render,
 * so subsequent load-more calls are instant (cache hit → slice).
 */
export async function loadMoreCellarItemsAction(
  cellarId: string,
  search: string,
  types: ItemTypeValue[],
  offset: number,
  batchSize: number,
): Promise<LoadMoreResult> {
  const userId = await getServerUserId();

  if (!userId) {
    return { items: [], totalCount: 0 };
  }

  const authHeaders = await getServerAuthHeaders();
  const { items: sortedItems, totalCount } = await getCachedCellarItems(
    cellarId,
    authHeaders,
  )(userId, search, types);

  return {
    items: sortedItems.slice(offset, offset + batchSize),
    totalCount,
  };
}
