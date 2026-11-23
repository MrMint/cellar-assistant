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
import type {
  BreadthStampKind,
  RecapCardKind,
  RecapPeriod,
} from "@cellar-assistant/contracts/recap";
import { stampLabel, stampNoun } from "@/lib/stamps/stamps";

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
          stamp?.kind === "RECIPES" ? `${stamp.tier} recipes\nmade` : title,
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
  count: String(stamp.tier),
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
