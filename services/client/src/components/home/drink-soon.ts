/**
 * "Drink soon" on Home (X10) — **deterministic only** (decision D29).
 *
 * An opened bottle keeps for about as long as its style keeps once air gets
 * in: a red wine a few days, a sparkling one a day or two, a vermouth a
 * month, a bourbon a year or two. That table now lives in
 * `@cellar-assistant/contracts`' `SHELF_LIFE`, as basis `"opened"` (plan L18:
 * one table for sealed and opened bottles), and nothing else decides it — no
 * model estimate, not even as a fallback. Every window is labelled with the
 * style it came from ("typical for red wine once open"), so it reads as a
 * rule of thumb rather than a judgement about this bottle. **A style the
 * table does not name shows no window.**
 *
 * Sealed bottles whose window closes within the horizon join the list from
 * the server (`me.drinkSoon`, computed with the same contracts functions);
 * this module is the opened half, read from `me.openBottles`.
 *
 * Pure: no React, no clock (the caller passes `now`) — `drink-soon.test.ts`.
 */
import {
  lookupShelfLife,
  type OpenedShelfLife,
  openedDrinkSoon,
} from "@cellar-assistant/contracts/shelf-life";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/** How long a style typically keeps once opened, in days. */
export type OpenLife = {
  readonly minDays: number;
  readonly maxDays: number;
  /** The style, as the sentence names it: "red wine", "namazake". */
  readonly label: string;
};

const openLifeOf = (entry: OpenedShelfLife): OpenLife => ({
  minDays: entry.fromDays,
  maxDays: entry.untilDays,
  label: entry.label,
});

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
  const entry = lookupShelfLife(type, { style, form: form ?? null }, "opened");
  return entry === null ? null : openLifeOf(entry);
};

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
  const state = openedDrinkSoon(
    bottle.type,
    { style: bottle.style, form: bottle.form ?? null },
    bottle,
    now,
  );
  return state === null
    ? null
    : {
        urgency: state.urgency,
        openDays: state.openDays,
        life: openLifeOf(state.entry),
        ratio: state.ratio,
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

/** The badge on an Open rail tile: "Past its best", or "Open · 16%". */
export type RailBadge = { readonly past: boolean; readonly text: string };

/**
 * The Open rail (Shell-Home ruling 1): every open bottle, the furthest past
 * its window first, then the rest in the order they came (newest opened);
 * a bottle past its style's span wears "Past its best", any other its level.
 */
export const openRail = <
  T extends StyleFields & {
    readonly openAt: string | null;
    readonly emptyAt?: string | null;
    readonly percentageRemaining: number;
  },
>(
  bottles: readonly T[],
  now: number,
): { bottle: T; badge: RailBadge }[] =>
  bottles
    .map((bottle, index) => {
      const state = drinkSoonState(bottle, now);
      const past = state?.urgency === "past";
      return {
        bottle,
        index,
        ratio: past ? (state?.ratio ?? 0) : -1,
        badge: past
          ? { past: true, text: "Past its best" }
          : {
              past: false,
              text: `Open · ${Math.round(bottle.percentageRemaining)}%`,
            },
      };
    })
    .sort((a, b) => b.ratio - a.ratio || a.index - b.index)
    .map(({ bottle, badge }) => ({ bottle, badge }));
