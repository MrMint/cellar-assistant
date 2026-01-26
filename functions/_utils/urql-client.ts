/**
 * URQL Client for Functions
 *
 * Provides a URQL client that can be used in Nhost functions for GraphQL operations.
 * This replaces the Nhost GraphQL client approach and uses the same proven patterns
 * as the main application.
 */

import type { ResultOf, VariablesOf } from "@cellar-assistant/shared";
import { cacheExchange, createClient, fetchExchange } from "@urql/core";
import type { TadaDocumentNode } from "gql.tada";
import { print } from "graphql";

// =============================================================================
// Types
// =============================================================================

interface FunctionAuthHeaders {
  Authorization?: string;
  "X-Hasura-User-Id"?: string;
  "X-Hasura-Role"?: string;
  "X-Hasura-Admin-Secret"?: string;
  "nhost-webhook-secret"?: string;
  [key: string]: string | undefined;
}

interface FunctionGraphQLOptions {
  headers?: FunctionAuthHeaders;
  cache?: RequestCache;
  requestPolicy?:
    | "cache-first"
    | "cache-only"
    | "network-only"
    | "cache-and-network";
  timeout?: number;
}

// =============================================================================
// Client Creation
// =============================================================================

// Create singleton client instance with URL tracking
let _functionClient: ReturnType<typeof createClient> | null = null;
let _graphqlUrl: string | null = null;

/**
 * Get the GraphQL URL for raw queries
 */
export function getGraphQLUrl(): string {
  if (!_graphqlUrl) {
    // Ensure client is created which sets the URL
    getFunctionClient();
  }
  if (!_graphqlUrl) {
    throw new Error("GraphQL URL not initialized");
  }
  return _graphqlUrl;
}

/**
 * Create a URQL client and store the URL
 */
function createFunctionClientWithUrl(): ReturnType<typeof createClient> {
  const subdomain =
    process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || process.env.NHOST_SUBDOMAIN;
  const region =
    process.env.NEXT_PUBLIC_NHOST_REGION || process.env.NHOST_REGION;

  if (!subdomain) {
    throw new Error("NHOST_SUBDOMAIN environment variable is required");
  }

  // Construct GraphQL URL based on Nhost configuration
  _graphqlUrl =
    region && region !== "local"
      ? `https://${subdomain}.graphql.${region}.nhost.run/v1`
      : `https://local.hasura.local.nhost.run/v1/graphql`;

  console.log(`🔗 [URQL Functions] Creating client for: ${_graphqlUrl}`);

  return createClient({
    url: _graphqlUrl,
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => ({
      cache: "no-store",
      method: "POST",
    }),
  });
}

/**
 * Get the singleton URQL client for functions
 */
export function getFunctionClient() {
  if (!_functionClient) {
    _functionClient = createFunctionClientWithUrl();
  }
  return _functionClient;
}

// =============================================================================
// Auth Header Utilities
// =============================================================================

/**
 * Get standard function auth headers including webhook secret
 */
export function getFunctionAuthHeaders(
  userId?: string,
  accessToken?: string,
): FunctionAuthHeaders {
  const headers: FunctionAuthHeaders = {};

  // Add authorization if we have a token
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Add Hasura-specific headers if we have a user ID
  if (userId) {
    headers["X-Hasura-User-Id"] = userId;
    headers["X-Hasura-Role"] = "user";
  }

  // Always add webhook secret for function authentication
  if (process.env.NHOST_WEBHOOK_SECRET) {
    headers["nhost-webhook-secret"] = process.env.NHOST_WEBHOOK_SECRET;
  }

  return headers;
}

// Track if admin auth warning has been logged to avoid spam
let adminAuthWarningLogged = false;

/**
 * Get admin auth headers for privileged operations
 * @throws Error if in strict mode and secrets are not configured (future enhancement)
 */
export function getAdminAuthHeaders(): FunctionAuthHeaders {
  const headers: FunctionAuthHeaders = {};
  const missingSecrets: string[] = [];

  // Use admin secret if available
  if (process.env.NHOST_ADMIN_SECRET) {
    headers["X-Hasura-Admin-Secret"] = process.env.NHOST_ADMIN_SECRET;
  } else {
    missingSecrets.push("NHOST_ADMIN_SECRET");
  }

  // Add webhook secret
  if (process.env.NHOST_WEBHOOK_SECRET) {
    headers["nhost-webhook-secret"] = process.env.NHOST_WEBHOOK_SECRET;
  } else {
    missingSecrets.push("NHOST_WEBHOOK_SECRET");
  }

  // Log warning once per process to avoid log spam
  if (missingSecrets.length > 0 && !adminAuthWarningLogged) {
    console.error(
      `🚨 [URQL Functions] Missing auth secrets: ${missingSecrets.join(", ")} - admin operations will fail`,
    );
    adminAuthWarningLogged = true;
  }

  return headers;
}

// =============================================================================
// Query Utilities
// =============================================================================

/**
 * Execute a GraphQL query using raw fetch to avoid URQL's persisted query behavior.
 * gql.tada documents may include documentId which URQL uses for persisted queries,
 * but Hasura doesn't support this format and returns PersistedQueryNotSupported.
 * We use print() to convert the document to a query string and send it directly.
 */
export async function functionQuery<
  TDocument extends TadaDocumentNode<any, any>,
>(
  query: TDocument,
  variables?: VariablesOf<TDocument>,
  options?: FunctionGraphQLOptions,
): Promise<ResultOf<TDocument>> {
  if (!query) {
    throw new Error("Query document is required");
  }

  // Convert document node to query string to bypass persisted query behavior
  const queryString = print(query);

  try {
    console.log(`🔍 [URQL Functions] Executing query`);
    console.log(
      `🔍 [URQL Functions] Query variables:`,
      JSON.stringify(variables || {}, null, 2),
    );

    const response = await fetch(getGraphQLUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || getFunctionAuthHeaders()),
      },
      body: JSON.stringify({
        query: queryString,
        variables: variables || {},
      }),
      cache: options?.cache || "no-store",
      ...(options?.timeout && {
        signal: AbortSignal.timeout(options.timeout),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      console.error("🔍 [URQL Functions] Query error:", result.errors);
      console.error("🔍 [URQL Functions] Query variables:", variables);

      // Enhanced error context logging
      result.errors.forEach((gqlError: unknown, index: number) => {
        const error = gqlError as {
          message?: string;
          path?: unknown;
          extensions?: unknown;
        };
        console.error(`🔍 [URQL Functions] GraphQL Error ${index + 1}:`, {
          message: error.message,
          path: error.path,
          extensions: error.extensions,
        });
      });

      throw new Error(
        `GraphQL query failed: ${(result.errors[0] as { message: string }).message}`,
      );
    }

    if (!result.data) {
      throw new Error("No data returned from function query");
    }

    console.log(`✅ [URQL Functions] Query executed successfully`);
    return result.data as ResultOf<TDocument>;
  } catch (error) {
    console.error(`❌ [URQL Functions] Query execution failed:`, error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error during function query: ${String(error)}`);
  }
}

/**
 * Execute a GraphQL mutation using raw fetch to avoid persisted query behavior.
 * Same approach as functionQuery - converts document to string to ensure
 * the full query is always sent.
 */
export async function functionMutation<
  TMutation extends TadaDocumentNode<any, any>,
>(
  mutation: TMutation,
  variables?: VariablesOf<TMutation>,
  options?: FunctionGraphQLOptions,
): Promise<ResultOf<TMutation>> {
  if (!mutation) {
    throw new Error("Mutation document is required");
  }

  // Convert document node to query string to bypass persisted query behavior
  const mutationString = print(mutation);

  try {
    console.log(`🔄 [URQL Functions] Executing mutation`);

    const response = await fetch(getGraphQLUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || getFunctionAuthHeaders()),
      },
      body: JSON.stringify({
        query: mutationString,
        variables: variables || {},
      }),
      cache: options?.cache || "no-store",
      ...(options?.timeout && {
        signal: AbortSignal.timeout(options.timeout),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      console.error("🔄 [URQL Functions] Mutation error:", result.errors);
      console.error("🔄 [URQL Functions] Mutation variables:", variables);

      // Enhanced error context logging
      result.errors.forEach((gqlError: unknown, index: number) => {
        const error = gqlError as {
          message?: string;
          path?: unknown;
          extensions?: unknown;
        };
        console.error(`🔄 [URQL Functions] GraphQL Error ${index + 1}:`, {
          message: error.message,
          path: error.path,
          extensions: error.extensions,
        });
      });

      throw new Error(
        `GraphQL mutation failed: ${(result.errors[0] as { message: string }).message}`,
      );
    }

    if (!result.data) {
      throw new Error("No data returned from function mutation");
    }

    console.log(`✅ [URQL Functions] Mutation executed successfully`);
    return result.data as ResultOf<TMutation>;
  } catch (error) {
    console.error(`❌ [URQL Functions] Mutation execution failed:`, error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      `Unexpected error during function mutation: ${String(error)}`,
    );
  }
}

// =============================================================================
// Raw GraphQL Utilities (for migration compatibility)
// =============================================================================

/**
 * Execute raw GraphQL with string queries (for legacy compatibility)
 * This is useful during migration from Nhost GraphQL client patterns
 */
export async function functionRawGraphQL<TData = any>(
  query: string,
  variables?: Record<string, any>,
  options?: FunctionGraphQLOptions,
): Promise<TData> {
  if (!query) {
    throw new Error("Query string is required");
  }

  try {
    console.log(`🔍 [URQL Functions] Executing raw GraphQL`);

    // Use the underlying fetch to execute raw GraphQL
    const requestBody = {
      query,
      variables: variables || {},
    };

    console.log(
      `🔍 [URQL Functions] Raw GraphQL request body:`,
      JSON.stringify(requestBody, null, 2),
    );

    const response = await fetch(getGraphQLUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || getFunctionAuthHeaders()),
      },
      body: JSON.stringify(requestBody),
      cache: options?.cache || "no-store",
      ...(options?.timeout && {
        signal: AbortSignal.timeout(options.timeout),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      console.error("🔍 [URQL Functions] GraphQL errors:", result.errors);
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    console.log(`✅ [URQL Functions] Raw GraphQL executed successfully`);
    return result.data;
  } catch (error) {
    console.error(`❌ [URQL Functions] Raw GraphQL execution failed:`, error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error during raw GraphQL: ${String(error)}`);
  }
}
