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
