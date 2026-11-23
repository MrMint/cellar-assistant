/**
 * ux-c L08 Make mode: scaling a recipe by servings. Pure — `scaling.test.ts`.
 *
 * A recipe states how many it serves (`serving_size`, 1 when it says
 * nothing). Choosing `servings` multiplies every measured line by
 * `servings / base`; a line with no number ("a dash", "to top") cannot be
 * scaled, so it keeps its words and says how many times over.
 */
import { formatQuantity } from "@cellar-assistant/contracts/quantity";
import type { RecipeIngredient } from "@/components/recipe/adapter";

/** The stepper's bounds: one glass to a party pitcher. */
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;

/** What the recipe serves as written — 1 when it does not say. */
export const baseServings = (servingSize: number | null | undefined): number =>
  typeof servingSize === "number" &&
  Number.isFinite(servingSize) &&
  servingSize >= 1
    ? Math.round(servingSize)
    : 1;

export const clampServings = (servings: number): number =>
  Math.min(
    MAX_SERVINGS,
    Math.max(
      MIN_SERVINGS,
      Math.round(Number.isFinite(servings) ? servings : 1),
    ),
  );

/** The multiplier for `servings`, from what the recipe serves. */
export const scaleFactor = (servings: number, base: number): number =>
  clampServings(servings) / Math.max(1, base);

/**
 * A quantity times `factor`, rounded so it prints cleanly: to 1/4 for
 * imperial-sized numbers below 10, otherwise to one decimal place (`formatQuantity`
 * prints metric units as decimals and the rest with Unicode fractions).
 */
export const scaleQuantity = (quantity: number, factor: number): number => {
  const scaled = quantity * factor;
  if (scaled < 10) return Math.round(scaled * 4) / 4 || scaled;
  return Math.round(scaled * 10) / 10;
};

const GLYPHS: Readonly<Record<string, number>> = {
  "⅛": 1 / 8,
  "¼": 1 / 4,
  "⅓": 1 / 3,
  "⅜": 3 / 8,
  "½": 1 / 2,
  "⅝": 5 / 8,
  "⅔": 2 / 3,
  "¾": 3 / 4,
  "⅞": 7 / 8,
};

/**
 * The number a printed amount starts with, and the words after it:
 * `"30 ml"` → 30 + "ml", `"1 1/2 oz"` / `"1½ oz"` → 1.5 + "oz",
 * `"¾ oz"` → 0.75 + "oz". Null when it starts with words ("a dash").
 */
export const leadingNumber = (
  text: string,
): { value: number; rest: string } | null => {
  const match =
    /^(?:(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+)|\s*([⅛¼⅓⅜½⅝⅔¾⅞]))?|(\d+)\/(\d+)|([⅛¼⅓⅜½⅝⅔¾⅞]))(?=\s|$)\s*(.*)$/u.exec(
      text.trim(),
    );
  if (match === null) return null;
  const [, whole, num, den, glyph, soloNum, soloDen, soloGlyph, rest] = match;
  let value = whole === undefined ? 0 : Number(whole);
  if (num !== undefined && den !== undefined)
    value += Number(num) / Number(den);
  if (soloNum !== undefined && soloDen !== undefined)
    value += Number(soloNum) / Number(soloDen);
  const g = glyph ?? soloGlyph;
  if (g !== undefined) value += GLYPHS[g] ?? 0;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, rest: (rest ?? "").trim() };
};

/** One line's amount at `factor`, as Make mode prints it. */
export const scaledAmount = (
  ingredient: Pick<RecipeIngredient, "quantity" | "unit" | "amount">,
  factor: number,
): string => {
  const { quantity, unit, amount } = ingredient;
  if (typeof quantity === "number" && Number.isFinite(quantity)) {
    if (factor === 1) {
      return amount?.trim() ? amount.trim() : formatQuantity(quantity, unit);
    }
    return formatQuantity(scaleQuantity(quantity, factor), unit);
  }
  const words = amount?.trim() ?? "";
  if (factor === 1 || words === "") return words;
  // W-3: a line whose only measure is its printed text ("30 ml", "2 dashes",
  // "1 1/2 oz") still starts with a number, so scale that number rather than
  // print "30 ml × 2".
  const printed = leadingNumber(words);
  if (printed !== null) {
    const [unit = "", ...rest] = printed.rest.split(/\s+/);
    const head = formatQuantity(scaleQuantity(printed.value, factor), unit);
    return rest.length === 0 ? head : `${head} ${rest.join(" ")}`;
  }
  const times = Number.isInteger(factor) ? String(factor) : factor.toFixed(1);
  return `${words} × ${times}`;
};

/** What Make mode lists for a line: its item, its generic kind, or its label. */
export const ingredientName = (
  ingredient: Pick<RecipeIngredient, "item" | "generic_item" | "kind_label">,
): string => {
  if (ingredient.item) {
    const vintage = ingredient.item.vintage
      ? `${ingredient.item.vintage} `
      : "";
    return `${vintage}${ingredient.item.name}`;
  }
  return (
    ingredient.generic_item?.name ??
    ingredient.kind_label ??
    "Unknown ingredient"
  );
};
