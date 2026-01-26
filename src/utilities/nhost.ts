import { createServerClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";
import { type NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAMES,
  getAccessTokenCookieConfig,
  getRefreshTokenCookieConfig,
} from "@/utilities/cookies";
import { isTokenExpired } from "@/utilities/jwt";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

/**
 * Manage authentication session in middleware
 * Validates access token and attempts refresh if expired
 */
export async function manageAuthSession(
  request: NextRequest,
  redirectCallback: () => NextResponse,
): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  try {
    // Check for Nhost authentication cookies
    const accessToken = request.cookies.get(COOKIE_NAMES.ACCESS_TOKEN);
    const refreshToken = request.cookies.get(COOKIE_NAMES.REFRESH_TOKEN);

    // In middleware, cookies.get() returns { name, value } or undefined
    const hasAccessToken = accessToken?.value && accessToken.value.length > 0;
    const hasRefreshToken =
      refreshToken?.value && refreshToken.value.length > 0;

    if (isDev) {
      console.log(`🔐 [AuthSession] ${path} - Token state:`, {
        hasAccessToken,
        hasRefreshToken,
      });
    }

    if (!hasAccessToken && !hasRefreshToken) {
      if (isDev)
        console.log(`❌ [AuthSession] ${path} - No tokens found, redirecting`);
      return redirectCallback();
    }

    // If we have an access token, check if it's expired
    if (hasAccessToken && !isTokenExpired(accessToken.value)) {
      // Valid access token, continue
      if (isDev)
        console.log(
          `✅ [AuthSession] ${path} - Valid access token, continuing`,
        );
      return NextResponse.next();
    }

    const tokenExpired = hasAccessToken
      ? isTokenExpired(accessToken.value)
      : true;
    if (isDev) {
      console.log(
        `🔄 [AuthSession] ${path} - Token expired: ${tokenExpired}, attempting refresh`,
      );
    }

    // Access token is expired or missing, try to refresh if we have refresh token
    if (!hasRefreshToken) {
      if (isDev) {
        console.log(
          `❌ [AuthSession] ${path} - No refresh token available, redirecting`,
        );
      }
      return redirectCallback();
    }

    try {
      // Create Nhost client for token refresh
      const region =
        process.env.NHOST_REGION || process.env.NEXT_PUBLIC_NHOST_REGION;
      const subdomain =
        process.env.NHOST_SUBDOMAIN || process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;

      if (!subdomain) {
        if (isDev) {
          console.log(
            `❌ [AuthSession] ${path} - No subdomain configured, redirecting`,
          );
        }
        return redirectCallback();
      }

      if (isDev) {
        console.log(
          `🔄 [AuthSession] ${path} - Creating Nhost client for refresh...`,
        );
      }

      const nhost = createServerClient({
        region,
        subdomain,
        storage: {
          get: () => null,
          set: (_value: Session) => {},
          remove: () => {},
        },
      });

      // Attempt to refresh the token

      if (isDev) {
        console.log(
          `🔄 [AuthSession] ${path} - Calling nhost.auth.refreshToken...`,
        );
      }
      const result = await nhost.auth.refreshToken({
        refreshToken: refreshToken.value,
      });
      const session = result.body;
      const error =
        result.status !== 200 ? new Error(`HTTP ${result.status}`) : null;

      if (error) {
        if (isDev)
          console.log(
            `❌ [AuthSession] ${path} - Refresh error:`,
            error.message,
          );
        return redirectCallback();
      }

      if (!session || !session.accessToken || !session.refreshToken) {
        if (isDev) {
          console.log(
            `❌ [AuthSession] ${path} - Invalid session returned from refresh`,
          );
        }
        return redirectCallback();
      }

      if (isDev)
        console.log(`✅ [AuthSession] ${path} - Token refresh successful!`);

      // Create response and update cookies with new tokens
      const response = NextResponse.next();

      // Set new access token cookie (short-lived)
      response.cookies.set(
        COOKIE_NAMES.ACCESS_TOKEN,
        session.accessToken,
        getAccessTokenCookieConfig(),
      );

      // Set new refresh token cookie (long-lived)
      response.cookies.set(
        COOKIE_NAMES.REFRESH_TOKEN,
        session.refreshToken,
        getRefreshTokenCookieConfig(),
      );

      if (isDev)
        console.log(
          `🍪 [AuthSession] ${path} - Cookies updated with new tokens`,
        );

      // Note: User data is now retrieved from JWT claims server-side only

      return response;
    } catch (refreshError) {
      if (isDev) {
        console.log(
          `❌ [AuthSession] ${path} - Exception during refresh:`,
          refreshError,
        );
      }
      // Note: we don't have tokenPrefix here, but that's ok for exceptions
      return redirectCallback();
    }
  } catch (outerError) {
    if (isDev) {
      console.log(
        `❌ [AuthSession] ${path} - Exception in manageAuthSession:`,
        outerError,
      );
    }
    return redirectCallback();
  }
}
