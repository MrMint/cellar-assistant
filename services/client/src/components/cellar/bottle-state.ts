/**
 * A bottle's state line on a BottleCard (N13b): "Sealed", "Open · 8d",
 * "Finished" — plus the level its bar draws. Pure, so the card can render on
 * the server and the rules are tested without a DOM.
 *
 * The age is measured against a `now` the caller passes in, never read here:
 * the server's render and the browser's hydration pass must print the same
 * text, so the grid seeds `now` from the request and only moves it forward
 * after mount (`useNow`). `now === null` prints the state without an age.
 */

export type BottleFields = {
  openAt?: string | null;
  emptyAt?: string | null;
  /** 0–100; the API's default for a new bottle is 100. */
  percentageRemaining?: number | null;
};

export type BottleKind = "sealed" | "open" | "finished";

export type BottleState = {
  kind: BottleKind;
  /** What the card prints: "Open · 8d". */
  label: string;
  /** What a screen reader hears: "Open 8 days, 40% left". */
  spoken: string;
  /** 0–100, what the level bar fills to. */
  level: number;
};

const DAY_MS = 86_400_000;

/**
 * A short age and its spoken form. Under a day is "today"; then days up to
 * two weeks, weeks up to eight, months (of 30 days) up to a year, then years.
 * A future or unparseable instant has no age.
 */
export const bottleAge = (
  iso: string,
  now: number,
): { short: string; long: string } | null => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const days = Math.floor((now - at) / DAY_MS);
  if (days < 0) return null;
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days === 0) return { short: "today", long: "today" };
  if (days < 14) return { short: `${days}d`, long: plural(days, "day") };
  if (days < 56) {
    const weeks = Math.floor(days / 7);
    return { short: `${weeks}w`, long: plural(weeks, "week") };
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return { short: `${months}mo`, long: plural(months, "month") };
  }
  const years = Math.floor(days / 365);
  return { short: `${years}y`, long: plural(years, "year") };
};

const clampLevel = (value: number | null | undefined, fallback: number) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.min(100, Math.max(0, value));

/**
 * Finished wins (an emptied bottle is finished whatever its level says);
 * then open — by `openAt`, or by a level already below full, which the API
 * allows without an `openAt` — then sealed.
 */
export const bottleState = (
  bottle: BottleFields,
  now: number | null,
): BottleState => {
  if (bottle.emptyAt !== null && bottle.emptyAt !== undefined) {
    return {
      kind: "finished",
      label: "Finished",
      spoken: "Finished",
      level: 0,
    };
  }
  const level = clampLevel(bottle.percentageRemaining, 100);
  const opened =
    (bottle.openAt !== null && bottle.openAt !== undefined) || level < 100;
  if (!opened) {
    return { kind: "sealed", label: "Sealed", spoken: "Sealed", level: 100 };
  }
  const age =
    now === null || bottle.openAt === null || bottle.openAt === undefined
      ? null
      : bottleAge(bottle.openAt, now);
  const left = `${Math.round(level)}% left`;
  if (age === null) {
    return { kind: "open", label: "Open", spoken: `Open, ${left}`, level };
  }
  return {
    kind: "open",
    label: `Open · ${age.short}`,
    spoken:
      age.long === "today"
        ? `Opened today, ${left}`
        : `Open ${age.long}, ${left}`,
    level,
  };
};
