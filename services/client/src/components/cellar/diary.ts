/**
 * The Finished diary's words (X04): finished bottles by the month you
 * finished them, each with how long it lasted and what you logged from it.
 * Pure, so it is tested without a render.
 *
 * Dates are cut in the zone the server used for the page (the viewer's, from
 * the `ca-tz` cookie, else UTC), and printed from numeric parts and a fixed
 * month table rather than locale strings, so the server's render and the
 * browser's hydration print the same bytes.
 */
import { bottleAge } from "./bottle-state";
import { MONTHS_LONG, MONTHS_SHORT } from "./dashboard";

/** The calendar parts of `iso` in `zone`, or null if either is bad. */
export const zonedParts = (
  iso: string,
  zone: string,
): { year: number; month: number; day: number } | null => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(at));
  } catch {
    return null;
  }
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? { year, month, day }
    : null;
};

export type DiaryLog = {
  count: number;
  lastScore: number | null;
  lastNote: string | null;
};

export type DiaryEntryInput = {
  /** The bottle's id. */
  id: string;
  emptyAt: string | null;
  openAt: string | null;
};

export type DiaryMonth<T> = {
  /** `YYYY-MM`, or `undated` for a bottle with no finish date. */
  key: string;
  label: string;
  entries: T[];
};

/**
 * Entries (already latest-finished first) into months, in that order. A month
 * appears once even if the list is not perfectly ordered.
 */
export const diaryMonths = <T extends DiaryEntryInput>(
  entries: readonly T[],
  zone: string,
): DiaryMonth<T>[] => {
  const months: DiaryMonth<T>[] = [];
  const byKey = new Map<string, DiaryMonth<T>>();
  for (const entry of entries) {
    const parts =
      entry.emptyAt === null ? null : zonedParts(entry.emptyAt, zone);
    const key =
      parts === null
        ? "undated"
        : `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    let month = byKey.get(key);
    if (month === undefined) {
      month = {
        key,
        label:
          parts === null
            ? "No date"
            : `${MONTHS_LONG[parts.month - 1] ?? ""} ${parts.year}`,
        entries: [],
      };
      byKey.set(key, month);
      months.push(month);
    }
    month.entries.push(entry);
  }
  return months;
};

/** "Finished 3 Oct · lasted 3 weeks" — or as much of it as is known. */
export const finishedLine = (entry: DiaryEntryInput, zone: string): string => {
  const parts = entry.emptyAt === null ? null : zonedParts(entry.emptyAt, zone);
  const finished =
    parts === null
      ? "Finished"
      : `Finished ${parts.day} ${MONTHS_SHORT[parts.month - 1] ?? ""}`;
  if (entry.openAt === null || entry.emptyAt === null) return finished;
  const lasted = bottleAge(entry.openAt, Date.parse(entry.emptyAt));
  return lasted === null ? finished : `${finished} · lasted ${lasted.long}`;
};

/**
 * "Your log: 3 pours · last 4.5★" — what you wrote down from this bottle.
 * Only ever your own logs (`CellarItem.myLog`). Null when you logged nothing.
 */
export const logLine = (log: DiaryLog | null | undefined): string | null => {
  if (log === null || log === undefined || log.count === 0) return null;
  const pours = `${log.count} ${log.count === 1 ? "pour" : "pours"}`;
  return log.lastScore === null
    ? `Your log: ${pours}`
    : `Your log: ${pours} · last ${formatScore(log.lastScore)}★`;
};

/** 4 → "4", 4.5 → "4.5" (the Score primitive's rule). */
const formatScore = (score: number): string =>
  Number.isInteger(score) ? String(score) : score.toFixed(1);
