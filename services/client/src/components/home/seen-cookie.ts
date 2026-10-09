/**
 * Which finished results the viewer has opened or dismissed from "Waiting on
 * you" (`inbox.ts`) — a per-browser convenience, kept in a small cookie so
 * the **server** renders the inbox without them: read from `localStorage`
 * after hydration instead, a dismissed row would flash back on every visit
 * and then vanish.
 *
 * The cookie holds short hashes, not the keys (`<kind>:<uuid>@<iso>` is ~70
 * bytes; a hash is 7), newest last, at most {@link SEEN_LIMIT}: a few hundred
 * bytes on each request. Losing it costs nothing but a result waiting again
 * until its three-day window ends (`AI_JOB_SETTLED_WINDOW_MS`).
 *
 * Pure apart from `writeSeenCookie` — `seen-cookie.test.ts`.
 */

export const SEEN_COOKIE_NAME = "ca_home_seen";
/** Results seen within three days — far more than anyone produces. */
export const SEEN_LIMIT = 60;
/** A week: longer than any result stays in the inbox. */
export const SEEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/** FNV-1a, 32-bit, base 36: short, stable, and good enough to tell rows apart. */
export const seenHash = (key: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const HASH = /^[0-9a-z]{1,7}$/;

/** The cookie's value as hashes, oldest first; anything malformed is dropped. */
export const parseSeenCookie = (value: string | undefined | null): string[] =>
  (value ?? "")
    .split(".")
    .filter((part) => HASH.test(part))
    .slice(-SEEN_LIMIT);

/** `hashes` with `key` added (moved to newest), capped. */
export const withSeen = (hashes: readonly string[], key: string): string[] => {
  const hash = seenHash(key);
  return [...hashes.filter((h) => h !== hash), hash].slice(-SEEN_LIMIT);
};

export const serializeSeen = (hashes: readonly string[]): string =>
  hashes.join(".");

/** Write the cookie (browser only). */
export function writeSeenCookie(hashes: readonly string[]): void {
  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is secure-context-only and its maxAge is not yet in Safari — see `lib/geo-cookie/client.ts`.
  document.cookie = `${SEEN_COOKIE_NAME}=${serializeSeen(hashes)}; path=/; max-age=${SEEN_COOKIE_MAX_AGE}; SameSite=Strict${secure}`;
}
