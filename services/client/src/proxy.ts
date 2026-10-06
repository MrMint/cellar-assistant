import { type NextRequest, NextResponse } from "next/server";
import { authOrigin } from "./lib/api/config";
import { checkSession, SESSION_CHECKED_COOKIE } from "./lib/api/session-check";
import {
  authCookieHeader,
  hasSessionCookie,
  parseCookieHeader,
} from "./lib/api/session-cookie";

/**
 * The signed-in gate, in front of every page.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; this is that file. D9 replaced
 * its Nhost body — a cookie parse, a JWT expiry check and a refresh-token
 * exchange against `hasura-auth` — with a presence check on better-auth's
 * session cookie. The session itself is resolved by the actors app.
 *
 * **One exception: the daily session check.** better-auth re-issues its
 * session cookie with a fresh 7-day `Max-Age` on the first session read after
 * a day, and a server component cannot set a cookie — so a viewer whose pages
 * only ever render server-side never received the re-issue, and was signed
 * out seven days after signing in. Once a day per browser (a
 * `cellar.session_checked` marker cookie), a request that carries a session
 * cookie reads `/get-session` here and relays the re-issued session cookies
 * onto the response. It fails open and never redirects; see
 * `lib/api/session-check.ts`. This runs on Node (Next 16's only proxy
 * runtime), so `AUTH_PROXY_SECRET` is read from `process.env` at request time
 * and is never in a bundle.
 *
 * **This is a cheap negative check, not authentication.** A cookie can be
 * present and the session behind it revoked, and only the actors app can say.
 * Every page behind here still authenticates: the `(authenticated)` layout
 * calls `getServerUser()`, which resolves the session and redirects when it
 * comes back null, and `services/api` refuses a request whose JWT does not verify.
 * The gate exists to turn a signed-out page load into one redirect instead of a
 * render that fetches, fails and redirects.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Public routes and static files.
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

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  if (hasSessionCookie(cookies)) {
    const response = NextResponse.next();
    if (cookies.some((cookie) => cookie.name === SESSION_CHECKED_COOKIE)) {
      return response;
    }
    // Appended as raw headers, one per cookie, never through
    // `response.cookies`: that API re-serialises its own map over the whole
    // `set-cookie` header and would drop better-auth's values, whose
    // attributes have to pass through verbatim.
    for (const setCookie of await checkSession({
      authOrigin: authOrigin(),
      cookieHeader: authCookieHeader(cookies) ?? "",
      secure: request.nextUrl.protocol === "https:",
    })) {
      response.headers.append("set-cookie", setCookie);
    }
    // It may carry somebody's session cookie: no shared cache keeps it.
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const signInUrl = new URL("/sign-in", request.url);
  const returnTo = request.nextUrl.pathname + request.nextUrl.search;
  // Only pass returnTo for non-default routes.
  if (returnTo !== "/" && returnTo !== "/cellars") {
    signInUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sign-in, sign-up, forgot-password, verify (auth pages)
     * - api/auth, api/graphql (the proxies to Loki)
     *
     * The two `api/` exclusions are load-bearing and guarded by
     * `src/lib/api/proxy-matcher.test.ts`. `/api/auth/*` is how a viewer
     * *becomes* signed in — gating it on being signed in already is a deadlock —
     * and `/api/graphql` must answer 401 to its caller rather than 302 to an
     * HTML page, which is not something a GraphQL client can parse.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/graphql|sign-in|sign-up|forgot-password|verify).*)",
  ],
};
