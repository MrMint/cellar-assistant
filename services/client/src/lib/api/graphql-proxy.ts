/**
 * `/api/graphql` on this app → `services/api`'s `/graphql`.
 *
 * Two jobs. It keeps the API off the public internet as far as the browser is
 * concerned, and it is where the session cookie becomes a bearer token: the
 * browser never holds a JWT, and the API never sees a cookie.
 *
 * Unlike the Nhost proxy it replaces, a request with no session is **not**
 * rejected. `services/api` treats an absent `Authorization` header as an anonymous
 * viewer and lets the actors decide what that viewer may see (plan §1.6), so
 * refusing here would override an authorization decision that is not this
 * layer's to make.
 *
 * A session cookie the actors app **refuses** is different, and is a 401. The
 * viewer was signed in and no longer is — revoked, expired, signed out on
 * another device. Forwarding that anonymously (as this did until 2026-09-28)
 * made the API answer a signed-out viewer's `FORBIDDEN`, so the page showed
 * "sign in to see cellars" in place of the client's sign-in redirect, which
 * keys on a 401 (`urql-client.ts`). A request with no session cookie at all is
 * still anonymous, and so is one carrying only non-session better-auth cookies
 * (an OAuth `state` in flight). Server components are unaffected: they call
 * `fetchApiToken` themselves and gate on `getServerUser`.
 *
 * The token itself comes from a per-session cache (`token-cache.ts`), not a
 * fresh exchange per request — which is what this did until 2026-10-05, and
 * what ran one session into the actor's 300-a-minute exchange limit.
 */
import { authOrigin, graphqlApiUrl } from "./config.ts";
import type { FetchLike } from "./proxy.ts";
import { downstreamHeaders, forwardRequest } from "./proxy.ts";
import {
  authCookieHeader,
  hasSessionCookie,
  parseCookieHeader,
} from "./session-cookie.ts";
import { bearerHeader, fetchApiToken, TokenExchangeError } from "./token.ts";
import {
  sessionCacheKey,
  sharedTokenCache,
  type TokenCache,
} from "./token-cache.ts";

const graphqlError = (
  message: string,
  status: number,
  code?: string,
): Response =>
  Response.json(
    {
      errors: [
        code === undefined ? { message } : { message, extensions: { code } },
      ],
    },
    { status },
  );

/**
 * The session cookies the token exchange re-issued, passed on to the browser.
 *
 * This route is the only place an active browser's session is read — it never
 * calls `/get-session` itself — so it is where better-auth's daily refresh has
 * to reach the browser, or the cookie expires seven days after sign-in while
 * the session row it names is still alive (`token.ts`, "The refreshed
 * cookie"). Only session cookies ever arrive here (`isSessionSetCookie`, in
 * `fetchApiToken`); each is appended as its own header with its attributes
 * untouched, never folded into one, and a response that sets one is
 * `no-store` — it is somebody's session.
 */
const withSessionCookies = (
  response: Response,
  setCookies: readonly string[],
): Response => {
  if (setCookies.length === 0) return response;
  const headers = downstreamHeaders(response.headers);
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/**
 * The exchange failed for a reason that is not "no session". A 429 from the
 * actor's per-session limit is passed on **as** a 429, with its
 * `Retry-After`, so the client can back off (`urql-client.ts`) — it used to
 * read as the same 502 "Auth service unavailable" as an outage, which sent
 * nobody anywhere and told the e2e suite nothing. Anything else is still a
 * 502: the actors app is unreachable or erroring, which is not the viewer's
 * fault and must not read as "signed out", or the client's auth exchange
 * would bounce them to /sign-in on an infrastructure blip.
 *
 * Neither is ever forwarded to the API, so a mutation refused here has not
 * run, and retrying it is safe.
 */
const exchangeFailure = (error: unknown): Response => {
  const status = error instanceof TokenExchangeError ? error.status : undefined;
  console.warn(
    `[graphql-proxy] token exchange failed (${status ?? (error instanceof Error ? error.name : "unknown")})`,
  );
  if (error instanceof TokenExchangeError && error.rateLimited) {
    const retryAfter = error.retryAfterSeconds ?? 1;
    const response = graphqlError(
      `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
      429,
      "RATE_LIMITED",
    );
    response.headers.set("retry-after", String(retryAfter));
    return response;
  }
  return graphqlError("Auth service unavailable", 502, "AUTH_UNAVAILABLE");
};

export const proxyGraphqlRequest = async (
  request: Request,
  fetchImpl?: FetchLike,
  tokens: TokenCache = sharedTokenCache,
): Promise<Response> => {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieHeader = authCookieHeader(cookies);
  const cacheKey = sessionCacheKey(cookieHeader);

  // Session cookies the exchange re-issued, for the browser — see
  // `withSessionCookies`.
  const reissued: string[] = [];
  const exchange = () =>
    fetchApiToken({
      authOrigin: authOrigin(),
      cookieHeader,
      fetchImpl,
      onSetCookie: (cookies) => {
        reissued.push(...cookies);
      },
    });

  let token: string | null;
  let fromCache: boolean;
  try {
    ({ token, fromCache } = await tokens.get(cacheKey, exchange));
  } catch (error) {
    return exchangeFailure(error);
  }

  if (token === null && hasSessionCookie(cookies)) {
    // Same shape as the API's own 401 for a bad token (`context.ts`), so the
    // client handles both the same way.
    return withSessionCookies(
      graphqlError(
        "Your session has ended. Sign in again.",
        401,
        "UNAUTHENTICATED",
      ),
      reissued,
    );
  }

  // Read once, so the request can be sent twice — see below. GraphQL bodies
  // are small JSON; uploads go to presigned URLs, never through here.
  const body = await request.arrayBuffer();
  const forward = (bearer: string | null) =>
    forwardRequest({
      request,
      targetUrl: graphqlApiUrl(),
      // The API holds no session state and has no use for cookies; not
      // forwarding them keeps the credential surface to the bearer token alone.
      cookieHeader: null,
      extraHeaders: bearerHeader(bearer),
      body,
      fetchImpl,
    });

  const forwarded = await forward(token);

  // A cached token the API refuses (a signing-key rotation inside the cache
  // window, say) is this cache's fault, not a dead session: a 401 here would
  // sign the viewer out. Drop it and ask the actor once more; whatever that
  // answers is the truth, and is what the viewer gets.
  if (forwarded.status === 401 && fromCache && cacheKey !== null) {
    tokens.evict(cacheKey);
    await forwarded.body?.cancel();
    let fresh: string | null;
    try {
      ({ token: fresh } = await tokens.get(cacheKey, exchange));
    } catch (error) {
      return exchangeFailure(error);
    }
    if (fresh === null) {
      return withSessionCookies(
        graphqlError(
          "Your session has ended. Sign in again.",
          401,
          "UNAUTHENTICATED",
        ),
        reissued,
      );
    }
    return withSessionCookies(await forward(fresh), reissued);
  }

  return withSessionCookies(forwarded, reissued);
};
