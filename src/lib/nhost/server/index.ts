import { createServerClient, type NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/session";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// =============================================================================
// Shared constants and helpers (used across proxy.ts, route.ts, actions.ts)
// =============================================================================

/** Cookie name for the Nhost session */
export const SESSION_COOKIE_NAME = "nhostSession";

/** Shared cookie configuration — single source of truth for all session cookies */
export const SESSION_COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: "/",
};

/**
 * Get Nhost service URLs.
 * The SDK's fallback URL pattern is broken for local dev (uses local.*.local.nhost.run),
 * so we provide explicit URLs when no region is set.
 */
export function getNhostConfig() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN ?? "local";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;

  if (!region) {
    return {
      authUrl: `https://${subdomain}.auth.nhost.run/v1`,
      storageUrl: `https://${subdomain}.storage.nhost.run/v1`,
      graphqlUrl: `https://${subdomain}.graphql.nhost.run/v1`,
      functionsUrl: `https://${subdomain}.functions.nhost.run/v1`,
    };
  }

  return { subdomain, region };
}

/**
 * Create a stateless Nhost client for one-shot API calls (token exchange, refresh).
 * Does not read/write cookies — callers manage cookie persistence themselves.
 * Use `createNhostClient()` instead when you need SDK-managed session storage.
 */
export function createStatelessNhostClient(
  sessionData?: unknown,
): NhostClient {
  return createServerClient({
    ...getNhostConfig(),
    storage: {
      get: () => (sessionData ?? null) as Session | null,
      set: () => {},
      remove: () => {},
    },
  });
}

// =============================================================================
// Server Component / Server Action client (full cookie-backed storage)
// =============================================================================

/** Create Nhost client for server components and server actions */
export async function createNhostClient(): Promise<NhostClient> {
  const cookieStore = await cookies();

  return createServerClient({
    ...getNhostConfig(),
    storage: {
      get: () => {
        try {
          const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
          if (!raw) return null;
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      set: (session: Session) => {
        try {
          cookieStore.set(
            SESSION_COOKIE_NAME,
            JSON.stringify(session),
            SESSION_COOKIE_CONFIG,
          );
        } catch {
          console.warn("Failed to set session cookie in server action");
        }
      },
      remove: () => {
        try {
          cookieStore.delete(SESSION_COOKIE_NAME);
        } catch {
          console.warn("Failed to remove session cookie in server action");
        }
      },
    },
  });
}

// Parse JWT to get expiry time
function getJWTExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp || null;
  } catch {
    return null;
  }
}

// Handle authentication middleware
export async function handleNhostMiddleware(
  request: NextRequest,
  redirectCallback: () => NextResponse,
): Promise<NextResponse> {
  // Check if we have a session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // biome-ignore lint/suspicious/noImplicitAnyLet: Session data from cookies is dynamically typed
  let sessionData;
  try {
    sessionData = JSON.parse(sessionCookie);
  } catch {
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  if (!sessionData?.accessToken) {
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Check JWT expiry
  const exp = getJWTExpiry(sessionData.accessToken);
  const now = Math.floor(Date.now() / 1000);

  if (!exp) {
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const timeUntilExpiry = exp - now;

  // Token is valid and not expiring soon - just pass through
  // Use 300s buffer to refresh well before expiry, reducing race conditions
  // across concurrent serverless function instances
  if (timeUntilExpiry > 300) {
    return NextResponse.next();
  }

  // Token is expired or expiring within 60 seconds - try to refresh
  if (!sessionData?.refreshToken) {
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const nhost = createStatelessNhostClient(sessionData);

  try {
    const refreshedSession = await nhost.refreshSession();

    if (!refreshedSession) {
      const response = redirectCallback();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }

    // Redirect to the same URL so the browser makes a fresh request with
    // the new cookie. Without this, server components rendering in the
    // current request still see the OLD request cookies (stale token),
    // causing a thundering herd of failed refresh attempts.
    const response = NextResponse.redirect(request.url);
    response.cookies.set(
      SESSION_COOKIE_NAME,
      JSON.stringify(refreshedSession),
      SESSION_COOKIE_CONFIG,
    );
    return response;
  } catch {
    // Refresh failed - token is either expired or refresh token is invalid
    if (timeUntilExpiry > 0) {
      // Access token still valid, allow through despite refresh failure
      return NextResponse.next();
    }
    const response = redirectCallback();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}
