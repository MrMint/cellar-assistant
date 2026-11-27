"use client";

import { formatQuantity } from "@cellar-assistant/contracts/quantity";
import { isNotNil } from "ramda";
import { ChevronRight } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { availabilityText } from "@/components/bar/copy";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

/** An ingredient's name and link: the specific bottle, else the generic. */
export const getIngredientDisplay = (ingredient: RecipeIngredient) => {
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
    <ul className="m-0 flex list-none flex-col p-0">
      {ingredients.map((ingredient) => {
        const display = getIngredientDisplay(ingredient);
        const amount =
          ingredient.amount ??
          formatQuantity(ingredient.quantity, ingredient.unit);
        const isGarnish = ingredient.role === "garnish";
        const linked = display.isSpecific && display.href !== null;
        const note =
          showAvailability && isNotNil(ingredient.availability)
            ? ingredient.availability
            : null;

        return (
          <li
            key={ingredient.id}
            data-ingredient-role={ingredient.role ?? undefined}
            className="relative flex flex-col gap-1 border-hair border-b py-3 last:border-b-0"
          >
            <div className="flex min-h-8 items-center gap-3">
              <span className="t-body tabular w-20 shrink-0 text-ink-2">
                {amount}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {linked && display.href !== null ? (
                    <Link
                      href={display.href}
                      overlay
                      underline="none"
                      className="t-body text-ink"
                    >
                      {display.name}
                    </Link>
                  ) : (
                    <span className="t-body text-ink">{display.name}</span>
                  )}
                  {ingredient.is_optional && (
                    <Badge variant="outline">Optional</Badge>
                  )}
                  {isGarnish && !ingredient.is_optional && (
                    <Badge variant="outline">Garnish</Badge>
                  )}
                </div>
                {note !== null && (
                  <span
                    data-availability={note.status.toLowerCase()}
                    className={cn(
                      "t-cap truncate",
                      note.status === "MISSING" || note.status === "UNKNOWN"
                        ? "text-ink-3"
                        : "text-ink-2",
                    )}
                  >
                    {availabilityText(note)}
                  </span>
                )}
              </div>
              {linked && (
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-glyph"
                />
              )}
            </div>

            {showSubstitutions && isNotNil(ingredient.substitution_notes) && (
              <p className="t-cap m-0 pl-23 text-ink-2">
                {ingredient.substitution_notes}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
