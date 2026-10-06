/**
 * The server-component side of the new auth path.
 *
 * Server components cannot use the browser session the way a client component
 * does — there is no `document.cookie` and no better-auth client store. What a
 * server component *does* have is the incoming request, and inside it the
 * browser's better-auth cookies. This module turns those into a JWT.
 *
 * ## The mechanism, end to end
 *
 * 1. The browser's better-auth cookies are first-party on the Next origin,
 *    because every auth call goes through `/api/auth/*` on this app rather
 *    than to `services/actors` directly. better-auth sets them `Path=/; HttpOnly;
 *    SameSite=Lax` with no `Domain`, so the browser attributes them to
 *    whichever origin served the response — the Next app.
 * 2. A server component reads the raw `Cookie` header and keeps only the
 *    better-auth cookies.
 * 3. It calls `GET /api/auth/token` on `services/actors` **server to server**,
 *    presenting those cookies. better-auth loads the `session` row and signs a
 *    15-minute EdDSA JWT (`iss` = `aud` = `BETTER_AUTH_URL`).
 * 4. That JWT goes to `services/api` as `Authorization: Bearer …`, which verifies
 *    it against `/api/auth/jwks` and builds `ctx` (plan §8.2). No session
 *    lookup, no database, no shared secret.
 *
 * ## Two things that would be subtly wrong
 *
 * **Reading cookies through `cookies()` instead of `headers()`.** better-auth's
 * session token is percent-encoded on the wire — a real one looks like
 * `ke5BzP…VQaqOoSP37MYmdJ%2FuRWwCutzaUDNdI8hK3ETaGHQE%2FQ%3D`. Going through a
 * cookie store means decoding it and re-serialising it into a fresh `Cookie`
 * header, and whether that round trip is lossless depends on the token's
 * alphabet and on the store's escaping rules — neither of which is this
 * module's to guarantee. `headers().get("cookie")` is the bytes the browser
 * actually sent, so the question does not arise.
 *
 * **Fetching the token through this app's own `/api/auth/token` proxy.** A
 * server component calling back into its own HTTP server needs an absolute URL
 * it cannot reliably construct, and burns a second hop through the same Node
 * process that is already occupied rendering. The proxy exists for the
 * *browser*; the server has no reason to use it.
 *
 * `cache()` memoises per request, so a page with twenty server components that
 * each query GraphQL performs at most one token exchange — and across
 * requests the token comes from `token-cache.ts`, which `/api/graphql` shares,
 * so most renders perform none.
 */
import { headers } from "next/headers";
import { cache } from "react";
import { authOrigin } from "./config.ts";
import type { AuthSession } from "./endpoints.ts";
import { authCookieHeaderFrom } from "./session-cookie.ts";
import { fetchApiToken, fetchSession } from "./token.ts";
import { sessionCacheKey, sharedTokenCache } from "./token-cache.ts";

/** The incoming request's better-auth cookies, and nothing else. */
export const serverAuthCookieHeader = cache(
  async (): Promise<string | null> =>
    authCookieHeaderFrom((await headers()).get("cookie")),
);

/**
 * A JWT for the current viewer, or `null` when this request is anonymous.
 *
 * One exchange per request, whatever the component tree looks like.
 */
export const getApiToken = cache(async (): Promise<string | null> => {
  const cookieHeader = await serverAuthCookieHeader();
  const { token } = await sharedTokenCache.get(
    sessionCacheKey(cookieHeader),
    () => fetchApiToken({ authOrigin: authOrigin(), cookieHeader }),
  );
  return token;
});

/**
 * The viewer's better-auth session, for gating layouts.
 *
 * A page that is going to query GraphQL anyway does not need this — `me` on
 * the API answers from the token's own claims. It is here for the route gate
 * on `(authenticated)`, which must decide before rendering. A 429 or 5xx
 * throws rather than reading as signed out (`fetchSession`).
 */
export const getServerSession = cache(
  async (): Promise<AuthSession | null> =>
    fetchSession({
      authOrigin: authOrigin(),
      cookieHeader: await serverAuthCookieHeader(),
    }),
);
