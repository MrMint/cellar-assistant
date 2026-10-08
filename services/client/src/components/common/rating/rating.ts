/**
 * The value semantics of the star rating (N30), with no markup in it, so the
 * control can be re-skinned (shadcn, D20) without touching any of this.
 *
 * A rating is a number from 0.5 to 5 in half steps — exactly what
 * `item_reviews.score` accepts (NOT NULL, 0.5–5) and what
 * `recipe_reviews.score` accepts when it is set. "No rating yet" is `null`,
 * never 0: 0 is not a score either table stores.
 */

export const RATING_MAX = 5;
export const RATING_STEP = 0.5;
export const RATING_MIN = RATING_STEP;

/** The five stars, 1-based: star `n` covers the values `n - 0.5` and `n`. */
export const RATING_STARS: readonly number[] = [1, 2, 3, 4, 5];

/** Every selectable value, in order: 0.5, 1, 1.5 … 5. */
export const RATING_VALUES: readonly number[] = Array.from(
  { length: RATING_MAX / RATING_STEP },
  (_, i) => (i + 1) * RATING_STEP,
);

/**
 * One word per half step, carried over from the old widget's `tooltipArray`
 * so a rating reads the same as it did. Index = `value * 2 - 1`.
 */
export const RATING_LABELS = [
  "Terrible",
  "Bad",
  "Bad+",
  "Mediocre",
  "Mediocre+",
  "Good",
  "Good+",
  "Very Good",
  "Very Good+",
  "Outstanding",
] as const;

/**
 * Snap anything to a valid rating: the nearest half step, clamped to
 * 0.5–5. `null`, `undefined`, NaN and anything at or below 0 mean "not rated"
 * and come back as `null`.
 */
export function normalizeRating(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) return null;
  const snapped = Math.round(value / RATING_STEP) * RATING_STEP;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, snapped));
}

/** The word for a rating ("Good+"), or `null` when there is none. */
export function ratingLabel(value: number | null | undefined): string | null {
  const v = normalizeRating(value);
  if (v === null) return null;
  return RATING_LABELS[v / RATING_STEP - 1] ?? null;
}

/** "3.5", "4" — a half shows as ".5", a whole star has no decimals. */
export function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The accessible name of the radio for one value — what VoiceOver says when
 * it lands on it: "1 star, Bad", "3.5 stars, Good+".
 */
export function ratingOptionName(value: number): string {
  const unit = value === 1 ? "star" : "stars";
  const label = ratingLabel(value);
  return `${formatRating(value)} ${unit}${label === null ? "" : `, ${label}`}`;
}

/** The name of a read-only rating: "Rated 3.5 out of 5", or "Not rated". */
export function ratingSummary(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not rated";
  }
  // A display may be handed an average (4.25), so it is not snapped here.
  const clamped = Math.min(RATING_MAX, Math.max(0, value));
  return `Rated ${Math.round(clamped * 100) / 100} out of ${RATING_MAX}`;
}

/**
 * What a tap on star `star` sets, given the current value. Every star is a
 * single 44 pt target, so the half is reached by tapping again rather than by
 * hitting a 22 pt half:
 *
 * - tapping a star that is not the current value sets that whole star;
 * - tapping the star that *is* the current value drops it to its half;
 * - tapping that half-filled star again restores the whole star.
 *
 * So 3 → tap ★4 → 4 → tap ★4 → 3.5 → tap ★4 → 4.
 */
export function tapStar(star: number, current: number | null): number {
  const whole = Math.min(RATING_MAX, Math.max(1, Math.round(star)));
  return current === whole ? whole - RATING_STEP : whole;
}

/**
 * The value a key sets, or `undefined` when the key is not the rating's (so
 * the caller leaves it to the browser — Tab, Space, Enter…).
 *
 * Arrows move half a star in the **direction a native radio group moves**,
 * because the control is announced as one: Right and Down go to the next
 * radio (half a star more), Left and Up to the previous (half a star less).
 * A screen-reader user in focus mode presses Down for "next option" and must
 * not hear the score drop. They differ from native radios in one way: they
 * **clamp** at the ends, where a native group wraps and would turn "one
 * more" at 5 into 0.5. PageUp/PageDown move a whole star, Home/End jump to
 * 0.5/5. From "not rated", a step lands on the nearest valid value: 0.5 for
 * every half step either way, 1 for PageUp.
 */
export function ratingForKey(
  key: string,
  current: number | null,
): number | undefined {
  const base = current ?? 0;
  const clamp = (v: number) => Math.min(RATING_MAX, Math.max(RATING_MIN, v));
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return clamp(base + RATING_STEP);
    case "ArrowLeft":
    case "ArrowUp":
      return clamp(base - RATING_STEP);
    case "PageUp":
      return clamp(base + 1);
    case "PageDown":
      return clamp(base - 1);
    case "Home":
      return RATING_MIN;
    case "End":
      return RATING_MAX;
    default:
      return undefined;
  }
}

/**
 * How full each of the five stars is, 0–1. A half-step value fills halves
 * only; a display handed an average (4.25) gets the exact fraction.
 */
export function starFractions(value: number | null | undefined): number[] {
  const v =
    value === null || value === undefined || !Number.isFinite(value)
      ? 0
      : Math.min(RATING_MAX, Math.max(0, value));
  return RATING_STARS.map((star) => Math.min(1, Math.max(0, v - (star - 1))));
}
