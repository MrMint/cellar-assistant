/**
 * The one quantity formatter (X14). Every surface that prints an ingredient
 * amount — the recipe page, an item's "Cocktails with this", the What can I
 * make list, the API's `RecipeIngredient.amount` — goes through here, so a
 * half ounce reads `½ oz` everywhere instead of `0.5 oz` on one screen and
 * `1/2 oz` on the next.
 *
 * Two inputs, in this order of preference:
 *
 *  1. **`quantityText`** — the amount as the recipe printed it ("¾ oz",
 *     "2 dashes", "top with"), which the extraction now returns per
 *     ingredient. It is the honest one: a model that turned "a splash" into
 *     `0.25` invented a number. It is only prettified here (ASCII fractions to
 *     Unicode), never re-measured.
 *  2. **`quantity` + `unit`** — the numeric pair the table has always held.
 *     Imperial and bar units get Unicode fractions; metric units stay decimal
 *     (`22.5 ml`, never `22½ ml`).
 *
 * No `"use client"` concerns: plain functions, importable from the actors, the
 * API and the browser (`@cellar-assistant/contracts/bar`).
 */

/** The vulgar fractions a bar recipe actually uses, by value. */
const FRACTIONS: readonly (readonly [number, string])[] = [
  [1 / 8, "⅛"],
  [1 / 6, "⅙"],
  [1 / 5, "⅕"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [2 / 5, "⅖"],
  [1 / 2, "½"],
  [3 / 5, "⅗"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [4 / 5, "⅘"],
  [5 / 6, "⅚"],
  [7 / 8, "⅞"],
];

/** ASCII `n/d` → the Unicode glyph, for the same set. */
const ASCII_FRACTIONS: Readonly<Record<string, string>> = {
  "1/8": "⅛",
  "1/6": "⅙",
  "1/5": "⅕",
  "1/4": "¼",
  "1/3": "⅓",
  "3/8": "⅜",
  "2/5": "⅖",
  "1/2": "½",
  "3/5": "⅗",
  "5/8": "⅝",
  "2/3": "⅔",
  "3/4": "¾",
  "4/5": "⅘",
  "5/6": "⅚",
  "7/8": "⅞",
};

/** Units measured in decimals. Everything else is a bar or kitchen unit. */
const METRIC_UNITS: ReadonlySet<string> = new Set([
  "ml",
  "cl",
  "dl",
  "l",
  "g",
  "kg",
  "mg",
  "millilitre",
  "milliliter",
  "millilitres",
  "milliliters",
  "centilitre",
  "centiliter",
  "litre",
  "liter",
  "gram",
  "grams",
]);

/** How close a decimal must be to a fraction to be printed as one. */
const FRACTION_TOLERANCE = 0.01;

const isMetric = (unit: string | null | undefined): boolean =>
  typeof unit === "string" &&
  METRIC_UNITS.has(unit.trim().toLowerCase().replace(/\.$/, ""));

/** `1.5` → `"1.5"`, `2` → `"2"`, `0.3333` → `"0.33"`. */
const decimal = (value: number): string =>
  String(Math.round(value * 100) / 100);

/**
 * A number as a bartender writes it: `1.5` → `1½`, `0.75` → `¾`, `2` → `2`,
 * `0.3` → `0.3` (no fraction is close enough, so the decimal is kept rather
 * than rounded into one that was never meant).
 */
export const formatAmount = (value: number): string => {
  if (!Number.isFinite(value)) return "";
  if (value < 0) return decimal(value);
  const whole = Math.floor(value + FRACTION_TOLERANCE);
  const rest = value - whole;
  if (Math.abs(rest) < FRACTION_TOLERANCE) return String(whole);
  for (const [fraction, glyph] of FRACTIONS) {
    if (Math.abs(rest - fraction) < FRACTION_TOLERANCE) {
      return whole === 0 ? glyph : `${whole}${glyph}`;
    }
  }
  return decimal(value);
};

/**
 * `quantity` + `unit` as one string: `(1.5, "oz")` → `"1½ oz"`,
 * `(22.5, "ml")` → `"22.5 ml"`, `(2, null)` → `"2"`, `(null, "dash")` →
 * `"dash"`, `(null, null)` → `""`.
 */
export const formatQuantity = (
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string => {
  const cleanUnit = typeof unit === "string" ? unit.trim() : "";
  if (quantity === null || quantity === undefined || Number.isNaN(quantity)) {
    return cleanUnit;
  }
  const amount = isMetric(cleanUnit)
    ? decimal(quantity)
    : formatAmount(quantity);
  return cleanUnit === "" ? amount : `${amount} ${cleanUnit}`;
};

/**
 * Printed text with its ASCII fractions made typographic: `"1 1/2 oz"` →
 * `"1½ oz"`, `"1-1/2 oz"` → `"1½ oz"`, `"3/4 oz"` → `"¾ oz"`. Anything that
 * is not one of the known fractions (`"7/16"`, a date) is left exactly as
 * written.
 */
export const prettifyQuantityText = (text: string): string =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(
      /(?:\b(\d+)[\s-])?\b(\d)\/(\d)\b/g,
      (match, whole: string | undefined, num: string, den: string) => {
        const glyph = ASCII_FRACTIONS[`${num}/${den}`];
        if (glyph === undefined) return match;
        return `${whole ?? ""}${glyph}`;
      },
    );

/** What one ingredient's amount reads as, preferring the printed text. */
export const ingredientAmount = (ingredient: {
  readonly quantityText?: string | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
}): string => {
  const printed = ingredient.quantityText;
  if (typeof printed === "string" && printed.trim() !== "") {
    return prettifyQuantityText(printed);
  }
  return formatQuantity(ingredient.quantity, ingredient.unit);
};
