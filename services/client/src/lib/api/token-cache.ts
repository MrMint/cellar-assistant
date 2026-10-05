/**
 * The Next server's per-session cache of API tokens.
 *
 * ## Why
 *
 * Until this existed, **every** `/api/graphql` request performed its own
 * session → JWT exchange against the actor host (`token.ts`), and so did every
 * server render (`auth-server.ts`, memoised per request only). A JWT is good
 * for 15 minutes; minting one per request bought nothing but a round trip and
 * a signature, and it spent the actor's per-session exchange limit
 * (`services/actors/src/auth/session-exchange-limit.ts`, 300 a minute) at the
 * page's request rate. Measured on the shared stack on 2026-10-05 against one
 * fresh session: 330 `{ __typename }` requests in 4 s — 300 answered, the
 * 301st onward `502 Auth service unavailable`. That is the failure the e2e
 * suite kept hitting in its last minute (`09` E3, `11`'s fixtures), and a
 * real viewer on a busy page, or several tabs, could hit it too.
 *
 * ## What is cached, and for how long
 *
 * Keyed by a SHA-256 of the session cookie's value — the session, not the
 * cookie header around it — the JWT the exchange returned, until the **earlier**
 * of:
 *
 * - its own `exp`, less {@link CLOCK_SKEW_MS}, so the API never sees one that
 *   expires in flight; and
 * - {@link MAX_CACHE_AGE_MS} after it was minted.
 *
 * The second bound is the one that matters, and it is a revocation bound, not
 * a performance one. A session revoked elsewhere (signed out on another
 * device, deleted by an admin) used to stop working on this server's very next
 * request, because the exchange re-read the session row each time. With a
 * cache it keeps working until the entry ages out. A minute keeps that window
 * short while still cutting a session's exchanges from "one per request" to
 * "about one per minute per server process" — two orders of magnitude inside
 * the actor's limit. Signing out *on this browser* is unaffected: the cookie
 * is gone, so there is no key to look up.
 *
 * Only tokens are cached. A refusal (401/403: no session) is never cached — it
 * must not outlive a sign-in — and neither is an error. Concurrent misses for
 * the same session share one exchange, so a page that fans out a dozen
 * requests on a cold cache still costs one.
 *
 * A token whose `exp` cannot be read is used once and not cached: this module
 * does not verify JWTs (the API does) and will not guess at a lifetime.
 *
 * Per process, in memory, bounded by {@link MAX_ENTRIES}. Nothing here is
 * shared across server instances, and nothing needs to be.
 */
import { createHash } from "node:crypto";
import { isSessionCookieName, parseCookieHeader } from "./session-cookie.ts";

/** The revocation window — see the module comment. */
export const MAX_CACHE_AGE_MS = 60_000;

/** A token is dropped this long before its `exp`. */
export const CLOCK_SKEW_MS = 30_000;

/** Bound on remembered sessions. */
export const MAX_ENTRIES = 10_000;

export type TokenCacheOptions = {
  maxAgeMs?: number;
  skewMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export type CachedToken = {
  token: string | null;
  /** `true` when no exchange ran for this call — the token came from the cache. */
  fromCache: boolean;
};

export type TokenCache = {
  /**
   * A token for the session `key` names, from the cache when one is fresh,
   * otherwise from `exchange()`. A `null` key (no session cookie) always
   * calls `exchange()` and caches nothing.
   */
  get(
    key: string | null,
    exchange: () => Promise<string | null>,
  ): Promise<CachedToken>;
  /** Forget `key`'s token — the API refused it. */
  evict(key: string): void;
  readonly size: number;
};

/**
 * The cache key for a `Cookie` header: a digest of its session cookie, or
 * `null` when it carries none. Both spellings (`__Secure-` or not) key the same
 * value, which is right — the value is the session.
 */
export const sessionCacheKey = (cookieHeader: string | null): string | null => {
  const values = parseCookieHeader(cookieHeader)
    .filter((entry) => isSessionCookieName(entry.name))
    .map((entry) => entry.value);
  if (values.length === 0) return null;
  return createHash("sha256").update(values.join("\n"), "utf8").digest("hex");
};

/** The JWT's `exp`, in epoch milliseconds, or `undefined` when unreadable. */
export const tokenExpiryMs = (token: string): number | undefined => {
  const payload = token.split(".")[1];
  if (payload === undefined || payload === "") return undefined;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const exp =
      typeof claims === "object" && claims !== null && "exp" in claims
        ? (claims as { exp: unknown }).exp
        : undefined;
    return typeof exp === "number" && Number.isFinite(exp)
      ? exp * 1000
      : undefined;
  } catch {
    return undefined;
  }
};

export const createTokenCache = ({
  maxAgeMs = MAX_CACHE_AGE_MS,
  skewMs = CLOCK_SKEW_MS,
  maxEntries = MAX_ENTRIES,
  now = Date.now,
}: TokenCacheOptions = {}): TokenCache => {
  const entries = new Map<string, { token: string; expiresAt: number }>();
  const inFlight = new Map<string, Promise<string | null>>();

  const store = (key: string, token: string): void => {
    const exp = tokenExpiryMs(token);
    if (exp === undefined) return;
    const at = now();
    const expiresAt = Math.min(at + maxAgeMs, exp - skewMs);
    if (expiresAt <= at) return;
    if (entries.size >= maxEntries) {
      entries.forEach((entry, k) => {
        if (entry.expiresAt <= at) entries.delete(k);
      });
      // Still full: drop the oldest insertion. `Map` iterates in insertion
      // order, and every entry lives at most `maxAgeMs`, so oldest is a fair
      // proxy for soonest-to-expire.
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done !== true) entries.delete(oldest.value);
      }
    }
    entries.delete(key);
    entries.set(key, { token, expiresAt });
  };

  return {
    async get(key, exchange) {
      if (key === null) return { token: await exchange(), fromCache: false };

      const hit = entries.get(key);
      if (hit !== undefined) {
        if (hit.expiresAt > now()) return { token: hit.token, fromCache: true };
        entries.delete(key);
      }

      const pending = inFlight.get(key);
      if (pending !== undefined) {
        return { token: await pending, fromCache: false };
      }

      const started = exchange().then((token) => {
        if (token !== null) store(key, token);
        return token;
      });
      inFlight.set(key, started);
      try {
        return { token: await started, fromCache: false };
      } finally {
        inFlight.delete(key);
      }
    },
    evict(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
};

/** The one cache the route handler and server components share. */
export const sharedTokenCache: TokenCache = createTokenCache();
