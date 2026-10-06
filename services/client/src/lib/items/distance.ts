/**
 * "3 days", "about 2 hours" — date-fns' `formatDistance` wording (en-US, no
 * suffix, `includeSeconds: false`), for the restored bottle slider's
 * "Opened … ago" line.
 *
 * A local copy rather than re-adding date-fns: the only call left is this one
 * phrase, and the hydration rule (`hydration-safety.test.ts`) means it is only
 * ever computed after mount anyway. Months are 30-day months here, where
 * date-fns walks the calendar; the two differ by at most a day near a month
 * boundary.
 *
 * Plain module, no `@/` imports: `src/lib` is also run by plain `node --test`.
 */

const MINUTES_IN_DAY = 1440;
const MINUTES_IN_ALMOST_TWO_DAYS = 2520;
const MINUTES_IN_MONTH = 43200;
const MINUTES_IN_TWO_MONTHS = 86400;

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/** The distance between an ISO instant and `now` (epoch ms), either order. */
export const formatDistance = (iso: string, now: number): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.round(Math.abs(now - then) / 60000);

  if (minutes < 2) {
    return minutes === 0 ? "less than a minute" : "1 minute";
  }
  if (minutes < 45) return plural(minutes, "minute");
  if (minutes < 90) return "about 1 hour";
  if (minutes < MINUTES_IN_DAY) {
    return `about ${plural(Math.round(minutes / 60), "hour")}`;
  }
  if (minutes < MINUTES_IN_ALMOST_TWO_DAYS) return "1 day";
  if (minutes < MINUTES_IN_MONTH) {
    return plural(Math.round(minutes / MINUTES_IN_DAY), "day");
  }
  if (minutes < MINUTES_IN_TWO_MONTHS) {
    return `about ${plural(Math.round(minutes / MINUTES_IN_MONTH), "month")}`;
  }

  const months = Math.floor(minutes / MINUTES_IN_MONTH);
  if (months < 12) return plural(months, "month");

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (remainder < 3) return `about ${plural(years, "year")}`;
  if (remainder < 9) return `over ${plural(years, "year")}`;
  return `almost ${plural(years + 1, "year")}`;
};
