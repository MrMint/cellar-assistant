/**
 * The line under a recipe in Your bar (Recipes-Make board): what it pours,
 * what it stands in, or what it needs. Pure, so a test holds it to the board.
 *
 * - Ready: the bottles it pours, "Crystal Head Aurora +2"; all pantry, "From
 *   your pantry".
 * - Swap: "Swap: Kraken Black Spiced Rum for white rum" (CROSS-LOT: a swap is
 *   one bottle away, and says so).
 * - One away: "Needs orange liqueur".
 */
import { listMissing, type MakeabilityLike } from "../copy";

export type BarIngredient = {
  readonly isOptional: boolean;
  readonly role?: string | null;
  readonly kindLabel?: string | null;
  readonly item?: { readonly name: string } | null;
  readonly genericItem?: { readonly name: string } | null;
  readonly availability?: {
    readonly status: string;
    readonly source?: string | null;
    readonly label?: string | null;
  } | null;
};

/** What the recipe calls the ingredient, in its own words. */
export const barIngredientName = (ingredient: BarIngredient): string =>
  ingredient.item?.name ??
  ingredient.genericItem?.name ??
  ingredient.kindLabel ??
  "an ingredient";

/** A label mid-sentence: a kind word goes lower case, a name stays. */
const midSentence = (ingredient: BarIngredient): string => {
  const name = barIngredientName(ingredient);
  const isKindWord =
    ingredient.item == null &&
    ingredient.genericItem == null &&
    ingredient.kindLabel != null;
  return isKindWord ? name.toLowerCase() : name;
};

const required = (ingredients: readonly BarIngredient[]) =>
  ingredients.filter((i) => !i.isOptional && i.role !== "garnish");

export const barRowDetail = (
  makeability: MakeabilityLike,
  ingredients: readonly BarIngredient[],
): string => {
  const needed = required(ingredients);
  if (makeability.status === "MAKE_NOW") {
    const swap = needed.find((i) => i.availability?.status === "SUBSTITUTE");
    if (swap !== undefined) {
      const label = swap.availability?.label;
      return label
        ? `Swap: ${label} for ${midSentence(swap)}`
        : `Swap for ${midSentence(swap)}`;
    }
    const bottles = needed
      .filter(
        (i) =>
          i.availability?.status === "HAVE" &&
          i.availability.source === "BOTTLE" &&
          i.availability.label,
      )
      .map((i) => i.availability?.label ?? "");
    const unique = Array.from(new Set(bottles));
    return unique.length > 0 ? listMissing(unique, 1) : "From your pantry";
  }
  const first = makeability.missing[0];
  if (makeability.status === "ONE_AWAY") {
    return `Needs ${first ?? "one more thing"}`;
  }
  return `Needs ${listMissing(makeability.missing)}`;
};
