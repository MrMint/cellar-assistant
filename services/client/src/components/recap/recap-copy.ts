/**
 * L04 — what each recap card says, and the period it covers, as pure
 * functions: the deck (`RecapDeck`) and the share image (`RecapShareCard`)
 * read the same words. Layout follows the approved Recap board (L43): an
 * overline, one big numeral, a two-line serif title, chips, and on a stamp
 * card the round stamp itself.
 *
 * Every number on a card is a count of distinct things; there is no copy here
 * for "drinks logged" because no card carries one.
 */
import {
  type BreadthStampKind,
  parseRecapPeriod,
  type RecapCardKind,
  type RecapPeriod,
} from "@cellar-assistant/contracts/recap";
import { stampLabel, stampNoun, stampTierText } from "@/lib/stamps/stamps";

export type RecapCardView = {
  readonly kind: RecapCardKind;
  readonly count: number;
  readonly newCount: number | null;
  readonly chips: readonly string[];
  readonly stamp: {
    readonly kind: BreadthStampKind;
    readonly count: number;
    readonly tier: number;
  } | null;
};

/** Background washes from the board: plain, claret, raised. */
export type RecapTone = "plain" | "claret" | "raised";

export type RecapCardCopy = {
  readonly overline: string;
  /** The big numeral; empty on a stamp card (the stamp carries it). */
  readonly big: string;
  /** Two lines, `\n` between them. */
  readonly title: string;
  readonly chips: readonly string[];
  readonly tone: RecapTone;
  /** Overline colour: brass, or claret ink on the claret wash. */
  readonly accent: "brass" | "claret";
};

const ofThemNew = (noun: string, newCount: number | null): string =>
  newCount !== null && newCount > 0
    ? `${noun},\n${newCount} of them new`
    : `${noun}\nin your glass`;

export const recapCardCopy = (card: RecapCardView): RecapCardCopy => {
  const big = String(card.count);
  switch (card.kind) {
    case "NEW_TO_YOU":
      return {
        overline: "New to you",
        big,
        title: "things you had\nnever tried before",
        chips: card.chips,
        tone: "plain",
        accent: "brass",
      };
    case "TYPES":
      return {
        overline: "Range",
        big,
        title: ofThemNew("kinds of drink", card.newCount),
        chips: card.chips,
        tone: "raised",
        accent: "brass",
      };
    case "STYLES":
      return {
        overline: "Breadth",
        big,
        title: ofThemNew("styles", card.newCount),
        chips: card.chips,
        tone: "claret",
        accent: "claret",
      };
    case "REGIONS":
      return {
        overline: "Breadth",
        big,
        title: ofThemNew("regions", card.newCount),
        chips: card.chips,
        tone: "claret",
        accent: "claret",
      };
    case "RECIPES":
      return {
        overline: "Behind the bar",
        big,
        title: "recipes\nyou made",
        chips: card.chips,
        tone: "raised",
        accent: "brass",
      };
    case "TOP_RATED":
      return {
        overline: "Top rated",
        big,
        title: "things you rated,\nbest first",
        chips: card.chips,
        tone: "plain",
        accent: "brass",
      };
    case "STAMP": {
      const stamp = card.stamp;
      const title =
        stamp === null
          ? "Stamp\nearned"
          : `${capitalise(stampLabel(stamp))}\ntried`;
      return {
        overline: "Stamp earned",
        big: "",
        title:
          stamp?.kind === "RECIPES"
            ? `${stampTierText(stamp.tier)} recipes\nmade`
            : title,
        chips: [],
        tone: "raised",
        accent: "brass",
      };
    }
  }
};

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** The two lines inside the round stamp: the count, then the noun. */
export const stampFace = (stamp: {
  readonly kind: BreadthStampKind;
  readonly tier: number;
}): { readonly count: string; readonly noun: string } => ({
  count: stampTierText(stamp.tier),
  noun: stampNoun(stamp.kind, stamp.tier),
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Your October", "Your October 2025" (another year), "Your 2026". */
export const recapPeriodLabel = (
  period: RecapPeriod,
  now: Date = new Date(),
): string => {
  if (period.kind === "year") return `Your ${period.year}`;
  const month = MONTHS[period.month - 1] ?? "";
  return period.year === now.getFullYear()
    ? `Your ${month}`
    : `Your ${month} ${period.year}`;
};

/** This month, in the viewer's own clock: `2026-11`. */
export const currentRecapPeriod = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

/** The viewer's IANA zone, or UTC if the runtime will not say. */
export const viewerTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** A period in `recap(period)`'s format: `2026-05` or `2026`. */
export const recapPeriodKey = (period: RecapPeriod): string =>
  period.kind === "year"
    ? String(period.year)
    : `${period.year}-${String(period.month).padStart(2, "0")}`;

/** The header and sheet name: "May 2026", "2026". */
export const recapPeriodName = (period: RecapPeriod): string =>
  period.kind === "year"
    ? String(period.year)
    : `${MONTHS[period.month - 1] ?? ""} ${period.year}`;

/** In a sentence: "November" ("Nothing to recap for November yet"), "2026". */
export const recapPeriodShort = (period: RecapPeriod): string =>
  period.kind === "year"
    ? String(period.year)
    : (MONTHS[period.month - 1] ?? "");

/** The share image's foot: "Dec 2023", "2024". */
export const recapPeriodFoot = (period: RecapPeriod): string =>
  period.kind === "year"
    ? String(period.year)
    : `${(MONTHS[period.month - 1] ?? "").slice(0, 3)} ${period.year}`;

export type RecapPeriodOption = {
  readonly key: string;
  readonly label: string;
  /** "This month", "So far", "Whole year", or "". */
  readonly sub: string;
};

/**
 * The Recaps sheet (MC-recap): this month first (even when it is empty), then
 * each year newest first, the year itself ("So far" for this one, "Whole
 * year" for the rest) followed by its months, newest first. Only periods the
 * server lists appear, apart from this month and this year.
 */
export const recapPeriodList = (
  periods: {
    readonly months: readonly string[];
    readonly years: readonly string[];
  },
  now: Date = new Date(),
): RecapPeriodOption[] => {
  const thisMonth = currentRecapPeriod(now);
  const thisYear = String(now.getFullYear());
  const years = new Set([thisYear, ...periods.years]);
  for (const month of periods.months) years.add(month.slice(0, 4));
  const options: RecapPeriodOption[] = [
    { key: thisMonth, label: labelOf(thisMonth), sub: "This month" },
  ];
  for (const year of Array.from(years).sort().reverse()) {
    if (!/^\d{4}$/.test(year)) continue;
    if (year === thisYear || periods.years.includes(year)) {
      options.push({
        key: year,
        label: year,
        sub: year === thisYear ? "So far" : "Whole year",
      });
    }
    for (const month of Array.from(new Set(periods.months)).sort().reverse()) {
      if (month.slice(0, 4) !== year || month === thisMonth) continue;
      if (parseRecapPeriod(month) === null) continue;
      options.push({ key: month, label: labelOf(month), sub: "" });
    }
  }
  return options;
};

const labelOf = (key: string): string => {
  const period = parseRecapPeriod(key);
  return period === null ? key : recapPeriodName(period);
};

export type RecapTotals = {
  readonly checkIns: number;
  readonly ratings: number;
  readonly bottlesAdded: number;
};

const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** "12 check-ins · 8 ratings · 3 bottles added"; zeros left out. */
export const recapTotalsLine = (totals: RecapTotals): string =>
  [
    totals.checkIns > 0
      ? counted(totals.checkIns, "check-in", "check-ins")
      : "",
    totals.ratings > 0 ? counted(totals.ratings, "rating", "ratings") : "",
    totals.bottlesAdded > 0
      ? `${counted(totals.bottlesAdded, "bottle", "bottles")} added`
      : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");

const STAT_LABEL: Partial<Record<RecapCardKind, string>> = {
  NEW_TO_YOU: "new to you",
  TYPES: "kinds",
  STYLES: "styles",
  REGIONS: "regions",
};

/** The end card's tiles: one per counted card, in the deck's order. */
export const recapEndStats = (
  cards: readonly RecapCardView[],
): { readonly value: number; readonly label: string }[] =>
  cards.flatMap((card) => {
    const label = STAT_LABEL[card.kind];
    return label === undefined ? [] : [{ value: card.count, label }];
  });

/** "+7 more" when a card counts more than its chips show, else "". */
export const recapMoreText = (card: RecapCardView): string =>
  card.count > card.chips.length && card.kind !== "TOP_RATED"
    ? `+${card.count - card.chips.length} more`
    : "";
