import { type NextRequest, NextResponse } from "next/server";
import { handleNhostMiddleware } from "./lib/nhost/server";

/**
 * Exchange a refresh token for a full session via Nhost Auth API
 */
async function exchangeRefreshToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  accessTokenExpiresIn: number;
  user: Record<string, unknown>;
} | null> {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local";
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;

  const authUrl = region
    ? `https://${subdomain}.auth.${region}.nhost.run/v1/token`
    : `https://local.auth.local.nhost.run/v1/token`;

  try {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.error("[Middleware] Token exchange failed:", response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Middleware] Token exchange error:", error);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip middleware for public routes and static files
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

      // Redirect to clean URL with session cookie set
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set("nhostSession", JSON.stringify(session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });

      return response;
    }

    // Token exchange failed - redirect to sign-in
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Use Nhost's handleNhostMiddleware for authentication
  return handleNhostMiddleware(request, () => {
    return NextResponse.redirect(new URL("/sign-in", request.url));
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
  runtime: "nodejs",
};
