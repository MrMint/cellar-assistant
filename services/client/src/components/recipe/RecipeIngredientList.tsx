"use client";

import { formatQuantity } from "@cellar-assistant/contracts/quantity";
import { isNotNil } from "ramda";
import { Link } from "@/components/app/Link";
import { IngredientAvailabilityTag } from "@/components/bar/Availability";
import { Badge } from "@/components/ui/badge";
import { ingredientItemHref, type RecipeIngredient } from "./adapter";

export type { RecipeIngredient };

export type RecipeIngredientListProps = {
  ingredients: RecipeIngredient[];
  showSubstitutions?: boolean;
  /**
   * Availability tags (D9). On by default; the versions tab turns them off,
   * where every version repeating the same tags would be noise.
   */
  showAvailability?: boolean;
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
    };
  }

  if (isNotNil(ingredient.generic_item)) {
    return {
      name: ingredient.generic_item.name,
      href: null,
      isSpecific: false,
    };
  }

  return { name: "Unknown ingredient", href: null, isSpecific: false };
};

/**
 * `82450ad1:src/components/recipe/RecipeIngredientList.tsx`, restored, and
 * X14's ingredient row.
 *
 * - **The amount** is the one quantity formatter's (`RecipeIngredient.amount`
 *   from the API — the printed "¾ oz" when the recipe had one, else the
 *   numbers with Unicode fractions); `formatQuantity` from contracts covers a
 *   row from an older document without it. The two hand-rolled fraction
 *   tables this file and `ItemRecipes` each carried are gone.
 * - **Availability** is real (D9): Have, Swap, Missing or Not tracked, from
 *   the viewer's own bottles and Bar pantry. The old icons came from
 *   `Math.random()` and were dropped in the restore; these replace them.
 * - The generic item's category chip ("spirit", "citrus") is gone: the kind
 *   label it approximated is what availability is decided on, and the tag
 *   already says what matters about it.
 *
 * The item link covers all six item types (`/{type}s/{id}`).
 */
export const RecipeIngredientList = ({
  ingredients,
  showSubstitutions = true,
  showAvailability = true,
}: RecipeIngredientListProps) => {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {ingredients.map((ingredient) => {
        const display = getIngredientDisplay(ingredient);
        const amount =
          ingredient.amount ??
          formatQuantity(ingredient.quantity, ingredient.unit);
        const isGarnish = ingredient.role === "garnish";

        return (
          <li
            key={ingredient.id}
            data-ingredient-role={ingredient.role ?? undefined}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex items-baseline gap-3 type-body">
              <span className="tabular w-16 shrink-0 text-ink-2">{amount}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {display.isSpecific && display.href ? (
                    <Link href={display.href} underline="always">
                      {display.name}
                    </Link>
                  ) : (
                    <span>{display.name}</span>
                  )}
                  {ingredient.is_optional && (
                    <Badge variant="outline">Optional</Badge>
                  )}
                  {isGarnish && !ingredient.is_optional && (
                    <Badge variant="outline">Garnish</Badge>
                  )}
                </div>
                {showAvailability && isNotNil(ingredient.availability) && (
                  <IngredientAvailabilityTag
                    availability={ingredient.availability}
                  />
                )}
              </div>
            </div>

            {showSubstitutions && isNotNil(ingredient.substitution_notes) && (
              <p className="pl-19 type-callout text-ink-2 italic">
                Note: {ingredient.substitution_notes}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
