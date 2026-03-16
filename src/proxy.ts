import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_CONFIG,
  SESSION_COOKIE_NAME,
  createStatelessNhostClient,
  handleNhostMiddleware,
} from "./lib/nhost/server";

/** Session type returned from Nhost token exchange */
interface NhostSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  accessTokenExpiresIn: number;
  user: {
    id: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    [key: string]: unknown;
  };
}

/**
 * Validate that a session object has all required fields
 */
function isValidSession(session: unknown): session is NhostSession {
  if (!session || typeof session !== "object") return false;
  const s = session as Record<string, unknown>;
  return (
    typeof s.accessToken === "string" &&
    s.accessToken.length > 0 &&
    typeof s.refreshToken === "string" &&
    s.refreshToken.length > 0 &&
    typeof s.user === "object" &&
    s.user !== null &&
    typeof (s.user as Record<string, unknown>).id === "string"
  );
}

/**
 * Exchange a refresh token for a full session using the Nhost SDK
 */
async function exchangeRefreshToken(
  refreshToken: string,
): Promise<NhostSession | null> {
  const nhost = createStatelessNhostClient();

  try {
    const result = await nhost.auth.refreshToken({ refreshToken });

    if (result.status !== 200 || !result.body) {
      console.error("[Proxy] Token exchange failed:", result.status);
      return null;
    }

    if (!isValidSession(result.body)) {
      console.error("[Proxy] Invalid session structure received");
      return null;
    }

    return result.body;
  } catch (error) {
    console.error("[Proxy] Token exchange error:", error);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip proxy for public routes and static files
  if (
    path.startsWith("/_next") ||
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/verify") ||
    path.includes(".") // Static files
  ) {
    return NextResponse.next();
  }

  // Handle OAuth callback - exchange refreshToken for full session server-side
  const refreshToken = request.nextUrl.searchParams.get("refreshToken");
  if (refreshToken) {
    const session = await exchangeRefreshToken(refreshToken);

    if (session) {
      // Create clean URL without refreshToken param
      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete("refreshToken");

      // Security: Validate redirect stays on same origin to prevent open redirect
      const requestOrigin = request.nextUrl.origin;
      if (cleanUrl.origin !== requestOrigin) {
        console.error(
          "[Proxy] Blocked cross-origin redirect:",
          cleanUrl.origin,
        );
        return NextResponse.redirect(new URL("/cellars", request.url));
      }

      // Redirect to clean URL with session cookie set
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set(
        SESSION_COOKIE_NAME,
        JSON.stringify(session),
        SESSION_COOKIE_CONFIG,
      );

      return response;
    }

    // Token exchange failed - redirect to sign-in
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Use Nhost's handleNhostMiddleware for authentication
  return handleNhostMiddleware(request, () => {
    const signInUrl = new URL("/sign-in", request.url);
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    // Only pass returnTo for non-default routes
    if (returnTo !== "/" && returnTo !== "/cellars") {
      signInUrl.searchParams.set("returnTo", returnTo);
    }
    return NextResponse.redirect(signInUrl);
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sign-in, sign-up, forgot-password, verify (auth pages)
     */
    "/((?!_next/static|_next/image|favicon.ico|sign-in|sign-up|forgot-password|verify).*)",
  ],
};
