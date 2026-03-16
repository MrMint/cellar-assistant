import { cookies } from "next/headers";
import {
  type CachedLocation,
  GEOLOCATION_COOKIE_NAME,
  parseGeolocationCookie,
} from "./parse";

/**
 * Read the cached user location from the cookie (server-side only).
 * Returns null if the cookie is missing, expired, or malformed.
 */
export async function getGeolocationFromCookie(): Promise<CachedLocation | null> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(GEOLOCATION_COOKIE_NAME)?.value;
    return parseGeolocationCookie(value);
  } catch {
    // cookies() throws during static generation — graceful fallback
    return null;
  }
}
