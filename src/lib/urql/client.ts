import type { NhostClient } from "@nhost/nhost-js";
import { createClient, fetchExchange, ssrExchange } from "@urql/core";
import { devtoolsExchange } from "@urql/devtools";
import { cacheExchange } from "@urql/exchange-graphcache";
import { createCookieAuthExchange } from "./auth-exchange";

/**
 * Creates a URQL client for client components with SSR support
 * This includes SSR exchange for proper hydration
 */
export function makeClientClient(_nhost: NhostClient) {
  const ssr = ssrExchange({
    isClient: typeof window !== "undefined",
    staleWhileRevalidate: true, // Update stale SSG data
  });

  const exchanges = [
    devtoolsExchange,
    cacheExchange({
      // Configure keys for Hasura types that don't have IDs
      keys: {
        // Aggregate types don't have IDs - embed them on parent
        cellar_items_aggregate: () => null,
        cellar_items_aggregate_fields: () => null,
        item_reviews_aggregate: () => null,
        item_reviews_aggregate_fields: () => null,
        item_reviews_avg_fields: () => null,
        item_favorites_aggregate: () => null,
        item_favorites_aggregate_fields: () => null,
        item_vectors: () => null,
        item_image: () => null,
      },
    }),
    ssr,
    createCookieAuthExchange(), // Handle auth errors and token refresh
    fetchExchange,
  ];

  const client = createClient({
    url: "/api/graphql", // Use our secure GraphQL proxy
    exchanges,
    fetchOptions: {
      method: "POST", // Ensure POST requests to avoid any GET/persisted query issues
    },
    preferGetMethod: false, // Explicitly disable GET method
  });

  return { client, ssr };
}
