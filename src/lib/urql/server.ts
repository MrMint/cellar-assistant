import type { ResultOf, VariablesOf } from "@cellar-assistant/shared";
import type { TadaDocumentNode } from "gql.tada";
import { cookies } from "next/headers";
import { getClient } from "./server-client";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

// =============================================================================
// Type Definitions
// =============================================================================

interface NhostSessionData {
  accessToken: string;
  accessTokenExpiresIn?: number;
  user?: {
    id: string;
    email?: string;
  };
}

interface JWTPayload {
  sub?: string;
  exp?: number; // JWT expiration timestamp
  "https://hasura.io/jwt/claims"?: {
    "x-hasura-user-id": string;
    "x-hasura-default-role": string;
    "x-hasura-allowed-roles": string[];
  };
}

type ServerAuthHeaders = Record<string, string>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse JWT token safely
 */
function parseJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Validate session data structure
 */
function _isValidSessionData(data: unknown): data is NhostSessionData {
  return !!(
    data &&
    typeof data === "object" &&
    "accessToken" in data &&
    typeof (data as any).accessToken === "string" &&
    (data as any).accessToken.length > 0
  );
}

/**
 * Get auth headers from cookies for server requests
 * Includes Hasura-specific headers for RLS
 */
export async function getServerAuthHeaders(): Promise<ServerAuthHeaders> {
  try {
    if (isDev) console.log("🔑 [URQL] Getting server auth headers");
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("nhostSession")?.value;

    if (!sessionCookie) {
      if (isDev) console.log("🔑 [URQL] No session cookie found");
      return {};
    }

    if (isDev) console.log("🔑 [URQL] Session cookie found, parsing...");

    // Parse the session data from the new cookie format
    const sessionData: NhostSessionData = JSON.parse(sessionCookie);
    const accessToken = sessionData.accessToken;

    if (!accessToken) {
      if (isDev) console.log("🔑 [URQL] No access token in session data");
      return {};
    }

    if (isDev) {
      console.log("🔑 [URQL] Access token found, parsing JWT...");
      console.log(
        `🔑 [URQL] Session data says accessTokenExpiresIn: ${sessionData.accessTokenExpiresIn || "not set"}`,
      );
    }

    // Parse JWT to validate and extract claims
    const payload = parseJWTPayload(accessToken);
    if (!payload) {
      console.warn("🔑 [URQL] Invalid access token format");
      return {};
    }

    // Check token expiration from JWT
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = payload.exp - now;

      if (isDev) {
        const jwtExpiresAt = new Date(payload.exp * 1000).toISOString();
        console.log(
          `🔑 [URQL] JWT exp claim: ${payload.exp} (${jwtExpiresAt})`,
        );
        console.log(
          `🔑 [URQL] Current time: ${now} (${new Date().toISOString()})`,
        );

        if (timeUntilExpiry <= 0) {
          console.log(
            `🔑 [URQL] ⚠️  JWT token is EXPIRED by ${Math.abs(timeUntilExpiry)} seconds`,
          );
        } else {
          console.log(
            `🔑 [URQL] JWT token is valid for ${timeUntilExpiry} more seconds`,
          );
        }
      }
    } else {
      if (isDev) console.log("🔑 [URQL] No exp claim in JWT");
    }

    // Extract user ID from the JWT payload
    const userId =
      payload.sub ||
      payload["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] ||
      "";

    if (isDev) console.log(`🔑 [URQL] Creating headers for user: ${userId}`);

    const headers: ServerAuthHeaders = {
      Authorization: `Bearer ${accessToken}`,
    };

    // Add Hasura-specific headers if userId is available
    if (userId) {
      headers["X-Hasura-User-Id"] = userId;
      headers["X-Hasura-Role"] = "user";
    }

    if (isDev) console.log(`🔑 [URQL] Headers created successfully`);
    return headers;
  } catch (error) {
    if (isDev) console.log(`🔑 [URQL] Error getting auth headers: ${error}`);
    return {};
  }
}

/**
 * Server-side query utility with error handling.
 * Use this in Server Components for data fetching.
 *
 * When `headers` is provided, uses those instead of reading from cookies.
 * This is useful inside unstable_cache where cookies() is not available —
 * the caller extracts headers beforehand and passes them via closure.
 */
export async function serverQuery<TDocument extends TadaDocumentNode<any, any>>(
  query: TDocument,
  variables?: VariablesOf<TDocument>,
  headers?: ServerAuthHeaders,
): Promise<ResultOf<TDocument>> {
  if (!query) {
    throw new Error("Query document is required");
  }

  const client = getClient();
  const authHeaders = headers ?? (await getServerAuthHeaders());

  try {
    const result = await client
      .query(query, variables || {}, {
        fetchOptions: {
          headers: authHeaders,
          cache: "no-store",
        },
      })
      .toPromise();

    if (result.error) {
      console.error("Server query error:", result.error);
      console.error("Error graphQLErrors:", result.error.graphQLErrors);
      console.error("Error networkError:", result.error.networkError);

      // Provide more specific error messages
      const errorMessage =
        result.error.graphQLErrors?.length > 0
          ? result.error.graphQLErrors[0].message
          : result.error.networkError?.message || result.error.message;

      throw new Error(`GraphQL query failed: ${errorMessage}`);
    }

    if (!result.data) {
      throw new Error("No data returned from server query");
    }

    // Type assertion is safe here because gql.tada ensures type correspondence
    return result.data as ResultOf<TDocument>;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error during server query: ${String(error)}`);
  }
}

/**
 * Wrapper function for serverQuery to work with enum functions
 * Converts the typed serverQuery to the simpler format expected by enum functions
 */
export async function createEnumQueryFn() {
  return async (query: unknown, variables?: Record<string, unknown>) => {
    const result = await serverQuery(query as any, variables);
    return result as {
      __schema: {
        types: Array<{
          name: string;
          enumValues?: Array<{ name: string; description?: string }>;
        }>;
      };
    };
  };
}

/**
 * Admin query utility for user-agnostic cached operations.
 * Uses HASURA_ADMIN_SECRET instead of cookies, allowing use inside unstable_cache.
 *
 * IMPORTANT: Only use this for operations that don't require user-specific permissions.
 * The admin secret bypasses RLS, so use carefully.
 */
export async function adminQuery<TDocument extends TadaDocumentNode<any, any>>(
  query: TDocument,
  variables?: VariablesOf<TDocument>,
): Promise<ResultOf<TDocument>> {
  if (!query) {
    throw new Error("Query document is required");
  }

  const adminSecret = process.env.HASURA_ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error(
      "HASURA_ADMIN_SECRET is required for admin queries. Add it to your .env.local file.",
    );
  }

  const client = getClient();

  try {
    const result = await client
      .query(query, variables || {}, {
        fetchOptions: {
          headers: {
            "x-hasura-admin-secret": adminSecret,
          },
          cache: "no-store",
        },
      })
      .toPromise();

    if (result.error) {
      console.error("Admin query error:", result.error);

      const errorMessage =
        result.error.graphQLErrors?.length > 0
          ? result.error.graphQLErrors[0].message
          : result.error.networkError?.message || result.error.message;

      throw new Error(`Admin GraphQL query failed: ${errorMessage}`);
    }

    if (!result.data) {
      throw new Error("No data returned from admin query");
    }

    return result.data as ResultOf<TDocument>;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error during admin query: ${String(error)}`);
  }
}

/**
 * Server-side mutation utility with error handling
 * Use this in Server Actions for mutations
 */
export async function serverMutation<
  TMutation extends TadaDocumentNode<any, any>,
>(
  mutation: TMutation,
  variables?: VariablesOf<TMutation>,
): Promise<ResultOf<TMutation>> {
  if (!mutation) {
    throw new Error("Mutation document is required");
  }

  const client = getClient();
  const authHeaders = await getServerAuthHeaders();

  try {
    const result = await client
      .mutation(mutation, variables || {}, {
        fetchOptions: {
          headers: authHeaders,
          cache: "no-store",
        },
      })
      .toPromise();

    if (result.error) {
      console.error("Server mutation error:", result.error);
      console.error("Error graphQLErrors:", result.error.graphQLErrors);
      console.error("Error networkError:", result.error.networkError);

      // Provide more specific error messages
      const errorMessage =
        result.error.graphQLErrors?.length > 0
          ? result.error.graphQLErrors[0].message
          : result.error.networkError?.message || result.error.message;

      throw new Error(`GraphQL mutation failed: ${errorMessage}`);
    }

    if (!result.data) {
      throw new Error("No data returned from server mutation");
    }

    // Type assertion is safe here because gql.tada ensures type correspondence
    return result.data as ResultOf<TMutation>;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      `Unexpected error during server mutation: ${String(error)}`,
    );
  }
}
