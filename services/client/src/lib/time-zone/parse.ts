/**
 * The viewer's IANA time zone, carried to the server in a cookie (X04).
 *
 * The cellar dashboard counts "finished this month" and pours per month, and
 * the Finished diary heads its entries by month: which month an instant is in
 * depends on where the viewer lives. The server cannot know that, so the
 * browser writes it here (`client.ts`) and the server reads it
 * (`server.ts`). Without the cookie — the very first visit — months are cut
 * in UTC, and the page re-renders once the browser has written it.
 *
 * A zone name and nothing else: no location, no offset history.
 */
export const TIME_ZONE_COOKIE_NAME = "ca-tz";
/** A year; a zone changes when someone moves, and the page rewrites it then. */
export const TIME_ZONE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** `Area/Location[/Sub]`, `UTC`, `Etc/GMT+5` — the shapes IANA names take. */
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** A cookie value that looks like a zone name, or null. */
export const parseTimeZoneCookie = (
  value: string | null | undefined,
): string | null => {
  if (value === null || value === undefined) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return decoded.length <= 64 && ZONE.test(decoded) ? decoded : null;
};
