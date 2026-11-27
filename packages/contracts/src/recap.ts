/**
 * L04 — the recap deck and breadth stamps, read from the viewer's own drink log.
 *
 * `RecapActor` reads check-ins through its own query into its own row type
 * ({@link RecapLogRow}), never `ItemCheckInDto` (L32, L45): that type belongs
 * to the drink-log readers, and a change to it must not reach the recap.
 *
 * ## What a card and a stamp may count
 *
 * Only **distinct things**: styles, regions, item types, recipes made, items
 * new to you. There is no card or stamp for how many drinks were logged, how
 * often, or how much — a recap is a record of breadth, never consumption
 * pressure ({@link BREADTH_STAMP_KINDS} is the whole list, and a test pins it).
 *
 * Item breadth counts item logs only; a recipe log counts only toward
 * "recipes made" (L04).
 *
 * Imports types only, so the client can take it through the
 * `@cellar-assistant/contracts/recap` subpath without the barrel.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemType } from "./items.ts";

/* -------------------------------------------------------------------------- */
/* Period                                                                      */
/* -------------------------------------------------------------------------- */

/** `2026-10` (a month) or `2026` (a year). */
export type RecapPeriod =
  | { readonly kind: "month"; readonly year: number; readonly month: number }
  | { readonly kind: "year"; readonly year: number };

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_PATTERN = /^(\d{4})$/;
export const EARLIEST_RECAP_YEAR = 1900;

/** The period `value` names, or `null` for anything else (never a throw). */
export const parseRecapPeriod = (value: unknown): RecapPeriod | null => {
  if (typeof value !== "string") return null;
  const month = MONTH_PATTERN.exec(value);
  if (month) {
    const year = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    if (year < EARLIEST_RECAP_YEAR) return null;
    return { kind: "month", year, month: m };
  }
  const year = YEAR_PATTERN.exec(value);
  if (year) {
    const y = Number(year[1]);
    if (y < EARLIEST_RECAP_YEAR) return null;
    return { kind: "year", year: y };
  }
  return null;
};

export const formatRecapPeriod = (period: RecapPeriod): string =>
  period.kind === "year"
    ? String(period.year)
    : `${period.year}-${String(period.month).padStart(2, "0")}`;

/**
 * The period's bounds as local wall-clock timestamps (`YYYY-MM-DDT00:00:00`),
 * start inclusive and end exclusive; the SQL reads them in the viewer's zone.
 */
export const recapPeriodBounds = (
  period: RecapPeriod,
): { readonly start: string; readonly end: string } => {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (period.kind === "year") {
    return {
      start: `${period.year}-01-01T00:00:00`,
      end: `${period.year + 1}-01-01T00:00:00`,
    };
  }
  const nextYear = period.month === 12 ? period.year + 1 : period.year;
  const nextMonth = period.month === 12 ? 1 : period.month + 1;
  return {
    start: `${period.year}-${pad(period.month)}-01T00:00:00`,
    end: `${nextYear}-${pad(nextMonth)}-01T00:00:00`,
  };
};

/** An IANA zone the runtime knows, or `null`. `UTC` when none is given. */
export const normaliseRecapTimeZone = (
  value: string | null | undefined,
): string | null => {
  if (value === null || value === undefined || value === "") return "UTC";
  if (value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Rows (the actor's own read, L32)                                            */
/* -------------------------------------------------------------------------- */

/**
 * One drink-log entry as the recap reads it: either an item log (`itemType`
 * set) or a recipe log (`recipeId` set), or a log whose target was deleted
 * (neither — counted by nothing).
 */
export type RecapLogRow = {
  readonly itemType: ItemType | null;
  readonly itemId: string | null;
  readonly recipeId: string | null;
  /** The item's or recipe's name, for chips. */
  readonly name: string | null;
  /** The style-like attribute for its type (see `recap-sql.ts`), raw value. */
  readonly style: string | null;
  /** Region if the type has one, else country. */
  readonly region: string | null;
  readonly score: number | null;
  /** Within the requested period (otherwise it is history before it). */
  readonly inPeriod: boolean;
};

/* -------------------------------------------------------------------------- */
/* Stamps                                                                      */
/* -------------------------------------------------------------------------- */

/** The whole list. Counts of distinct things only — no volume, no frequency. */
export const BREADTH_STAMP_KINDS = [
  "STYLES",
  "REGIONS",
  "TYPES",
  "RECIPES",
] as const;
export type BreadthStampKind = (typeof BREADTH_STAMP_KINDS)[number];

/** The tiers a stamp is earned at, per kind (distinct count reached). */
export const BREADTH_STAMP_TIERS: Readonly<
  Record<BreadthStampKind, readonly number[]>
> = {
  STYLES: [5, 10, 25, 50, 100],
  REGIONS: [5, 10, 25, 50],
  TYPES: [3, 6],
  RECIPES: [3, 10, 25, 50],
};

export type BreadthStampDto = {
  readonly kind: BreadthStampKind;
  /** How many distinct things of this kind. */
  readonly count: number;
  /** The highest tier `count` has reached. */
  readonly tier: number;
};

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

export const RECAP_CARD_KINDS = [
  "NEW_TO_YOU",
  "TYPES",
  "STYLES",
  "REGIONS",
  "RECIPES",
  "TOP_RATED",
  "STAMP",
] as const;
export type RecapCardKind = (typeof RECAP_CARD_KINDS)[number];

/**
 * The least data a card needs; below it the card is skipped, never padded.
 * `STAMP` cards need a stamp earned in the period, so have no number here.
 */
export const RECAP_CARD_THRESHOLDS: Readonly<
  Record<Exclude<RecapCardKind, "STAMP">, number>
> = {
  /** Distinct items first logged in the period. */
  NEW_TO_YOU: 3,
  /** Distinct item types logged in the period. */
  TYPES: 2,
  /** Distinct styles logged in the period. */
  STYLES: 3,
  /** Distinct regions logged in the period. */
  REGIONS: 3,
  /** Distinct recipes made in the period. */
  RECIPES: 2,
  /** Distinct items scored in the period. */
  TOP_RATED: 3,
};

/** Chips on a card: a sample of the distinct things counted. */
export const RECAP_CARD_CHIP_LIMIT = 4;

export type RecapCardDto = {
  readonly kind: RecapCardKind;
  /** The distinct count the card is about. */
  readonly count: number;
  /** Of `count`, how many were new this period (`STYLES`/`REGIONS`/`TYPES`). */
  readonly newCount: number | null;
  /** Up to {@link RECAP_CARD_CHIP_LIMIT} of the things counted. */
  readonly chips: readonly string[];
  /** The item types the chips/count cover, for `TYPES`. */
  readonly itemTypes: readonly ItemType[];
  /** For a `STAMP` card: the stamp earned in this period. */
  readonly stamp: BreadthStampDto | null;
};

/**
 * MC-recap / L4: how much the viewer did in the period. These are the only
 * counts of volume in the recap, and they stay off the cards and stamps: they
 * head the deck as a plain record, never a goal.
 */
export type RecapTotalsDto = {
  /** The viewer's own `check_ins` rows dated in the period (as the deck reads them). */
  readonly checkIns: number;
  /** The viewer's `item_reviews` (stars on an item) created or changed in the period. */
  readonly ratings: number;
  /** `cellar_items` the viewer created in the period, in any cellar; never a co-owner's. */
  readonly bottlesAdded: number;
};

export type RecapDto = {
  /** `2026-10` or `2026`. */
  readonly period: string;
  readonly timeZone: string;
  readonly totals: RecapTotalsDto;
  readonly cards: readonly RecapCardDto[];
  /** Stamps held at the end of the period (all history up to it). */
  readonly stamps: readonly BreadthStampDto[];
};

export type RecapInput = {
  readonly period: string;
  readonly timeZone?: string | null;
};

/** MC-recap: the granularity `recapPeriods` lists, matching `recap(period)`. */
export const RECAP_PERIOD_KINDS = ["MONTH", "YEAR"] as const;
export type RecapPeriodKind = (typeof RECAP_PERIOD_KINDS)[number];

export const isRecapPeriodKind = (value: unknown): value is RecapPeriodKind =>
  typeof value === "string" &&
  (RECAP_PERIOD_KINDS as readonly string[]).includes(value);

export type RecapPeriodsInput = {
  readonly kind: RecapPeriodKind;
  readonly timeZone?: string | null;
};

/**
 * The most periods `periods` answers: a century of months. A bound, so the
 * list is never an unbounded read; nobody has that much history.
 */
export const RECAP_PERIODS_LIMIT = 1200;

/* -------------------------------------------------------------------------- */
/* Actor                                                                       */
/* -------------------------------------------------------------------------- */

export type RecapActorInterface = {
  /** The viewer's recap deck for one month or year. */
  recap(ctx: Ctx, input: RecapInput): Promise<RecapDto>;
  /** The viewer's breadth stamps over their whole drink log. */
  stamps(ctx: Ctx): Promise<readonly BreadthStampDto[]>;
  /**
   * MC-recap: the periods (`YYYY-MM` or `YYYY`, as `recap` takes them) that
   * hold any of the activity `RecapTotalsDto` counts, newest first.
   */
  periods(ctx: Ctx, input: RecapPeriodsInput): Promise<readonly string[]>;
};

export const RecapActorDescriptor: ActorDescriptor<RecapActorInterface> = {
  actorType: "RecapActor",
  category: "view",
  methods: {
    recap: {},
    stamps: {},
    periods: {},
  },
};

/** Like every view actor, keyed by the viewer. */
export const recapActorId = (viewerId: string): string => viewerId;
