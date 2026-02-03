import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { adminQuery, serverQuery } from "@/lib/urql/server";
import { CacheTags } from "./tags";

export { CacheTags } from "./tags";

/**
 * Cached search vector generation.
 *
 * Search vectors (embeddings) are user-agnostic - the same search text
 * produces the same embedding for all users. This is expensive to compute
 * (requires API call to embedding service) so we cache it for 24 hours.
 *
 * Uses adminQuery instead of serverQuery because:
 * 1. unstable_cache cannot use cookies() (which serverQuery uses for auth)
 * 2. Search vectors don't require user-specific permissions
 * 3. The underlying action only validates the webhook secret, not user auth
 *
 * Requires HASURA_ADMIN_SECRET environment variable.
 *
 * @param searchText - The search query text
 * @returns JSON stringified vector or undefined if empty/invalid
 */
export const getCachedSearchVector = unstable_cache(
  async (searchText: string): Promise<string | undefined> => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      return undefined;
    }

    const vectorData = await adminQuery(getSearchVectorQuery, {
      text: trimmed,
    });

    if (!vectorData?.create_search_vector) {
      return undefined;
    }

    return JSON.stringify(vectorData.create_search_vector);
  },
  ["search-vector"],
  {
    revalidate: 86400, // 24 hours - embeddings don't change
    tags: [CacheTags.searchVectors],
  },
);

/**
 * Request-scoped memoization for serverQuery.
 *
 * React's cache() deduplicates function calls within a single render pass.
 * This prevents duplicate GraphQL requests when the same query is called
 * multiple times during a single page render.
 *
 * Note: This only works within a single request - it does NOT persist
 * across requests like unstable_cache does.
 */
export const memoizedServerQuery = cache(serverQuery);
