"use client";

import { formatQuantity } from "@cellar-assistant/contracts/quantity";
import { Restaurant } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { RecipeThumb } from "@/components/recipe/RecipePlate";
import { Badge } from "@/components/ui/badge";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";

const getDifficultyText = (level: number) => {
  if (level === 1) return "Very Easy";
  if (level === 2) return "Easy";
  if (level === 3) return "Medium";
  if (level === 4) return "Hard";
  return "Very Hard";
};

export type ItemRecipeIngredient = {
  id: string;
  recipe: {
    id: string;
    name: string;
    type: string;
    image_url?: string | null;
    difficulty_level?: number | null;
  };
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean | null;
};

export type ItemRecipesProps = {
  recipeIngredients: ItemRecipeIngredient[];
  title?: string;
  itemName?: string;
  /** `recipeIngredients.totalCount`, when the API held rows back. */
  total?: number | null;
};

/**
 * `82450ad1:src/components/item/ItemRecipes.tsx`, restored. Fed by
 * `Item.recipeIngredients` + `RecipeIngredient.recipe` (G11) through the
 * adapter; a recipe's own `imageUrl` goes into a plain `<img>` (no
 * `remotePatterns` entry). With none, B03's drawn `RecipeThumb` — the old
 * fallback was a wine-bottle photo for every cocktail.
 *
 * Amounts go through the one quantity formatter (X14, contracts
 * `formatQuantity`): "1½ oz", where this file used to carry its own table.
 *
 * The difficulty chip was green/amber/red by level with Joy's palette; the
 * word ("Easy", "Hard") is the information, so it is one neutral outline now
 * (design §3.1: no decorative hues), like the type and "Optional" chips.
 */
export const ItemRecipes = ({
  recipeIngredients,
  title = "Used in Recipes",
  itemName = "this item",
  total,
}: ItemRecipesProps) => {
  if (recipeIngredients.length === 0) {
    return null;
  }

  return (
    <ItemSection title={`${title} (${recipeIngredients.length})`}>
      <ul className="flex flex-col gap-4">
        {recipeIngredients.map((ingredient) => {
          const recipe = ingredient.recipe;
          const quantityText = formatQuantity(
            ingredient.quantity,
            ingredient.unit,
          );

          return (
            <li key={ingredient.id} className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2">
                {recipe.image_url !== null && recipe.image_url !== undefined ? (
                  // biome-ignore lint/performance/noImgElement: a recipe's own image URL has no `remotePatterns` entry.
                  <img
                    src={recipe.image_url}
                    alt={recipe.name}
                    width={48}
                    height={48}
                    className="size-full rounded-xs object-cover"
                  />
                ) : (
                  // B03: a drawn coupe or cloche, not a beer or wine photo.
                  <RecipeThumb type={recipe.type} className="rounded-xs" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/recipes/${recipe.id}`}
                    underline="always"
                    className="type-body font-medium text-ink-1"
                  >
                    {recipe.name}
                  </Link>
                  <Badge variant="secondary" className="capitalize">
                    {recipe.type === "food" && <Restaurant aria-hidden />}
                    {recipe.type}
                  </Badge>
                  {recipe.difficulty_level !== null &&
                    recipe.difficulty_level !== undefined && (
                      <Badge variant="outline">
                        {getDifficultyText(recipe.difficulty_level)}
                      </Badge>
                    )}
                  {ingredient.is_optional && (
                    <Badge variant="outline">Optional</Badge>
                  )}
                </div>
                <p className="type-callout text-ink-2">
                  {quantityText
                    ? `${quantityText} of ${itemName}`
                    : `Uses ${itemName}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <HeldBackNote
        shown={recipeIngredients.length}
        total={total}
        noun="recipes"
      />
    </ItemSection>
  );
};
