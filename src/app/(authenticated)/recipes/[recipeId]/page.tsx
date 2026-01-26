import { graphql, readFragment } from "@cellar-assistant/shared";
import { Typography } from "@mui/joy";
import { redirect } from "next/navigation";
import { RecipeDetails } from "@/components/recipe/RecipeDetails";
import { RecipeFullFragment } from "@/components/shared/fragments/recipe-fragments";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

const GetRecipeQuery = graphql(
  `
  query GetRecipe($recipeId: uuid!) {
    recipes_by_pk(id: $recipeId) {
      ...RecipeFull
    }
  }
`,
  [RecipeFullFragment],
);

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const userId = await getServerUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch recipe data server-side for immediate rendering
  const data = await serverQuery(GetRecipeQuery, { recipeId });

  if (!data.recipes_by_pk) {
    return <Typography>Recipe not found</Typography>;
  }

  // Read the fragment data from the gql.tada fragment reference
  const recipe = readFragment(RecipeFullFragment, data.recipes_by_pk);

  // Cast fragment data to match RecipeDetailsItem interface
  // The readFragment result contains all the necessary data but with complex gql.tada types

  return <RecipeDetails recipe={recipe as any} userId={userId} />;
}
