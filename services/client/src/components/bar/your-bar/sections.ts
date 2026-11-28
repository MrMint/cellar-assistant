/**
 * Your bar's two sections, from the API's answer (Recipes-Make board).
 *
 * CROSS-LOT: a swap never counts as Make now. The API still files a recipe
 * whose only gaps are swaps under `makeNow` (`recipeMakeability` counts a
 * substitute as had), so the screen moves those rows to One bottle away,
 * where they keep their Make button and say "Swap: …".
 *
 * Counts are the API's, corrected by the swaps it filed under Make now. When
 * Make now came back whole (every row fetched), that correction is exact;
 * when it was cut at the fetch limit, the swaps past the limit cannot be
 * seen, so both counts carry a "+" rather than pretend to be totals.
 */
import type { MakeabilityLike } from "../copy";

export type BarCount = {
  /** What can be vouched for. */
  readonly value: number;
  /** True when there may be more than `value` (a fetch limit cut the rows). */
  readonly more: boolean;
};

export type BarSections<Row> = {
  readonly ready: readonly Row[];
  readonly away: readonly Row[];
  readonly readyCount: BarCount;
  readonly awayCount: BarCount;
};

type Sectionable = { readonly makeability: MakeabilityLike };

/** Whether a row is a swap: makeable only by standing something in. */
export const isSwap = (makeability: MakeabilityLike): boolean =>
  makeability.status === "MAKE_NOW" && makeability.substituteCount > 0;

/** Whether the row gets a Make button: ready, or ready with a swap. */
export const canMake = (makeability: MakeabilityLike): boolean =>
  makeability.status === "MAKE_NOW";

export const splitBar = <Row extends Sectionable>(input: {
  makeNow: readonly Row[];
  oneBottleAway: readonly Row[];
  makeNowCount: number;
  oneBottleAwayCount: number;
}): BarSections<Row> => {
  const ready = input.makeNow.filter((row) => !isSwap(row.makeability));
  const swaps = input.makeNow.filter((row) => isSwap(row.makeability));
  const whole = input.makeNow.length >= input.makeNowCount;
  return {
    ready,
    // Swaps first: they are the ones you can still make tonight.
    away: [...swaps, ...input.oneBottleAway],
    readyCount: whole
      ? { value: input.makeNowCount - swaps.length, more: false }
      : { value: ready.length, more: true },
    awayCount: {
      value: input.oneBottleAwayCount + swaps.length,
      more: !whole,
    },
  };
};

/** "5", or "100+" when a limit cut the rows (never a limit as a total). */
export const countText = (count: BarCount): string =>
  `${count.value}${count.more ? "+" : ""}`;

/** The title's line: "1 ready · 5 one away". */
export const readinessLine = (ready: BarCount, away: BarCount): string =>
  `${countText(ready)} ready · ${countText(away)} one away`;
