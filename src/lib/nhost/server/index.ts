import { createServerClient, type NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/session";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// Helper to get Nhost service URLs for local development
// The SDK's fallback URL pattern is broken for local dev (uses local.*.local.nhost.run)
function getNhostConfig() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;

  if (!region) {
    // Local development - provide explicit URLs
    return {
      authUrl: `https://${subdomain}.auth.nhost.run/v1`,
      storageUrl: `https://${subdomain}.storage.nhost.run/v1`,
      graphqlUrl: `https://${subdomain}.graphql.nhost.run/v1`,
      functionsUrl: `https://${subdomain}.functions.nhost.run/v1`,
    };
  }

  // Production - use subdomain/region
  return { subdomain, region };
}

// Create Nhost client for server components
export async function createNhostClient(): Promise<NhostClient> {
  const cookieStore = await cookies();

  return createServerClient({
    ...getNhostConfig(),
    storage: {
      // Server component storage - matches official pattern
      get: () => {
        try {
          const sessionData = cookieStore.get("nhostSession")?.value || null;
          if (!sessionData) {
            return null;
          }
          return JSON.parse(sessionData);
        } catch (_error) {
          // Return null for server actions that can't read cookies
          return null;
        }
      },
      set: (session: Session) => {
        try {
          cookieStore.set("nhostSession", JSON.stringify(session), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: "/",
          });
        } catch (_error) {
          // Silently fail for server actions that can't set cookies
          console.warn("Failed to set session cookie in server action");
        }
      },
      remove: () => {
        try {
          cookieStore.delete("nhostSession");
        } catch (_error) {
          // Silently fail for server actions that can't remove cookies
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
  const sessionCookie = request.cookies.get("nhostSession")?.value;

  if (!sessionCookie) {
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }

  // biome-ignore lint/suspicious/noImplicitAnyLet: Session data from cookies is dynamically typed
  let sessionData;
  try {
    sessionData = JSON.parse(sessionCookie);
  } catch {
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }

  if (!sessionData?.accessToken) {
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }

  // Check JWT expiry
  const exp = getJWTExpiry(sessionData.accessToken);
  const now = Math.floor(Date.now() / 1000);

  if (!exp) {
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }

  const timeUntilExpiry = exp - now;

  // Token is valid and not expiring soon - just pass through
  if (timeUntilExpiry > 60) {
    return NextResponse.next();
  }

  // Token is expired or expiring within 60 seconds - try to refresh
  if (!sessionData?.refreshToken) {
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }

  const nhost = createServerClient({
    ...getNhostConfig(),
    storage: {
      get: () => sessionData,
      set: () => {},
      remove: () => {},
    },
  });

  try {
    const refreshedSession = await nhost.refreshSession();

    if (!refreshedSession) {
      const response = redirectCallback();
      response.cookies.delete("nhostSession");
      return response;
    }

    // Update cookie with refreshed session
    const response = NextResponse.next();
    response.cookies.set("nhostSession", JSON.stringify(refreshedSession), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch {
    // Refresh failed - token is either expired or refresh token is invalid
    if (timeUntilExpiry > 0) {
      // Access token still valid, allow through despite refresh failure
      return NextResponse.next();
    }
    const response = redirectCallback();
    response.cookies.delete("nhostSession");
    return response;
  }
}
