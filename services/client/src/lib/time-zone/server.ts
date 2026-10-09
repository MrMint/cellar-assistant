import { cookies } from "next/headers";
import { parseTimeZoneCookie, TIME_ZONE_COOKIE_NAME } from "./parse.ts";

/** The viewer's zone from the cookie (server-side only), or null. */
export async function getTimeZoneFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return parseTimeZoneCookie(cookieStore.get(TIME_ZONE_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}
