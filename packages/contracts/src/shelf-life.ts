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
 * The table (`SHELF_LIFE`) is filled by ux-c freshness (L02): sealed rows
 * counted in months from bottling, vintage or purchase, and the opened-bottle
 * rows `home/drink-soon.ts` used to carry, in days (L18: one table). A style
 * with no row has no window: nothing estimates one (D29, L3).
 *
 * Drink soon's two rules live here too (`openedDrinkSoon`, `sealedDrinkSoon`),
 * so Home (client) and the cellar actor (server) answer the same way.
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

/** The bases a sealed bottle's window can count from, in the order tried. */
export const SEALED_BASES = ["packaged", "vintage", "acquired"] as const;
export type SealedBasis = (typeof SEALED_BASES)[number];

type EntryBase = {
  readonly type: ItemType;
  /**
   * The style this row is for. `style: null` matches any style of the type;
   * a `form` left out matches any form.
   */
  readonly match: StyleFields;
  /** The style as a sentence names it: "typical for <label>". */
  readonly label: string;
};

/**
 * A sealed bottle's window, in months after the basis date. Months, because
 * that is the grain a person reads a cellar in ("2024 – 2036").
 */
export type SealedShelfLife = EntryBase & {
  readonly basis: SealedBasis;
  /** Months after the basis date the window opens. */
  readonly fromMonths: number;
  /** Months after the basis date the window closes. */
  readonly untilMonths: number;
};

/**
 * An opened bottle's life, in days after it was opened (plan L18: the table
 * `home/drink-soon.ts` used to carry). Days, because "3–5 days" is the whole
 * point for an opened red, and a month grain would round it away.
 */
export type OpenedShelfLife = EntryBase & {
  readonly basis: "opened";
  /** Days after opening the bottle is at its typical shortest. */
  readonly fromDays: number;
  /** Days after opening it is typically past its best. */
  readonly untilDays: number;
};

export type ShelfLifeEntry = SealedShelfLife | OpenedShelfLife;

type EntryFor<B extends ShelfLifeBasis> = B extends "opened"
  ? OpenedShelfLife
  : SealedShelfLife;

const opened = (
  type: ItemType,
  match: StyleFields,
  fromDays: number,
  untilDays: number,
  label: string,
): OpenedShelfLife => ({
  type,
  match,
  basis: "opened",
  fromDays,
  untilDays,
  label,
});

const sealed = (
  type: ItemType,
  match: StyleFields,
  basis: SealedBasis,
  fromMonths: number,
  untilMonths: number,
  label: string,
): SealedShelfLife => ({ type, match, basis, fromMonths, untilMonths, label });

const styles = (
  type: ItemType,
  values: readonly string[],
  make: (type: ItemType, match: StyleFields) => ShelfLifeEntry,
): ShelfLifeEntry[] => values.map((style) => make(type, { style }));

/** Every type's rows for one style, for both of the given bases. */
const bothBases = (
  type: ItemType,
  match: StyleFields,
  bases: readonly SealedBasis[],
  fromMonths: number,
  untilMonths: number,
  label: string,
): SealedShelfLife[] =>
  bases.map((basis) =>
    sealed(type, match, basis, fromMonths, untilMonths, label),
  );

const ANY: StyleFields = { style: null };
const SHORT_SAKE = ["ginjo", "daiginjo", "junmai_ginjo", "junmai_daiginjo"];
const FULL_SAKE = [
  "junmai",
  "honjozo",
  "tokubetsu_junmai",
  "tokubetsu_honjozo",
  "futsushu",
  "genshu",
];

const BEER_LABELS: Readonly<Record<string, string>> = {
  PALE_ALE: "pale ale",
  HEFEWEIZEN: "hefeweizen",
  WEISSBIER: "weissbier",
  WITBIER: "witbier",
  DUNKELWEIZEN: "dunkelweizen",
  STOUT: "stout",
  PORTER: "porter",
  DOPPELBOCK: "doppelbock",
  SCOTCH_ALE: "Scotch ale",
};

const TEA_LABELS: Readonly<Record<string, string>> = {
  oolong: "oolong",
  black: "black tea",
  herbal: "herbal tea",
  rooibos: "rooibos",
  mate: "mate",
  chai: "chai",
  blend: "blended tea",
};

function beerLabel(style: string): string {
  return BEER_LABELS[style] ?? style.toLowerCase().replaceAll("_", " ");
}

function sakeLabel(style: string | null): string {
  return (style ?? "sake").replaceAll("_", " ");
}

function teaLabel(style: string): string {
  return TEA_LABELS[style] ?? style;
}

/**
 * The table: rules of thumb, deterministic, labelled (decision D29, plan L3).
 * **A style with no row has no window** — nothing estimates one, not even as
 * a fallback. Values are keyed by each type's reference table (`wine_style`,
 * `beer_style`, `sake_category`, `spirit_type`, `tea_category`, `tea_form`).
 *
 * What is deliberately absent: sealed spirits (they keep indefinitely), koshu,
 * dark tea and pu-erh sealed (they are aged on purpose), and any wine style
 * the person has not told us.
 */
export const SHELF_LIFE: readonly ShelfLifeEntry[] = [
  // ── Opened (L18: moved from home/drink-soon.ts, unchanged) ──────────────
  opened("WINE", { style: "SPARKLING" }, 1, 3, "sparkling wine"),
  opened("WINE", { style: "RED" }, 3, 5, "red wine"),
  opened("WINE", { style: "WHITE" }, 3, 5, "white wine"),
  opened("WINE", { style: "ROSE" }, 3, 5, "rosé"),
  opened("WINE", { style: "DESSERT" }, 7, 28, "dessert wine"),
  opened("SAKE", { style: "namazake" }, 3, 7, "namazake"),
  opened("SAKE", { style: "nigorizake" }, 3, 7, "nigori"),
  opened("SAKE", { style: "ginjo" }, 5, 10, "ginjo"),
  opened("SAKE", { style: "daiginjo" }, 5, 10, "daiginjo"),
  opened("SAKE", { style: "junmai_ginjo" }, 5, 10, "junmai ginjo"),
  opened("SAKE", { style: "junmai_daiginjo" }, 5, 10, "junmai daiginjo"),
  opened("SAKE", { style: "junmai" }, 7, 21, "junmai"),
  opened("SAKE", { style: "honjozo" }, 7, 21, "honjozo"),
  opened("SAKE", { style: "tokubetsu_junmai" }, 7, 21, "tokubetsu junmai"),
  opened("SAKE", { style: "tokubetsu_honjozo" }, 7, 21, "tokubetsu honjozo"),
  opened("SAKE", { style: "futsushu" }, 7, 21, "futsushu"),
  opened("SAKE", { style: "genshu" }, 7, 21, "genshu"),
  opened("SAKE", { style: "taruzake" }, 7, 21, "taruzake"),
  opened("SAKE", { style: "koshu" }, 30, 90, "koshu"),
  opened(
    "SPIRIT",
    { style: "AMARO_APERITIF_VERMOUTH" },
    30,
    60,
    "vermouth and aperitifs",
  ),
  opened("SPIRIT", { style: "LIQUEURS" }, 180, 365, "liqueur"),
  opened("SPIRIT", { style: "VODKA" }, 365, 730, "vodka"),
  opened("SPIRIT", { style: "BOURBON" }, 365, 730, "bourbon"),
  opened("SPIRIT", { style: "TEQUILA" }, 365, 730, "tequila"),
  opened("SPIRIT", { style: "RUM" }, 365, 730, "rum"),
  opened("SPIRIT", { style: "GIN" }, 365, 730, "gin"),
  opened("SPIRIT", { style: "SCOTCH" }, 365, 730, "Scotch"),
  opened("SPIRIT", { style: "WHISKEY" }, 365, 730, "whiskey"),
  opened("SPIRIT", { style: "BRANDY_COGNAC" }, 365, 730, "brandy"),
  opened("SPIRIT", { style: "MEZCAL" }, 365, 730, "mezcal"),
  opened("SPIRIT", { style: "SOJU" }, 180, 365, "soju"),
  opened("SPIRIT", { style: "BAIJIU" }, 365, 730, "baijiu"),
  opened("TEA", { style: "green" }, 60, 180, "green tea"),
  opened("TEA", { style: "white" }, 60, 180, "white tea"),
  opened("TEA", { style: "yellow" }, 60, 180, "yellow tea"),
  opened("TEA", { style: "oolong" }, 180, 365, "oolong"),
  opened("TEA", { style: "black" }, 180, 365, "black tea"),
  opened("TEA", { style: "dark" }, 365, 730, "dark tea"),
  opened("TEA", { style: "pu_erh" }, 365, 730, "pu-erh"),
  opened("TEA", { style: "herbal" }, 180, 365, "herbal tea"),
  opened("TEA", { style: "rooibos" }, 180, 365, "rooibos"),
  opened("TEA", { style: "mate" }, 180, 365, "mate"),
  opened("TEA", { style: "chai" }, 180, 365, "chai"),
  opened("TEA", { style: "blend" }, 180, 365, "blended tea"),
  // Matcha goes stale fastest of any tea, whatever its category says.
  opened("TEA", { style: null, form: "matcha_powder" }, 30, 60, "matcha"),
  // Any beer is best the day it is opened; roasted beans fade over weeks.
  opened("BEER", ANY, 1, 2, "beer"),
  opened("COFFEE", ANY, 14, 30, "coffee beans"),

  // ── Sealed wine: from the vintage, or from purchase for a non-vintage ───
  sealed("WINE", { style: "RED" }, "vintage", 24, 120, "red wine"),
  sealed("WINE", { style: "WHITE" }, "vintage", 12, 60, "white wine"),
  sealed("WINE", { style: "ROSE" }, "vintage", 0, 24, "rosé"),
  sealed("WINE", { style: "SPARKLING" }, "vintage", 12, 72, "sparkling wine"),
  sealed("WINE", { style: "DESSERT" }, "vintage", 36, 240, "dessert wine"),
  sealed("WINE", { style: "WHITE" }, "acquired", 0, 24, "white wine"),
  sealed("WINE", { style: "ROSE" }, "acquired", 0, 12, "rosé"),
  sealed("WINE", { style: "SPARKLING" }, "acquired", 0, 24, "sparkling wine"),

  // ── Sealed beer: from the canning or bottling date, else from purchase ──
  ...bothBases("BEER", { style: "INDIA_PALE_ALE" }, ["packaged"], 0, 3, "IPA"),
  ...bothBases("BEER", { style: "INDIA_PALE_ALE" }, ["acquired"], 0, 2, "IPA"),
  ...(
    ["PALE_ALE", "HEFEWEIZEN", "WEISSBIER", "WITBIER", "DUNKELWEIZEN"] as const
  ).flatMap((style) => [
    sealed("BEER", { style }, "packaged", 0, 4, beerLabel(style)),
    sealed("BEER", { style }, "acquired", 0, 3, beerLabel(style)),
  ]),
  ...(["STOUT", "PORTER", "DOPPELBOCK", "SCOTCH_ALE"] as const).flatMap(
    (style) =>
      bothBases(
        "BEER",
        { style },
        ["packaged", "acquired"],
        0,
        12,
        beerLabel(style),
      ),
  ),
  ...bothBases(
    "BEER",
    { style: "OLD_ALE" },
    ["packaged", "acquired"],
    0,
    36,
    "old ale",
  ),
  ...bothBases(
    "BEER",
    { style: "BARLEY_WINE" },
    ["packaged", "acquired"],
    0,
    60,
    "barleywine",
  ),
  ...bothBases(
    "BEER",
    { style: "EISBOCK" },
    ["packaged", "acquired"],
    0,
    36,
    "eisbock",
  ),
  sealed("BEER", ANY, "packaged", 0, 6, "beer"),
  sealed("BEER", ANY, "acquired", 0, 4, "beer"),

  // ── Sealed coffee: from the roast date, else from purchase ──────────────
  sealed("COFFEE", ANY, "packaged", 0, 2, "roasted coffee"),
  sealed("COFFEE", ANY, "acquired", 0, 1, "roasted coffee"),

  // ── Sealed sake: from the bottling date (sake labels carry it) ──────────
  ...bothBases(
    "SAKE",
    { style: "namazake" },
    ["packaged", "acquired"],
    0,
    3,
    "namazake",
  ),
  ...bothBases(
    "SAKE",
    { style: "nigorizake" },
    ["packaged", "acquired"],
    0,
    6,
    "nigori",
  ),
  ...bothBases(
    "SAKE",
    { style: "taruzake" },
    ["packaged", "acquired"],
    0,
    6,
    "taruzake",
  ),
  ...styles("SAKE", SHORT_SAKE, (type, match) =>
    sealed(type, match, "packaged", 0, 9, sakeLabel(match.style)),
  ),
  ...styles("SAKE", SHORT_SAKE, (type, match) =>
    sealed(type, match, "acquired", 0, 6, sakeLabel(match.style)),
  ),
  ...styles("SAKE", FULL_SAKE, (type, match) =>
    sealed(type, match, "packaged", 0, 12, sakeLabel(match.style)),
  ),
  ...styles("SAKE", FULL_SAKE, (type, match) =>
    sealed(type, match, "acquired", 0, 9, sakeLabel(match.style)),
  ),

  // ── Sealed tea: from packing, else from purchase ────────────────────────
  ...bothBases(
    "TEA",
    { style: null, form: "matcha_powder" },
    ["packaged", "acquired"],
    0,
    6,
    "matcha",
  ),
  ...(["green", "white", "yellow"] as const).flatMap((style) =>
    bothBases(
      "TEA",
      { style },
      ["packaged", "acquired"],
      0,
      12,
      `${style} tea`,
    ),
  ),
  ...(
    ["oolong", "black", "herbal", "rooibos", "mate", "chai", "blend"] as const
  ).flatMap((style) =>
    bothBases(
      "TEA",
      { style },
      ["packaged", "acquired"],
      0,
      24,
      teaLabel(style),
    ),
  ),
];

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
export const lookupShelfLife = <B extends ShelfLifeBasis>(
  type: ItemType,
  fields: StyleFields,
  basis: B,
  table: readonly ShelfLifeEntry[] = SHELF_LIFE,
): EntryFor<B> | null => {
  let best: EntryFor<B> | null = null;
  let bestScore = -1;
  for (const entry of table) {
    if (entry.type !== type || entry.basis !== basis) continue;
    const score = matchScore(entry, fields);
    if (score > bestScore) {
      best = entry as EntryFor<B>;
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

/** `date` plus `days` days, as `yyyy-mm-dd`; `null` for a date it cannot read. */
export const addDays = (date: string, days: number): string | null => {
  const m = ISO_DATE.exec(date);
  if (m === null) return null;
  return isoDate(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]) + Math.trunc(days),
  );
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

/** The entry's two ends counted from `base`. */
const typicalEnds = (
  entry: ShelfLifeEntry,
  base: string,
): [string | null, string | null] =>
  entry.basis === "opened"
    ? [addDays(base, entry.fromDays), addDays(base, entry.untilDays)]
    : [addMonths(base, entry.fromMonths), addMonths(base, entry.untilMonths)];

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
  const [typicalFrom, typicalUntil] =
    entry === null || base === null ? [null, null] : typicalEnds(entry, base);

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

/**
 * The row a **sealed** bottle's window counts from: the first of
 * {@link SEALED_BASES} that both has a row for this style and a date on the
 * bottle. `null` when none does — and then only the person's own dates make
 * a window (D29: nothing estimates one).
 */
export const sealedShelfLife = (
  type: ItemType,
  fields: StyleFields,
  bottle: BottleDates,
  table: readonly ShelfLifeEntry[] = SHELF_LIFE,
): SealedShelfLife | null => {
  for (const basis of SEALED_BASES) {
    if (basisDate(bottle, basis) === null) continue;
    const entry = lookupShelfLife(type, fields, basis, table);
    if (entry !== null) return entry;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Drink soon (plan L18)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How far ahead Drink soon looks for a sealed bottle: one whose window closes
 * within this many months joins the list (the board's "within 3 months").
 */
export const DRINK_SOON_HORIZON_MONTHS = 3;

const DAY_MS = 86_400_000;

export type OpenedDrinkSoon = {
  readonly reason: "opened";
  /** `past` once beyond the typical span; `now` while inside it. */
  readonly urgency: "past" | "now";
  /** Whole days since it was opened. */
  readonly openDays: number;
  readonly entry: OpenedShelfLife;
  /** How far through its life it is: openDays / untilDays (≥ 1 when past). */
  readonly ratio: number;
};

/**
 * Whether an open bottle belongs under Drink soon, and how urgently: once it
 * has been open for the style's shortest typical span. A sealed or finished
 * bottle, an unparseable or future `openAt`, and a style the table does not
 * know all answer `null`.
 */
export const openedDrinkSoon = (
  type: ItemType,
  fields: StyleFields,
  bottle: { readonly openAt: string | null; readonly emptyAt?: string | null },
  now: number,
  table: readonly ShelfLifeEntry[] = SHELF_LIFE,
): OpenedDrinkSoon | null => {
  if (bottle.openAt === null || (bottle.emptyAt ?? null) !== null) return null;
  const opened = Date.parse(bottle.openAt);
  if (Number.isNaN(opened) || opened > now) return null;
  const entry = lookupShelfLife(type, fields, "opened", table);
  if (entry === null) return null;
  const openDays = Math.floor((now - opened) / DAY_MS);
  if (openDays < entry.fromDays) return null;
  return {
    reason: "opened",
    urgency: openDays > entry.untilDays ? "past" : "now",
    openDays,
    entry,
    ratio: openDays / entry.untilDays,
  };
};

export type SealedDrinkSoon = {
  readonly reason: "sealed";
  /** The window; its `until` is always set. */
  readonly window: DrinkWindow & { readonly until: string };
  /** The typical row, when one gave either end; `null` for the person's own. */
  readonly entry: SealedShelfLife | null;
  /** `past` once the window has closed, `soon` while it is closing. */
  readonly urgency: "past" | "soon";
};

/**
 * Whether a **sealed** bottle belongs under Drink soon: its window, from the
 * person's dates or the table, closes within {@link DRINK_SOON_HORIZON_MONTHS}
 * of `today` (or already has). `today` is `yyyy-mm-dd`.
 */
export const sealedDrinkSoon = (
  type: ItemType,
  fields: StyleFields,
  bottle: BottleDates & { readonly emptyAt?: string | null },
  today: string,
  table: readonly ShelfLifeEntry[] = SHELF_LIFE,
): SealedDrinkSoon | null => {
  if (bottle.openedAt !== null || (bottle.emptyAt ?? null) !== null) {
    return null;
  }
  const entry = sealedShelfLife(type, fields, bottle, table);
  const window = drinkWindow(bottle, entry);
  if (window === null || window.until === null) return null;
  const horizon = addMonths(today, DRINK_SOON_HORIZON_MONTHS);
  if (horizon === null || window.until > horizon) return null;
  const typical =
    window.fromSource === "typical" || window.untilSource === "typical";
  return {
    reason: "sealed",
    window: { ...window, until: window.until },
    entry: typical ? entry : null,
    urgency: window.until < today ? "past" : "soon",
  };
};
