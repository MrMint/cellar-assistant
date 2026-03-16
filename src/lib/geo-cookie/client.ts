import { GEOLOCATION_COOKIE_MAX_AGE, GEOLOCATION_COOKIE_NAME } from "./parse";

/**
 * Write the user's location to a cookie (client-side only).
 * Rounds to 4 decimal places (~11m precision).
 */
export function setGeolocationCookie(lat: number, lng: number): void {
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;
  const value = `${roundedLat},${roundedLng}`;

  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GEOLOCATION_COOKIE_NAME}=${value}; path=/; max-age=${GEOLOCATION_COOKIE_MAX_AGE}; SameSite=Strict${secure}`;
}
