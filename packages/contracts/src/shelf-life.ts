/**
 * Shelf life: when a bottle is at its best, from a rule of thumb for its
 * style and the dates the person gave it (ux-c M3, plan L37).
 *
 * Two halves. `lookupShelfLife` finds the typical window for an item's type
 * and style, counted from one of four starting points (`basis`). `drinkWindow`
 * turns that row and one bottle's own dates into a window: the person's
 * `drinkFrom` / `drinkUntil` win field by field, and each end says where it
 * came from, so the UI can label a typical date as typical.
 *
 * Seams ships the types, the functions and an **empty table**: until a later
 * stream fills `SHELF_LIFE`, every lookup is `null` and a window comes only
 * from the person's own dates.
 *
 * Dates are ISO `yyyy-mm-dd`. A vintage is a year number (wine's vintage date
 * and sake's integer vintage both reduce to one). Pure: no clock.
 */
import type { ItemType } from "./items.ts";

/**
 * The item's style fields, per type: WINE `style`, SAKE `category`, SPIRIT
 * `spiritType`, TEA `category` (and TEA `form`). The same object Home's
 * drink-soon derives (`services/client/src/components/home/drink-soon.ts`).
 */
export type StyleFields = {
  readonly style: string | null;
  /** TEA `form`; `matcha_powder` reads differently from its category. */
  readonly form?: string | null;
};

/** What a window is counted from. */
export type ShelfLifeBasis = "packaged" | "vintage" | "acquired" | "opened";

export type ShelfLifeEntry = {
  readonly type: ItemType;
  /**
   * The style this row is for. `style: null` matches any style of the type;
   * a `form` left out matches any form.
   */
  readonly match: StyleFields;
  /** Months after the basis date the window opens. */
  readonly fromMonths: number;
  /** Months after the basis date the window closes. */
  readonly untilMonths: number;
  readonly basis: ShelfLifeBasis;
};

/** The table. Empty in seams; a later stream fills it. */
export const SHELF_LIFE: readonly ShelfLifeEntry[] = [];

/** How closely `entry` matches `fields`: -1 not at all, higher is closer. */
const matchScore = (entry: ShelfLifeEntry, fields: StyleFields): number => {
  let score = 0;
  if (entry.match.style !== null) {
    if (entry.match.style !== fields.style) return -1;
    score += 1;
  }
  if (entry.match.form !== undefined) {
    if (entry.match.form !== (fields.form ?? null)) return -1;
    score += 2;
  }
  return score;
};

/**
 * The closest row of `table` for this type, style and basis, or `null`. A row
 * naming the form beats one naming the style, which beats a type-wide row;
 * on a tie the earlier row wins.
 */
export const lookupShelfLife = (
  type: ItemType,
  fields: StyleFields,
  basis: ShelfLifeBasis,
  table: readonly ShelfLifeEntry[] = SHELF_LIFE,
): ShelfLifeEntry | null => {
  let best: ShelfLifeEntry | null = null;
  let bestScore = -1;
  for (const entry of table) {
    if (entry.type !== type || entry.basis !== basis) continue;
    const score = matchScore(entry, fields);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
};

export type BottleDates = {
  readonly packagedOn: string | null;
  readonly acquiredOn: string | null;
  /** When it was opened; an ISO date or timestamp (only the date is read). */
  readonly openedAt: string | null;
  readonly vintageYear: number | null;
  readonly drinkFrom: string | null;
  readonly drinkUntil: string | null;
};

export type WindowSource = "user" | "typical";

export type DrinkWindow = {
  readonly from: string | null;
  readonly fromSource: WindowSource | null;
  readonly until: string | null;
  readonly untilSource: WindowSource | null;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** `yyyy-mm-dd` for a UTC date. */
const isoDate = (year: number, monthIndex: number, day: number): string => {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return d.toISOString().slice(0, 10);
};

/**
 * `date` plus `months` calendar months, the day clamped to the end of a
 * shorter month (Jan 31 + 1 month is Feb 28, or 29). `null` for a date it
 * cannot read.
 */
export const addMonths = (date: string, months: number): string | null => {
  const m = ISO_DATE.exec(date);
  if (m === null) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1 + Math.trunc(months);
  const day = Number(m[3]);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return isoDate(year, monthIndex, Math.min(day, lastDay));
};

/** The bottle's date the entry counts from, as `yyyy-mm-dd`, or `null`. */
const basisDate = (
  bottle: BottleDates,
  basis: ShelfLifeBasis,
): string | null => {
  const day = (value: string | null): string | null =>
    value === null ? null : (ISO_DATE.exec(value)?.[0] ?? null);
  switch (basis) {
    case "packaged":
      return day(bottle.packagedOn);
    case "acquired":
      return day(bottle.acquiredOn);
    case "opened":
      return day(bottle.openedAt);
    case "vintage":
      return bottle.vintageYear === null
        ? null
        : isoDate(bottle.vintageYear, 0, 1);
  }
};

/**
 * The bottle's drink window: its own `drinkFrom` / `drinkUntil` where set,
 * otherwise the typical date from `entry` counted from the entry's basis.
 * `null` when neither side gives either end.
 */
export const drinkWindow = (
  bottle: BottleDates,
  entry: ShelfLifeEntry | null,
): DrinkWindow | null => {
  const base = entry === null ? null : basisDate(bottle, entry.basis);
  const typicalFrom =
    entry === null || base === null ? null : addMonths(base, entry.fromMonths);
  const typicalUntil =
    entry === null || base === null ? null : addMonths(base, entry.untilMonths);

  const pick = (
    user: string | null,
    typical: string | null,
  ): [string | null, WindowSource | null] =>
    user !== null
      ? [user, "user"]
      : typical !== null
        ? [typical, "typical"]
        : [null, null];

  const [from, fromSource] = pick(bottle.drinkFrom, typicalFrom);
  const [until, untilSource] = pick(bottle.drinkUntil, typicalUntil);
  if (from === null && until === null) return null;
  return { from, fromSource, until, untilSource };
};
