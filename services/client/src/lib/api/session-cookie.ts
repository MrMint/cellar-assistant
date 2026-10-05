/**
 * Which cookies belong to better-auth, and how to hand them back to it.
 *
 * Pure: no `next/headers`, no `fetch`. The Next-bound callers pass in whatever
 * cookie source they have (a `Cookie` header string on a route handler's
 * `Request`, or the entries of `cookies()` in a server component).
 */

/**
 * better-auth names every cookie `<prefix>.<purpose>`, and prepends
 * `__Secure-` when its `baseURL` is https (`useSecureCookies`). Both spellings
 * have to be recognised, because the same code runs against
 * `http://localhost:3002` locally and an https origin in production.
 *
 * The set is wider than just the session token on purpose: `session_data`
 * (the cookie cache), `dont_remember`, and the short-lived OAuth `state`,
 * `pkce_code_verifier` and `nonce` cookies are all part of the protocol. An
 * OAuth callback that arrives without its `state` cookie fails.
 */
const AUTH_COOKIE_PREFIXES = ["better-auth.", "__Secure-better-auth."];

export const isAuthCookieName = (name: string): boolean =>
  AUTH_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));

/** The session cookie proper, in either spelling. */
export const isSessionCookieName = (name: string): boolean =>
  name === "better-auth.session_token" ||
  name === "__Secure-better-auth.session_token";

export type CookieEntry = { name: string; value: string };

/**
 * Parses a `Cookie` request header into entries.
 *
 * Deliberately forgiving in one direction only: a pair without `=` is dropped
 * rather than treated as a valueless cookie, and values keep their percent
 * encoding, because they are going straight back out in another `Cookie`
 * header and decoding then re-encoding could change them.
 */
export const parseCookieHeader = (header: string | null): CookieEntry[] => {
  if (header === null || header === "") return [];
  const entries: CookieEntry[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === "") continue;
    entries.push({ name, value: part.slice(separator + 1).trim() });
  }
  return entries;
};

const serialize = (entries: CookieEntry[]): string | null =>
  entries.length === 0
    ? null
    : entries.map(({ name, value }) => `${name}=${value}`).join("; ");

/**
 * A `Cookie` header carrying **only** better-auth's cookies.
 *
 * Forwarding the browser's whole cookie jar to the actors app would send it
 * analytics cookies, and — until every viewer's browser has expired it — the
 * legacy `nhostSession`, which held a live Hasura access token. Neither belongs
 * there, so the filter is a privacy boundary, not tidiness. It is an allowlist
 * rather than a denylist for the same reason: a cookie nobody thought about is
 * dropped, not forwarded.
 */
export const authCookieHeader = (entries: CookieEntry[]): string | null =>
  serialize(entries.filter((entry) => isAuthCookieName(entry.name)));

/** As {@link authCookieHeader}, straight off a request's `Cookie` header. */
export const authCookieHeaderFrom = (header: string | null): string | null =>
  authCookieHeader(parseCookieHeader(header));

/**
 * Whether a session cookie is present. A cheap negative check only: a cookie
 * can be present and the session behind it revoked or expired, which only the
 * actors app can say.
 */
export const hasSessionCookie = (entries: CookieEntry[]): boolean =>
  entries.some((entry) => isSessionCookieName(entry.name));

/**
 * The better-auth cookies that carry the **session** itself — its token, the
 * optional cookie cache, and the "don't remember me" marker — in either
 * spelling. What `graphql-proxy.ts` may pass on from a server-side token
 * exchange, and nothing more: a `Set-Cookie` the actors app sends on that
 * exchange is relayed only if it names one of these.
 */
const SESSION_SET_COOKIE_NAMES = new Set(
  ["session_token", "session_data", "dont_remember"].flatMap((purpose) => [
    `better-auth.${purpose}`,
    `__Secure-better-auth.${purpose}`,
  ]),
);

/** Whether a `Set-Cookie` value (attributes and all) names a session cookie. */
export const isSessionSetCookie = (setCookie: string): boolean => {
  const separator = setCookie.indexOf("=");
  return (
    separator > 0 &&
    SESSION_SET_COOKIE_NAMES.has(setCookie.slice(0, separator).trim())
  );
};
