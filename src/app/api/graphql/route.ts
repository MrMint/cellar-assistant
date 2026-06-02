import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_CONFIG,
  SESSION_COOKIE_NAME,
  createStatelessNhostClient,
  getNhostConfig,
} from "@/lib/nhost/server";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

/** Parse JWT to get expiry time */
function getJWTExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

/** Check if access token is expiring soon (but NOT already expired).
 *  Returns true only when the token is within `marginSeconds` of expiry
 *  but still technically valid. Fully-expired tokens should be handled
 *  by the middleware redirect, not the proxy. */
function isTokenExpiringSoon(
  accessToken: string,
  marginSeconds = 300,
): boolean {
  const exp = getJWTExpiry(accessToken);
  if (!exp) return false; // Can't determine — don't attempt refresh
  const now = Math.floor(Date.now() / 1000);
  const remaining = exp - now;
  return remaining > 0 && remaining < marginSeconds;
}

/** Get the GraphQL URL for Hasura */
function getGraphQLUrl(): string {
  const envUrl =
    process.env.NHOST_GRAPHQL_URL ?? process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL;
  if (envUrl) return envUrl;

  const config = getNhostConfig();
  if ("graphqlUrl" in config) {
    return config.graphqlUrl as string;
  }

  const { subdomain, region } = config as { subdomain: string; region: string };
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

/** Session data parsed from cookie — we only need the token fields */
interface SessionData {
  accessToken: string;
  refreshToken?: string;
  [key: string]: unknown;
}

/** Type guard for parsed session data */
function isSessionData(data: unknown): data is SessionData {
  return (
    typeof data === "object" &&
    data !== null &&
    "accessToken" in data &&
    typeof (data as Record<string, unknown>).accessToken === "string"
  );
}

/** Attempt to refresh the session using the refresh token */
async function refreshSessionToken(
  sessionData: SessionData,
): Promise<SessionData | null> {
  const refreshToken = sessionData.refreshToken;
  if (!refreshToken) return null;

  const nhost = createStatelessNhostClient(sessionData);

  try {
    const result = await nhost.auth.refreshToken({ refreshToken });

    if (result.status !== 200 || !result.body?.accessToken) {
      return null;
    }

    return result.body as unknown as SessionData;
  } catch (error) {
    if (isDev) console.log("[GraphQL Proxy] Token refresh failed:", error);
    return null;
  }
}

/** Forward a GraphQL request to Hasura */
async function forwardToHasura(
  graphqlUrl: string,
  accessToken: string,
  body: string,
): Promise<Response> {
  return fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });
}

/** Check if Hasura response indicates an auth error */
function isHasuraAuthError(
  status: number,
  data: {
    errors?: Array<{ extensions?: { code?: string } }>;
  },
): boolean {
  return (
    status === 401 ||
    (data.errors?.some(
      (e) =>
        e.extensions?.code === "invalid-jwt" ||
        e.extensions?.code === "access-denied",
    ) ??
      false)
  );
}

/** Update the nhostSession cookie with a refreshed session */
async function updateSessionCookie(newSession: SessionData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    JSON.stringify(newSession),
    SESSION_COOKIE_CONFIG,
  );
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const nhostSessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!nhostSessionCookie) {
      if (isDev) console.log("[GraphQL Proxy] No nhostSession cookie found");
      return NextResponse.json(
        { errors: [{ message: "Authentication required" }] },
        { status: 401 },
      );
    }

    let sessionData: SessionData;
    try {
      const parsed: unknown = JSON.parse(nhostSessionCookie);
      if (!isSessionData(parsed)) {
        if (isDev)
          console.log("[GraphQL Proxy] No access token in session data");
        return NextResponse.json(
          { errors: [{ message: "No access token found" }] },
          { status: 401 },
        );
      }
      sessionData = parsed;
    } catch {
      if (isDev)
        console.log("[GraphQL Proxy] Failed to parse nhostSession cookie");
      return NextResponse.json(
        { errors: [{ message: "Invalid session data" }] },
        { status: 401 },
      );
    }

    let accessToken = sessionData.accessToken;

    const requestBody = JSON.stringify(await request.json());
    const graphqlUrl = getGraphQLUrl();

    // Proactively refresh if token is expiring within 5 minutes
    if (isTokenExpiringSoon(accessToken)) {
      if (isDev)
        console.log(
          "[GraphQL Proxy] Token expiring soon, refreshing proactively",
        );
      const refreshed = await refreshSessionToken(sessionData);
      if (refreshed && typeof refreshed.accessToken === "string") {
        sessionData = refreshed;
        accessToken = refreshed.accessToken;
        await updateSessionCookie(refreshed);
        if (isDev) console.log("[GraphQL Proxy] Token refreshed proactively");
      }
    }

    if (isDev) console.log(`[GraphQL Proxy] Forwarding to ${graphqlUrl}`);

    const hasuraResponse = await forwardToHasura(
      graphqlUrl,
      accessToken,
      requestBody,
    );
    const data = await hasuraResponse.json();

    // If Hasura rejected the token, try refreshing and retrying once
    if (isHasuraAuthError(hasuraResponse.status, data)) {
      if (isDev)
        console.log(
          "[GraphQL Proxy] Hasura rejected token, attempting refresh",
        );

      const refreshed = await refreshSessionToken(sessionData);
      if (refreshed && typeof refreshed.accessToken === "string") {
        await updateSessionCookie(refreshed);

        const retryResponse = await forwardToHasura(
          graphqlUrl,
          refreshed.accessToken,
          requestBody,
        );
        const retryData = await retryResponse.json();

        if (!isHasuraAuthError(retryResponse.status, retryData)) {
          if (isDev)
            console.log("[GraphQL Proxy] Retry after refresh succeeded");
          return NextResponse.json(retryData);
        }
      }

      return NextResponse.json(
        { errors: [{ message: "Invalid or expired token" }] },
        { status: 401 },
      );
    }

    if (isDev) console.log("[GraphQL Proxy] Request forwarded successfully");
    return NextResponse.json(data);
  } catch (error) {
    if (isDev) console.error("[GraphQL Proxy] Error:", error);
    return NextResponse.json(
      { errors: [{ message: "Internal server error" }] },
      { status: 500 },
    );
  }
}
