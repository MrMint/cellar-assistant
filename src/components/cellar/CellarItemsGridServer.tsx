import type { ItemTypeValue } from "@cellar-assistant/shared";
import { getServerAuthHeaders } from "@/lib/urql/server";
import { CellarItemsGrid } from "./CellarItemsGrid";
import { getCachedCellarItems } from "./cellarItemsServer";

interface CellarItemsGridServerProps {
  cellarId: string;
  userId: string;
  search: string;
  types: ItemTypeValue[];
  limit: number;
}

/**
 * Async server component that fetches and renders cellar items.
 * Designed to be wrapped in Suspense for streaming.
 *
 * Extracts auth headers from cookies, then passes them into the cached
 * function via closure — so Hasura RLS is enforced on cache miss, and
 * subsequent load-more calls from the server action hit the same cache.
 */
export async function CellarItemsGridServer({
  cellarId,
  userId,
  search,
  types,
  limit,
}: CellarItemsGridServerProps) {
  const authHeaders = await getServerAuthHeaders();
  const { items: sortedItems, totalCount } = await getCachedCellarItems(
    cellarId,
    authHeaders,
  )(userId, search, types);

  if (totalCount === 0) {
    return null;
  }

  return (
    <CellarItemsGrid
      initialItems={sortedItems.slice(0, limit)}
      totalCount={totalCount}
      cellarId={cellarId}
      search={search}
      types={types}
    />
  );
}
