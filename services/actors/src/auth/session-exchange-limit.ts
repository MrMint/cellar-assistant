/**
 * The per-**session** limit on the Next server's own session exchanges.
 *
 * `GET /api/auth/token` and `GET /api/auth/get-session` are called by
 * `services/client`'s *server*, not by a browser: once per `/api/graphql`
 * request (`graphql-proxy.ts`) and once per SSR render (`auth-server.ts`). The
 * client's address is not the right key for them. It is not even known on the
 * `/token` path, and where it is, a campus or a carrier-grade NAT puts
 * hundreds of active users behind one address, whose ordinary page loads would
 * then throttle one another. What an exchange spends is a session, so a
 * session is what it is counted against.
 *
 * So a verified exchange (`./client-ip.ts` — the proxy secret checked out) is
 * **exempt from better-auth's per-IP rule** (`customRules` in `./auth.ts`) and
 * counted here instead, per session token. Everything unverified on those two
 * paths — a browser, or someone at the public edge — keeps better-auth's
 * per-IP limit.
 *
 * A request with no session cookie has nothing to count and is passed
 * through: better-auth answers it `401`/`null` after one HMAC check on a
 * cookie it cannot find, and the Next server never sends one without a
 * cookie (`token.ts`). A *forged* cookie gets its own bucket, and costs the
 * same single HMAC before better-auth discards it without a database read.
 *
 * ## Memory, per replica
 *
 * The counter is an in-process `Map`, as better-auth's own limiter is here
 * (`rateLimit.storage: "memory"` in `./auth.ts`), for the same reason: the
 * actor host runs as **one** replica (`infra/docker-compose.prod.yml` has no
 * `replicas`/`scale`), where single-threaded JS makes the check-and-increment
 * atomic for free. Database storage would put a write in front of every token
 * mint. With N replicas behind the edge each limit becomes N× as loose — a bound
 * that degrades, not one that disappears — and moving both to
 * `storage: "database"` (a `rateLimit` table) is the change to make then.
 */
import { createHash } from "node:crypto";
import type express from "express";
import { VERIFIED_PROXY_HEADER } from "./client-ip.ts";

/** The two exchange paths, relative to better-auth's `basePath`. */
export const SESSION_EXCHANGE_PATHS = ["/token", "/get-session"] as const;

export type SessionExchangeLimit = {
  readonly max: number;
  readonly windowSeconds: number;
};

/**
 * 300 per minute per session: an SPA page that fans out a dozen GraphQL
 * requests, reloaded every few seconds, stays an order of magnitude inside it;
 * a script replaying one cookie in a loop does not.
 */
export const DEFAULT_SESSION_EXCHANGE_LIMIT: SessionExchangeLimit = {
  max: 300,
  windowSeconds: 60,
};

/**
 * `AUTH_SESSION_EXCHANGE_LIMIT`, as `<max>/<windowSeconds>` (`300/60`). Throws
 * on anything else — the house rule for a limit an operator set on purpose.
 */
export const parseSessionExchangeLimit = (
  raw: string | undefined,
): SessionExchangeLimit => {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SESSION_EXCHANGE_LIMIT;
  }
  const match = /^(\d+)\/(\d+)$/.exec(raw.trim());
  const max = Number(match?.[1]);
  const windowSeconds = Number(match?.[2]);
  if (match === null || !(max > 0) || !(windowSeconds > 0)) {
    throw new Error(
      `[auth] AUTH_SESSION_EXCHANGE_LIMIT must be <max>/<windowSeconds> with both above zero, e.g. "300/60"; got ${JSON.stringify(raw)}`,
    );
  }
  return { max, windowSeconds };
};

const SESSION_COOKIE =
  /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/;

/** A digest of the session cookie's value, or `undefined` when there is none. */
export const sessionKey = (cookie: string | undefined): string | undefined => {
  const token =
    cookie === undefined ? undefined : SESSION_COOKIE.exec(cookie)?.[1];
  return token === undefined
    ? undefined
    : createHash("sha256").update(token, "utf8").digest("hex");
};

/** Bound on remembered sessions, so a flood of forged cookies cannot grow it without limit. */
const MAX_TRACKED = 100_000;

export const sessionExchangeLimiter = (
  limit: SessionExchangeLimit,
  basePath: string,
  now: () => number = Date.now,
): express.RequestHandler => {
  const windows = new Map<
    string,
    { start: number; count: number; reported: boolean }
  >();
  const paths = new Set(SESSION_EXCHANGE_PATHS.map((p) => `${basePath}${p}`));
  const windowMs = limit.windowSeconds * 1000;

  return (req, res, next) => {
    if (!paths.has(req.path)) return next();
    // Set by `resolveClientIp`, which runs first and deletes any copy a
    // caller sent — so this is the secret check's verdict, not a claim.
    if (req.headers[VERIFIED_PROXY_HEADER] !== "1") return next();
    const key = sessionKey(req.headers.cookie);
    if (key === undefined) return next();

    const at = now();
    const current = windows.get(key);
    if (current === undefined || at - current.start >= windowMs) {
      if (windows.size >= MAX_TRACKED) {
        for (const [k, w] of windows) {
          if (at - w.start >= windowMs) windows.delete(k);
        }
        if (windows.size >= MAX_TRACKED) windows.clear();
      }
      windows.set(key, { start: at, count: 1, reported: false });
      return next();
    }
    if (current.count >= limit.max) {
      const retryAfter = Math.ceil((current.start + windowMs - at) / 1000);
      // Once per session per window: the first refusal is the news, and a
      // refused client retrying in a loop must not turn into a log flood.
      // Before this line a tripped limit left no trace on this side at all,
      // which is why the e2e suite's "Auth service unavailable" sat
      // unexplained (`services/client/src/lib/api/token-cache.ts`).
      if (!current.reported) {
        current.reported = true;
        console.warn(
          `[auth] session exchange limit reached (${limit.max}/${limit.windowSeconds}s) on ${req.path} for session ${key.slice(0, 12)}; 429 for ${retryAfter}s`,
        );
      }
      res
        .status(429)
        // The standard header, and better-auth's own spelling of it.
        .set("Retry-After", String(retryAfter))
        .set("X-Retry-After", String(retryAfter))
        .json({ message: "Too many requests. Please try again later." });
      return;
    }
    current.count += 1;
    next();
  };
};
