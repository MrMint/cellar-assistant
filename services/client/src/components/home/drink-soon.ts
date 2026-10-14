/**
 * "Drink soon" on Home (X10) — **deterministic only** (decision D29).
 *
 * An opened bottle keeps for about as long as its style keeps once air gets
 * in: a red wine a few days, a sparkling one a day or two, a vermouth a
 * month, a bourbon a year or two. This is that table, and nothing else
 * decides it — no model estimate, not even as a fallback (D29: "a model
 * window is the same quietly plausible number as a valuation"). Every window
 * is labelled with the style it came from ("typical for red wine once
 * open"), so it reads as a rule of thumb rather than a judgement about this
 * bottle. **A style the table does not name shows no window.**
 *
 * What it reads is what the API already has: the bottle's `openAt` and the
 * item's style field (`Wine.style`, `Sake.category`, `Spirit.spiritType`,
 * `Tea.category` / `form`). The fuller version — per-bottle packaged and
 * acquired dates, the user's own drink-from/until overriding the table — is
 * roadmap L02.
 *
 * Pure: no React, no clock (the caller passes `now`) — `drink-soon.test.ts`.
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/** How long a style typically keeps once opened, in days. */
export type OpenLife = {
  readonly minDays: number;
  readonly maxDays: number;
  /** The style, as the sentence names it: "red wine", "namazake". */
  readonly label: string;
};

const life = (minDays: number, maxDays: number, label: string): OpenLife => ({
  minDays,
  maxDays,
  label,
});

/** `Wine.style` (the `wine_style` reference table). */
const WINE: Readonly<Record<string, OpenLife>> = {
  SPARKLING: life(1, 3, "sparkling wine"),
  RED: life(3, 5, "red wine"),
  WHITE: life(3, 5, "white wine"),
  ROSE: life(3, 5, "rosé"),
  DESSERT: life(7, 28, "dessert wine"),
};

/** `Sake.category` (the `sake_category` reference table). */
const SAKE: Readonly<Record<string, OpenLife>> = {
  namazake: life(3, 7, "namazake"),
  nigorizake: life(3, 7, "nigori"),
  ginjo: life(5, 10, "ginjo"),
  daiginjo: life(5, 10, "daiginjo"),
  junmai_ginjo: life(5, 10, "junmai ginjo"),
  junmai_daiginjo: life(5, 10, "junmai daiginjo"),
  junmai: life(7, 21, "junmai"),
  honjozo: life(7, 21, "honjozo"),
  tokubetsu_junmai: life(7, 21, "tokubetsu junmai"),
  tokubetsu_honjozo: life(7, 21, "tokubetsu honjozo"),
  futsushu: life(7, 21, "futsushu"),
  genshu: life(7, 21, "genshu"),
  taruzake: life(7, 21, "taruzake"),
  koshu: life(30, 90, "koshu"),
};

/** `Spirit.spiritType` (the `spirit_type` reference table). */
const SPIRIT: Readonly<Record<string, OpenLife>> = {
  AMARO_APERITIF_VERMOUTH: life(30, 60, "vermouth and aperitifs"),
  LIQUEURS: life(180, 365, "liqueur"),
  VODKA: life(365, 730, "vodka"),
  BOURBON: life(365, 730, "bourbon"),
  TEQUILA: life(365, 730, "tequila"),
  RUM: life(365, 730, "rum"),
  GIN: life(365, 730, "gin"),
  SCOTCH: life(365, 730, "Scotch"),
  WHISKEY: life(365, 730, "whiskey"),
  BRANDY_COGNAC: life(365, 730, "brandy"),
  MEZCAL: life(365, 730, "mezcal"),
  SOJU: life(180, 365, "soju"),
  BAIJIU: life(365, 730, "baijiu"),
};

/** `Tea.category` (the `tea_category` reference table). */
const TEA: Readonly<Record<string, OpenLife>> = {
  green: life(60, 180, "green tea"),
  white: life(60, 180, "white tea"),
  yellow: life(60, 180, "yellow tea"),
  oolong: life(180, 365, "oolong"),
  black: life(180, 365, "black tea"),
  dark: life(365, 730, "dark tea"),
  pu_erh: life(365, 730, "pu-erh"),
  herbal: life(180, 365, "herbal tea"),
  rooibos: life(180, 365, "rooibos"),
  mate: life(180, 365, "mate"),
  chai: life(180, 365, "chai"),
  blend: life(180, 365, "blended tea"),
};

/** Matcha goes stale fastest of any tea, whatever its category says. */
const MATCHA = life(30, 60, "matcha");

/**
 * Two types whose open life does not depend on their style: any beer is
 * best the day it is opened (a growler or a crowler, a day or two), and
 * roasted beans fade over a few weeks once the bag is open.
 */
const BEER = life(1, 2, "beer");
const COFFEE = life(14, 30, "coffee beans");

/** The item's style fields, as the Home query selects them. */
export type StyleFields = {
  readonly type: ApiItemType;
  /** WINE `style`, SAKE `category`, SPIRIT `spiritType`, TEA `category`. */
  readonly style: string | null;
  /** TEA `form`: `matcha_powder` overrides the category. */
  readonly form?: string | null;
};

/** The table's row for this item, or `null` — and then no window is shown. */
export const openLifeFor = ({
  type,
  style,
  form,
}: StyleFields): OpenLife | null => {
  switch (type) {
    case "BEER":
      return BEER;
    case "COFFEE":
      return COFFEE;
    case "WINE":
      return style === null ? null : (WINE[style] ?? null);
    case "SAKE":
      return style === null ? null : (SAKE[style] ?? null);
    case "SPIRIT":
      return style === null ? null : (SPIRIT[style] ?? null);
    case "TEA":
      if (form === "matcha_powder") return MATCHA;
      return style === null ? null : (TEA[style] ?? null);
  }
};

const DAY_MS = 86_400_000;

/** "3–5 days", "2–4 weeks", "1–2 months", "6–12 months", "1–2 years". */
export const formatSpan = ({ minDays, maxDays }: OpenLife): string => {
  const range = (min: number, max: number, unit: string) =>
    min === max
      ? `${max} ${unit}${max === 1 ? "" : "s"}`
      : `${min}–${max} ${unit}s`;
  if (maxDays < 14) return range(minDays, maxDays, "day");
  if (maxDays < 60) {
    return range(
      Math.max(1, Math.round(minDays / 7)),
      Math.round(maxDays / 7),
      "week",
    );
  }
  if (maxDays <= 365) {
    return range(
      Math.max(1, Math.round(minDays / 30)),
      Math.min(12, Math.round(maxDays / 30)),
      "month",
    );
  }
  return range(
    Math.max(1, Math.round(minDays / 365)),
    Math.round(maxDays / 365),
    "year",
  );
};

/** "Typical for red wine once open: 3–5 days." */
export const typicalLine = (open: OpenLife): string =>
  `Typical for ${open.label} once open: ${formatSpan(open)}`;

export type DrinkSoonState = {
  /** `past` once beyond the typical span; `now` while inside it. */
  readonly urgency: "past" | "now";
  /** Whole days since it was opened. */
  readonly openDays: number;
  readonly life: OpenLife;
  /** How far through its window it is: openDays / maxDays (≥ 1 when past). */
  readonly ratio: number;
};

/**
 * Whether an open bottle belongs under "Drink soon", and how urgently: once
 * it has been open for the style's shortest typical span. A sealed or
 * finished bottle, an unparseable or future `openAt`, and a style the table
 * does not know all answer `null`.
 */
export const drinkSoonState = (
  bottle: StyleFields & {
    readonly openAt: string | null;
    readonly emptyAt?: string | null;
  },
  now: number,
): DrinkSoonState | null => {
  if (bottle.openAt === null || (bottle.emptyAt ?? null) !== null) return null;
  const opened = Date.parse(bottle.openAt);
  if (Number.isNaN(opened) || opened > now) return null;
  const open = openLifeFor(bottle);
  if (open === null) return null;
  const openDays = Math.floor((now - opened) / DAY_MS);
  if (openDays < open.minDays) return null;
  return {
    urgency: openDays > open.maxDays ? "past" : "now",
    openDays,
    life: open,
    ratio: openDays / open.maxDays,
  };
};

/** The bottles under "Drink soon", most overdue first. */
export const drinkSoonList = <
  T extends StyleFields & {
    readonly openAt: string | null;
    readonly emptyAt?: string | null;
  },
>(
  bottles: readonly T[],
  now: number,
): { bottle: T; state: DrinkSoonState }[] =>
  bottles
    .flatMap((bottle) => {
      const state = drinkSoonState(bottle, now);
      return state === null ? [] : [{ bottle, state }];
    })
    .sort((a, b) => b.state.ratio - a.state.ratio);
