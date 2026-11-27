import { ImageResponse } from "next/og";
import { loadSharedRecipe } from "@/components/share/loaders";
import { BrandCard, OG_SIZE, RecipeCard } from "@/components/share/og-cards";
import { recipeFacts } from "@/components/share/SharedRecipeView";

export const alt = "A recipe on Cellar Assistant";
export const size = OG_SIZE;
export const contentType = "image/png";
/**
 * Rendered per request, never cached as a static asset: a list made private,
 * or a photo taken down, must stop showing in previews at once — the page
 * itself is `force-dynamic` for the same reason.
 */
export const dynamic = "force-dynamic";

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
      kind={recipeFacts({
        ...recipe,
        prepTimeMinutes: null,
        difficultyLevel: null,
        servingSize: null,
      })}
      name={recipe.name}
      facts={recipeFacts({ ...recipe, type: "", servingSize: null })}
      blurb={recipe.description}
    />,
    size,
  );
}
