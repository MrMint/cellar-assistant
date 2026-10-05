/**
 * `/api/auth/*` on this app → better-auth on `services/actors`.
 *
 * A passthrough, deliberately: same path, same method, same body, same
 * `Set-Cookie`. What it buys is that better-auth's cookies become **first
 * party on the Next origin**, which is what makes `auth-server.ts`'s token
 * exchange possible and keeps `connect-src 'self'` in `next.config.mjs`
 * satisfiable. The browser never learns that `services/actors` exists.
 */
import { authOrigin } from "./config.ts";
import { AUTH_BASE_PATH, authEndpoint } from "./endpoints.ts";
import type { FetchLike } from "./proxy.ts";
import { downstreamHeaders, forwardRequest } from "./proxy.ts";
import { clientIpHeaders } from "./proxy-secret.ts";

/**
 * The one path under here that is public and *should* be cached — the key set
 * `services/api` verifies JWTs against. Everything else is per-session.
 */
const JWKS_PATH = `${AUTH_BASE_PATH}${authEndpoint.jwks}`;

/**
 * `Cache-Control: no-store` on every proxied auth response but `/jwks` (E5d).
 *
 * `services/actors` sets this at the mount now, and `forwardRequest` copies
 * upstream headers verbatim, so in the ordinary case this overwrites the
 * header with the value it already has. It is here anyway because **this** is
 * the origin the browser talks to: in production nothing reaches
 * `services/actors` directly, so this app's own response is what a CDN, a
 * corporate proxy or `next start`'s own caching sees. A credential is not
 * something to serve cacheable on the strength of an upstream remembering to
 * say so — and `GET /api/auth/token` reached this proxy with no
 * `Cache-Control` at all until now (measured on the compose stack).
 *
 * Set on a copy, because the `Headers` of a constructed `Response` are
 * immutable — and the copy goes through `downstreamHeaders` rather than
 * `new Headers(response.headers)`. That is not a style choice: the `Headers`
 * constructor folds repeated fields into one comma-joined value, which
 * corrupts `Set-Cookie`, and a sign-out returns three of them. The same trap
 * `downstreamHeaders` was written for.
 */
const withNoStore = (response: Response, pathname: string): Response => {
  if (pathname === JWKS_PATH) return response;
  const headers = downstreamHeaders(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const proxyAuthRequest = async (
  request: Request,
  fetchImpl?: FetchLike,
): Promise<Response> => {
  const url = new URL(request.url);

  // `URL` has already resolved `.` and `..`, so this prefix check is enough to
  // keep the route from being used to reach anything else on the actor host.
  if (!url.pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  return withNoStore(
    await forwardRequest({
      request,
      targetUrl: `${authOrigin()}${url.pathname}${url.search}`,
      // The proxy secret and the browser's address, so the actor host's rate
      // limiter counts this browser and not Vercel's egress (`proxy-secret.ts`).
      extraHeaders: clientIpHeaders(request.headers),
      fetchImpl,
    }),
    url.pathname,
  );
};
