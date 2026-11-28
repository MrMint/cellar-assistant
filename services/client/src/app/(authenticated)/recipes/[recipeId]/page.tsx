import { RecipePage, recipePageMetadata } from "@/components/recipe/RecipePage";

/**
 * `/recipes/[recipeId]` — `82450ad1:src/app/(authenticated)/recipes/[recipeId]/page.tsx`,
 * restored: `RecipeDetails` over one `recipe(id:)` read (`RecipePage`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  return params.then(({ recipeId }) => recipePageMetadata(recipeId));
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  return <RecipePage recipeId={recipeId} />;
}
