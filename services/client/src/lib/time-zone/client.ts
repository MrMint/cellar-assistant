import {
  parseTimeZoneCookie,
  TIME_ZONE_COOKIE_MAX_AGE,
  TIME_ZONE_COOKIE_NAME,
} from "./parse.ts";

/** The browser's own zone, or null if the runtime will not say. */
export function browserTimeZone(): string | null {
  try {
    return parseTimeZoneCookie(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    return null;
  }
}

/**
 * Write the zone (client-side only). `document.cookie` for the reasons
 * `geo-cookie/client.ts` gives.
 */
export function setTimeZoneCookie(zone: string): void {
  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is unusable here — see geo-cookie/client.ts.
  document.cookie = `${TIME_ZONE_COOKIE_NAME}=${encodeURIComponent(zone)}; path=/; max-age=${TIME_ZONE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
