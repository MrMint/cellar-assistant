"use client";

import { isNil, isNotNil } from "ramda";
import { Link } from "@/components/app/Link";
import { Badge } from "@/components/ui/badge";
import { ingredientItemHref, type RecipeIngredient } from "./adapter";

export type { RecipeIngredient };

export type RecipeIngredientListProps = {
  ingredients: RecipeIngredient[];
  showSubstitutions?: boolean;
};

const getIngredientDisplay = (ingredient: RecipeIngredient) => {
  if (isNotNil(ingredient.item)) {
    const vintage = ingredient.item.vintage
      ? `${ingredient.item.vintage} `
      : "";
    return {
      name: `${vintage}${ingredient.item.name}`,
      href: ingredientItemHref(ingredient.item),
      isSpecific: true,
      category: null,
    };
  }

  if (isNotNil(ingredient.generic_item)) {
    return {
      name: ingredient.generic_item.name,
      href: null,
      isSpecific: false,
      category: ingredient.generic_item.category,
    };
  }

  return {
    name: "Unknown ingredient",
    href: null,
    isSpecific: false,
    category: null,
  };
};

const formatQuantity = (quantity?: number | null, unit?: string | null) => {
  if (isNil(quantity)) return "";

  let formatted = quantity.toString();

  // Convert decimals to fractions for common cooking measurements
  if (quantity % 1 !== 0) {
    const decimal = quantity % 1;
    const whole = Math.floor(quantity);

    if (decimal === 0.25) formatted = `${whole > 0 ? whole : ""} 1/4`.trim();
    else if (decimal === 0.5)
      formatted = `${whole > 0 ? whole : ""} 1/2`.trim();
    else if (decimal === 0.75)
      formatted = `${whole > 0 ? whole : ""} 3/4`.trim();
    else if (decimal === 0.33)
      formatted = `${whole > 0 ? whole : ""} 1/3`.trim();
    else if (decimal === 0.67)
      formatted = `${whole > 0 ? whole : ""} 2/3`.trim();
  }

  return isNotNil(unit) ? `${formatted} ${unit}` : formatted;
};

/**
 * `82450ad1:src/components/recipe/RecipeIngredientList.tsx`, restored.
 *
 * Dropped: the availability icons and messages ("In your cellar", "Similar
 * items available", "View substitutions"). They came from `Math.random()` —
 * a different answer on every render, and a hydration mismatch — and the API
 * has no real compatibility field to replace them (G29, dropped). Rendering
 * them from nothing would be a claim about the viewer's cellar that is not
 * true, so the row renders as it did with `showAvailability={false}`, which
 * is how the versions tab already showed it.
 *
 * The item link covers all six item types (`/{type}s/{id}`); the old row had
 * no sake or tea column, so those could not link.
 */
export const RecipeIngredientList = ({
  ingredients,
  showSubstitutions = true,
}: RecipeIngredientListProps) => {
  return (
    <div className="flex flex-col divide-y divide-line">
      {ingredients.map((ingredient) => {
        const display = getIngredientDisplay(ingredient);
        const quantityText = formatQuantity(
          ingredient.quantity,
          ingredient.unit,
        );

        return (
          <div
            key={ingredient.id}
            className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2 type-body">
              {/* Quantity */}
              {quantityText && (
                <span className="tabular font-medium">{quantityText}</span>
              )}

              {/* Ingredient name */}
              {display.isSpecific && display.href ? (
                <Link href={display.href} underline="always">
                  {display.name}
                </Link>
              ) : (
                <span>{display.name}</span>
              )}

              {/* Optional indicator */}
              {ingredient.is_optional && (
                <Badge variant="outline">Optional</Badge>
              )}

              {/* Ingredient type for generic items */}
              {!display.isSpecific && display.category && (
                <Badge variant="secondary">{display.category}</Badge>
              )}
            </div>

            {/* Substitution notes */}
            {showSubstitutions && isNotNil(ingredient.substitution_notes) && (
              <p className="type-callout text-ink-2 italic">
                Note: {ingredient.substitution_notes}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
