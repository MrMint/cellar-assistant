import { ImageResponse } from "next/og";
import { loadSharedRecipe, nodesOf } from "@/components/share/loaders";
import { BrandCard, OG_SIZE, RecipeCard } from "@/components/share/og-cards";
import { recipeFacts } from "@/components/share/SharedRecipeView";

export const alt = "A recipe on Cellar Assistant";
export const size = OG_SIZE;
export const contentType = "image/png";

/**
 * The preview card for a shared recipe. Text only: a recipe's `imageUrl` is
 * free text that could name any host, and this route will not fetch one.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const result = await loadSharedRecipe(recipeId);
  if (!result.ok) return new ImageResponse(<BrandCard />, size);
  const recipe = result.data;
  return new ImageResponse(
    <RecipeCard
      name={recipe.name}
      facts={recipeFacts(recipe)}
      ingredients={nodesOf(recipe.ingredients)
        .map((row) => row.name)
        .filter((name): name is string => name !== null)}
    />,
    size,
  );
}
