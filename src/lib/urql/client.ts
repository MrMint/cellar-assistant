import type { NhostClient } from "@nhost/nhost-js";
import {
  cacheExchange,
  createClient,
  fetchExchange,
  ssrExchange,
  subscriptionExchange,
} from "@urql/core";
import { devtoolsExchange } from "@urql/devtools";
import { createClient as createWSClient } from "graphql-ws";
import { createCookieAuthExchange } from "./auth-exchange";

/**
 * Creates a URQL client for client components with SSR support
 * This includes SSR exchange for proper hydration
 */
export function makeClientClient(nhost: NhostClient) {
  const ssr = ssrExchange({
    isClient: typeof window !== "undefined",
    staleWhileRevalidate: true, // Update stale SSG data
  });

  const exchanges = [
    devtoolsExchange,
    cacheExchange,
    ssr,
    createCookieAuthExchange(), // Handle auth errors and token refresh
    fetchExchange,
  ];

  // Add subscription support on client-side only
  if (typeof window !== "undefined") {
    // For websockets, we'll need to construct the WS URL from the GraphQL URL
    const wsUrl = nhost.graphql.url
      .replace("https://", "wss://")
      .replace("http://", "ws://");

    // Close the active socket when session changes
    let activeSocket: any;

    // Subscribe to session changes to reconnect WebSocket with new token
    nhost.sessionStorage?.onChange?.(() => {
      if (activeSocket) {
        activeSocket.close();
        activeSocket = null;
      }
    });

    const wsClient = createWSClient({
      url: wsUrl,
      connectionParams() {
        // Get current session and extract access token
        const session = nhost.getUserSession();
        const accessToken = session?.accessToken;

        return {
          headers: {
            Authorization: accessToken ? `Bearer ${accessToken}` : "",
            "Sec-WebSocket-Protocol": "graphql-ws",
          },
        };
      },
      on: {
        connected: (socket: any) => {
          activeSocket = socket;
        },
      },
    });

    exchanges.push(
      subscriptionExchange({
        forwardSubscription: (operation) => {
          return {
            subscribe: (sink) => {
              if (!operation.query) throw new Error("No query provided");
              return {
                unsubscribe: wsClient.subscribe(
                  {
                    ...operation,
                    query: operation.query!,
                  },
                  sink,
                ),
              };
            },
          };
        },
      }),
    );
  }

  const client = createClient({
    url: "/api/graphql", // Use our secure GraphQL proxy
    exchanges,
    fetchOptions: {
      method: "POST", // Ensure POST requests to avoid any GET/persisted query issues
    },
    preferGetMethod: false, // Explicitly disable GET method
    // Temporarily disable suspense to test
    // suspense: true, // Enable Suspense mode for streaming SSR
  });

  return { client, ssr };
}
