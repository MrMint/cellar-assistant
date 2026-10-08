/**
 * Mounts better-auth on the actor host's own HTTP server.
 *
 * `DaprServer` accepts an existing Express app via `serverHttp`, and its
 * constructor registers `body-parser` on whatever app it is handed. That
 * ordering matters: better-auth's node handler reads the raw request stream, so
 * a JSON body-parser in front of it would drain the body and every POST would
 * arrive empty. Mounting here — on a fresh app, *before* it is passed to
 * `DaprServer` — puts the auth routes ahead of Dapr's parsers in Express's
 * middleware chain, and the handler ends the response without calling `next()`,
 * so those parsers never see an auth request.
 */

import { toNodeHandler } from "better-auth/node";
import type express from "express";
import { createHostApp } from "../lib/host-app.ts";
import type { AuthInstance } from "./auth.ts";
import { resolveClientIp } from "./client-ip.ts";
import { type ProxyTrust, readProxyTrust } from "./config.ts";
import { sessionExchangeLimiter } from "./session-exchange-limit.ts";

/** better-auth's default `basePath`. Endpoints land at `<basePath>/*`. */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * The one endpoint under `/api/auth/*` that is **not** per-session.
 *
 * `/jwks` is a public key set — `services/api` fetches it to verify every JWT
 * — and caching it is the point. It must not be swept up by the `no-store`
 * below.
 */
const PUBLIC_AUTH_PATHS = new Set([`${AUTH_BASE_PATH}/jwks`]);

/**
 * `Cache-Control: no-store` on everything under `/api/auth/*` except `/jwks`
 * (E5d).
 *
 * `GET /api/auth/token` answers a session cookie with a bearer JWT, and it was
 * served with **no `Cache-Control` and no `Expires` at all** — measured
 * against the compose stack. A 200 with neither is exactly the case RFC 9111
 * §4.2.2 lets a shared cache store on a heuristic freshness lifetime of its
 * own choosing, and the response body is a credential. `/sign-in/email` and
 * `/get-session` carry session material for the same reason.
 *
 * That better-auth *already* sets `no-store` and `Pragma: no-cache` on
 * `/get-session` is the argument this is an omission in its jwt plugin rather
 * than a policy: the sibling endpoint that returns the same session, in the
 * same mount, does it. These are the same two header values, so an endpoint
 * that sets its own is unaffected — `setHeader` here, `setHeader` there, same
 * string.
 *
 * `Pragma` is obsolete for responses and is sent anyway, as better-auth sends
 * it: an HTTP/1.0 intermediary that ignores `Cache-Control` is precisely the
 * kind of thing that would cache this.
 *
 * Set before the handler runs rather than after: `toNodeHandler` ends the
 * response itself, so there is no "after".
 */
const noStoreForAuth: express.RequestHandler = (req, res, next) => {
  if (!PUBLIC_AUTH_PATHS.has(req.path)) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
};

/**
 * The actor host's app, with better-auth as its first route. `createHostApp`
 * sets case-sensitive, strict routing and the canonical-path gate before this
 * registers anything — Express fixes both settings when the first route is
 * added, and every route on this app, the SDK's included, inherits them
 * (`../lib/host-app.ts`).
 */
export const createAppWithAuth = (
  auth: AuthInstance,
  trust: ProxyTrust = readProxyTrust(),
): express.Express => {
  const app = createHostApp();
  // Express 5 (path-to-regexp 8) wildcard: it must be named, and it matches
  // one or more segments — not `/api/auth` itself. Covers
  // /api/auth/sign-in/email, /api/auth/jwks, /api/auth/token,
  // /api/auth/callback/<provider>, …
  //
  // `resolveClientIp` first: it decides which address better-auth's limiter
  // counts and whether this is the Next server's own exchange, and it strips
  // every header a caller could have forged for either (`./client-ip.ts`).
  app.all(
    `${AUTH_BASE_PATH}/*splat`,
    resolveClientIp({ proxySecret: trust.proxySecret }),
    sessionExchangeLimiter(trust.sessionExchangeLimit, AUTH_BASE_PATH),
    noStoreForAuth,
    toNodeHandler(auth),
  );
  return app;
};
