/**
 * A bottle's freshness, as its page draws it (ux-c L02; the Freshness board):
 * the drinking window, where each end came from, and the "This bottle" rows.
 *
 * Deterministic (D29, plan L3): the window is the owner's own dates, else the
 * shelf-life table's typical one for the style, labelled "typical for …".
 * **A style with no row and no date of the owner's shows no window** — never
 * an estimate. The rules are `@cellar-assistant/contracts`' (`drinkWindow`,
 * `sealedShelfLife`), the same ones Drink soon runs on the server.
 *
 * Pure: no React, no clock (the caller passes `today`) — `freshness.test.ts`.
 */
import {
  addMonths,
  DRINK_SOON_HORIZON_MONTHS,
  type DrinkWindow,
  drinkWindow,
  lookupShelfLife,
  type ShelfLifeEntry,
  sealedShelfLife,
} from "@cellar-assistant/contracts";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/** The bottle's own fields, as `CellarItem` selects them. */
export type FreshnessBottle = {
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  readonly packagedOn: string | null;
  readonly acquiredOn: string | null;
  readonly drinkFrom: string | null;
  readonly drinkUntil: string | null;
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  readonly location: string | null;
};

/** The item's keys into the table. */
export type FreshnessItem = {
  readonly type: ApiItemType;
  /** WINE `style`, BEER `style`, SAKE `category`, SPIRIT `spiritType`, TEA `category`. */
  readonly style: string | null;
  readonly form: string | null;
  readonly vintageYear: number | null;
};

export type FreshnessStatus = {
  readonly label: string;
  /** `good` ready now; `soon` closing within the horizon; `wait` not yet; `past`. */
  readonly tone: "good" | "soon" | "wait" | "past";
};

export type FreshnessBar = {
  /** Percent along the axis: the window's start and width, and today. */
  readonly start: number;
  readonly width: number;
  readonly today: number;
  readonly axisFrom: string;
  readonly axisTo: string;
};

export type FreshnessRow = {
  readonly field:
    | "acquiredOn"
    | "packagedOn"
    | "drinkFrom"
    | "drinkUntil"
    | "price"
    | "location";
  readonly label: string;
  /** What it shows; `null` reads "Add". */
  readonly value: string | null;
  /** `typical`: shown muted, the table's and not the owner's. */
  readonly source: "user" | "typical" | null;
};

export type FreshnessModel = {
  readonly window: DrinkWindow | null;
  /** "2024 – 2036", "Until Feb 2027"; null with no window. */
  readonly heading: string | null;
  readonly status: FreshnessStatus | null;
  readonly bar: FreshnessBar | null;
  /** "From: your date. Until: typical for red wine, 10 years from vintage." */
  readonly sourceLine: string | null;
  readonly rows: readonly FreshnessRow[];
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const parts = (date: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** "12 Mar 2023". */
export const formatDay = (date: string): string => {
  const p = parts(date);
  return p === null ? date : `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}`;
};

/** "Mar 2023". */
export const formatMonth = (date: string): string => {
  const p = parts(date);
  return p === null ? date : `${MONTHS[p[1] - 1]} ${p[0]}`;
};

const year = (date: string): string => date.slice(0, 4);

/** "€58.00"; the amount alone if the code is one `Intl` does not know. */
export const formatPrice = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

/** How long, said the way a person says it: "10 years", "3 months", "3–5 days". */
const spanWords = (entry: ShelfLifeEntry, end: "from" | "until"): string => {
  if (entry.basis === "opened") {
    const days = end === "from" ? entry.fromDays : entry.untilDays;
    return `${days} ${days === 1 ? "day" : "days"} once open`;
  }
  const months = end === "from" ? entry.fromMonths : entry.untilMonths;
  const basis =
    entry.basis === "vintage"
      ? "from vintage"
      : entry.basis === "packaged"
        ? "from bottling"
        : "from purchase";
  if (months === 0) return `${basis.replace("from ", "at ")}`;
  const words =
    months % 12 === 0
      ? `${months / 12} ${months === 12 ? "year" : "years"}`
      : `${months} ${months === 1 ? "month" : "months"}`;
  return `${words} ${basis}`;
};

/** The sealed row the bottle's window counts from (packaged, vintage, purchase), or null. */
export const sealedEntryFor = (
  bottle: FreshnessBottle,
  item: FreshnessItem,
): ShelfLifeEntry | null =>
  sealedShelfLife(
    item.type,
    { style: item.style, form: item.form },
    { ...dates(bottle, item), openedAt: null },
  );

const dates = (bottle: FreshnessBottle, item: FreshnessItem) => ({
  packagedOn: bottle.packagedOn,
  acquiredOn: bottle.acquiredOn,
  openedAt: bottle.openAt,
  vintageYear: item.vintageYear,
  drinkFrom: bottle.drinkFrom,
  drinkUntil: bottle.drinkUntil,
});

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => {
  const p = parts(date);
  return p === null ? 0 : Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS;
};

export const freshnessModel = (
  bottle: FreshnessBottle,
  item: FreshnessItem,
  today: string,
): FreshnessModel => {
  // The sealed window: the owner's dates, else the table's for the style.
  const sealedEntry = sealedEntryFor(bottle, item);
  const sealed = drinkWindow(
    { ...dates(bottle, item), openedAt: null },
    sealedEntry,
  );
  // Open and not finished: the card is the open life instead — once a bottle
  // is open, the cellar window no longer says how long it keeps.
  const openEntry =
    bottle.openAt !== null && bottle.emptyAt === null
      ? lookupShelfLife(
          item.type,
          { style: item.style, form: item.form },
          "opened",
        )
      : null;
  const opened =
    openEntry === null
      ? null
      : drinkWindow(
          {
            ...dates(bottle, item),
            drinkFrom: null,
            drinkUntil: null,
          },
          openEntry,
        );
  const window =
    bottle.openAt !== null && bottle.emptyAt === null ? opened : sealed;
  const entry = window === opened ? openEntry : sealedEntry;

  const rows: FreshnessRow[] = [
    {
      field: "acquiredOn",
      label: "Bought",
      value: bottle.acquiredOn === null ? null : formatDay(bottle.acquiredOn),
      source: bottle.acquiredOn === null ? null : "user",
    },
    {
      field: "packagedOn",
      label: "Bottled",
      value: bottle.packagedOn === null ? null : formatDay(bottle.packagedOn),
      source: bottle.packagedOn === null ? null : "user",
    },
    windowRow(
      "drinkFrom",
      "Drink from",
      sealed?.from ?? null,
      sealed?.fromSource ?? null,
    ),
    windowRow(
      "drinkUntil",
      "Drink until",
      sealed?.until ?? null,
      sealed?.untilSource ?? null,
    ),
    {
      field: "price",
      label: "Price",
      value:
        bottle.priceAmount === null || bottle.priceCurrency === null
          ? null
          : formatPrice(bottle.priceAmount, bottle.priceCurrency),
      source: bottle.priceAmount === null ? null : "user",
    },
    {
      field: "location",
      label: "Where it lives",
      value: bottle.location,
      source: bottle.location === null ? null : "user",
    },
  ];

  if (window === null) {
    return {
      window,
      heading: null,
      status: null,
      bar: null,
      sourceLine: null,
      rows,
    };
  }

  if (entry?.basis === "opened") {
    const best = window.until ?? window.from ?? today;
    return {
      window,
      heading: `Best by ${formatDay(best)}`,
      status: openedStatusOf(window, today),
      bar: barOf(window, today, basisOf(bottle, item, entry)),
      sourceLine: `Typical for ${entry.label} once open: ${entry.fromDays}–${entry.untilDays} days.`,
      rows,
    };
  }

  return {
    window,
    heading: headingOf(window),
    status: statusOf(window, today),
    bar: barOf(
      window,
      today,
      entry === null ? null : basisOf(bottle, item, entry),
    ),
    sourceLine: sourceLineOf(window, entry),
    rows,
  };
};

function windowRow(
  field: "drinkFrom" | "drinkUntil",
  label: string,
  date: string | null,
  source: "user" | "typical" | null,
): FreshnessRow {
  return {
    field,
    label,
    value:
      date === null
        ? null
        : `${formatMonth(date)} · ${source === "user" ? "yours" : "typical"}`,
    source,
  };
}

function headingOf(window: DrinkWindow): string {
  const { from, until } = window;
  if (from !== null && until !== null) {
    const years = Number(year(until)) - Number(year(from));
    return years >= 2
      ? `${year(from)} – ${year(until)}`
      : `${formatMonth(from)} – ${formatMonth(until)}`;
  }
  if (from !== null) return `From ${formatMonth(from)}`;
  return `Until ${formatMonth(until ?? "")}`;
}

function statusOf(window: DrinkWindow, today: string): FreshnessStatus {
  if (window.until !== null && window.until < today) {
    return { label: "Past its window", tone: "past" };
  }
  if (window.from !== null && window.from > today) {
    return {
      label: `Not ready until ${formatMonth(window.from)}`,
      tone: "wait",
    };
  }
  const horizon = addMonths(today, DRINK_SOON_HORIZON_MONTHS);
  if (window.until !== null && horizon !== null && window.until <= horizon) {
    return { label: "Drink soon", tone: "soon" };
  }
  return { label: "Ready now", tone: "good" };
}

/** Open: fresh until the table's first day, then drink soon, then past. */
function openedStatusOf(window: DrinkWindow, today: string): FreshnessStatus {
  if (window.until !== null && window.until < today) {
    return { label: "Past its best", tone: "past" };
  }
  if (window.from !== null && window.from <= today) {
    return { label: "Drink soon", tone: "soon" };
  }
  return { label: "Fresh", tone: "good" };
}

function basisOf(
  bottle: FreshnessBottle,
  item: FreshnessItem,
  entry: ShelfLifeEntry,
): string | null {
  switch (entry.basis) {
    case "vintage":
      return item.vintageYear === null ? null : `${item.vintageYear}-01-01`;
    case "packaged":
      return bottle.packagedOn;
    case "acquired":
      return bottle.acquiredOn;
    case "opened":
      return bottle.openAt?.slice(0, 10) ?? null;
  }
}

function barOf(
  window: DrinkWindow,
  today: string,
  basis: string | null,
): FreshnessBar | null {
  const ends = [window.from, window.until, today, basis].filter(
    (d): d is string => d !== null,
  );
  const lo = Math.min(...ends.map(dayNumber));
  const hiRaw = Math.max(...ends.map(dayNumber));
  // A little room past the last date, so neither end sits on the edge.
  const hi = hiRaw + Math.max(1, Math.round((hiRaw - lo) * 0.08));
  const span = hi - lo;
  if (span <= 0) return null;
  const pct = (date: string) => ((dayNumber(date) - lo) / span) * 100;
  const start = window.from === null ? 0 : pct(window.from);
  const end = window.until === null ? 100 : pct(window.until);
  const axis = (n: number) => {
    const d = new Date(n * DAY_MS).toISOString().slice(0, 10);
    return span > 730 ? year(d) : formatMonth(d);
  };
  return {
    start,
    width: Math.max(0, end - start),
    today: pct(today),
    axisFrom: axis(lo),
    axisTo: axis(hi),
  };
}

function sourceLineOf(
  window: DrinkWindow,
  entry: ShelfLifeEntry | null,
): string {
  const part = (
    name: "From" | "Until",
    source: "user" | "typical" | null,
    end: "from" | "until",
  ): string | null => {
    if (source === null) return null;
    if (source === "user") return `${name}: your date.`;
    if (entry === null) return null;
    return `${name}: typical for ${entry.label}, ${spanWords(entry, end)}.`;
  };
  const line = [
    part("From", window.fromSource, "from"),
    part("Until", window.untilSource, "until"),
  ]
    .filter((p): p is string => p !== null)
    .join(" ");
  const typical =
    window.fromSource === "typical" || window.untilSource === "typical";
  return typical ? `${line} Set your own to override.` : line;
}

/** The edit sheet's fields, as typed: every one a string, empty for none. */
export type FreshnessDraft = {
  readonly packagedOn: string;
  readonly acquiredOn: string;
  readonly drinkFrom: string;
  readonly drinkUntil: string;
  readonly price: string;
  readonly currency: string;
  readonly location: string;
};

export const draftOf = (bottle: FreshnessBottle): FreshnessDraft => ({
  packagedOn: bottle.packagedOn ?? "",
  acquiredOn: bottle.acquiredOn ?? "",
  drinkFrom: bottle.drinkFrom ?? "",
  drinkUntil: bottle.drinkUntil ?? "",
  price: bottle.priceAmount === null ? "" : String(bottle.priceAmount),
  currency: bottle.priceCurrency ?? "",
  location: bottle.location ?? "",
});

export type FreshnessPatch = {
  packagedOn?: string | null;
  acquiredOn?: string | null;
  drinkFrom?: string | null;
  drinkUntil?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  location?: string | null;
};

/**
 * Only what changed, empty as null (a clear). The price pair travels
 * together, as the server takes it. The server re-checks all of it; this is
 * the friendly first word.
 */
export const freshnessPatch = (
  bottle: FreshnessBottle,
  draft: FreshnessDraft,
):
  | { readonly ok: true; readonly patch: FreshnessPatch }
  | { readonly ok: false; readonly error: string } => {
  const patch: FreshnessPatch = {};
  const date = (value: string): string | null =>
    value.trim() === "" ? null : value.trim();
  for (const field of [
    "packagedOn",
    "acquiredOn",
    "drinkFrom",
    "drinkUntil",
  ] as const) {
    const next = date(draft[field]);
    if (next !== null && parts(next) === null) {
      return { ok: false, error: "Use a full date." };
    }
    if (next !== bottle[field]) patch[field] = next;
  }
  const from = date(draft.drinkFrom);
  const until = date(draft.drinkUntil);
  if (from !== null && until !== null && from > until) {
    return { ok: false, error: "Drink from comes before drink until." };
  }

  const priceText = draft.price.trim();
  const amount = priceText === "" ? null : Number(priceText);
  const currency =
    amount === null ? null : draft.currency.trim().toUpperCase() || null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { ok: false, error: "Price is a number, 0 or more." };
  }
  if (amount !== null && (currency === null || !/^[A-Z]{3}$/.test(currency))) {
    return { ok: false, error: "Add a three-letter currency, like EUR." };
  }
  if (amount !== bottle.priceAmount || currency !== bottle.priceCurrency) {
    patch.priceAmount = amount;
    patch.priceCurrency = currency;
  }

  const location = draft.location.trim() === "" ? null : draft.location.trim();
  if (location !== null && location.length > 80) {
    return { ok: false, error: "Keep where it lives to 80 characters." };
  }
  if (location !== bottle.location) patch.location = location;
  return { ok: true, patch };
};
