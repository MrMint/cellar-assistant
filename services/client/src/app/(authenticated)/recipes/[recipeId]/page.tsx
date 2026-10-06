import { RecipePage } from "@/components/recipe/RecipePage";

/**
 * `/recipes/[recipeId]` — `82450ad1:src/app/(authenticated)/recipes/[recipeId]/page.tsx`,
 * restored: `RecipeDetails` over one `recipe(id:)` read (`RecipePage`). In
 * production this page threw on load — the reviews relationship had no Hasura
 * permission.
 */
export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  return <RecipePage recipeId={recipeId} />;
}
