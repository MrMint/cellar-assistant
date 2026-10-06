import {
  GEOLOCATION_COOKIE_MAX_AGE,
  GEOLOCATION_COOKIE_NAME,
} from "./parse.ts";

/**
 * Write the user's location to a cookie (client-side only).
 *
 * **D5c.** `/map` and `/map/create-place` read this cookie through
 * `geo-cookie/server.ts` to decide where the canvas opens. Its writer is
 * `components/map/hooks/useGeolocation.ts` again — the old map, restored
 * (UI parity wave 7), which asks for the position when the map mounts and
 * keeps watching it, as production did. Between D5 and that restore the
 * writer was a "Use my location" button in the rewrite's explorer.
 *
 * Rounds to 4 decimal places (~11m precision).
 *
 * Stays on `document.cookie` rather than the Cookie Store API: cookieStore is
 * secure-context-only (undefined on the plain-HTTP dev/Playwright origins this
 * runs on), its `maxAge` needs Safari 27+ so this 24h cookie would silently
 * become a session cookie, and `set()` is async while the caller is a sync
 * geolocation callback. Revisit once `maxAge` is widely available.
 */
export function setGeolocationCookie(lat: number, lng: number): void {
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;
  const value = `${roundedLat},${roundedLng}`;

  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is unusable here — see JSDoc above.
  document.cookie = `${GEOLOCATION_COOKIE_NAME}=${value}; path=/; max-age=${GEOLOCATION_COOKIE_MAX_AGE}; SameSite=Strict${secure}`;
}
