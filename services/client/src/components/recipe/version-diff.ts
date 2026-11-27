import { formatQuantity } from "@cellar-assistant/contracts/quantity";
import type { RecipeIngredient } from "./adapter";

/** One line of a version card's ingredients (Recipes-Browse 16). */
export type VersionLine = {
  key: string;
  amount: string;
  name: string;
  /** Not as the original has it: a new ingredient or a new amount. */
  changed: boolean;
};

const amountOf = (ingredient: RecipeIngredient): string =>
  ingredient.amount ?? formatQuantity(ingredient.quantity, ingredient.unit);

/**
 * A version's ingredients against the original's: what it changes is marked,
 * and each of the original's ingredients it drops is a line of its own,
 * "No gin". The original itself, and a version compared with nothing, has no
 * marks. Names compare case-blind, as the reader would.
 */
export const versionLines = (
  ingredients: readonly RecipeIngredient[],
  original: readonly RecipeIngredient[] | null,
  nameOf: (ingredient: RecipeIngredient) => string,
): VersionLine[] => {
  const key = (ingredient: RecipeIngredient) =>
    nameOf(ingredient).trim().toLowerCase();
  const before = new Map(
    (original ?? []).map((ingredient) => [
      key(ingredient),
      amountOf(ingredient),
    ]),
  );
  const lines: VersionLine[] = ingredients.map((ingredient) => {
    const amount = amountOf(ingredient);
    const was = before.get(key(ingredient));
    return {
      key: ingredient.id,
      amount,
      name: nameOf(ingredient),
      changed: original !== null && was !== amount,
    };
  });
  if (original === null) return lines;
  const now = new Set(ingredients.map(key));
  for (const ingredient of original) {
    if (now.has(key(ingredient))) continue;
    lines.push({
      key: `no-${ingredient.id}`,
      amount: "",
      name: `No ${nameOf(ingredient).toLowerCase()}`,
      changed: true,
    });
  }
  return lines;
};
