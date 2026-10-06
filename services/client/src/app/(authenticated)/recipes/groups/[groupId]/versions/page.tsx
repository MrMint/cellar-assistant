import { Box, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Link } from "@/components/common/Link";
import { versionFromNodes } from "@/components/recipe/adapter";
import {
  RecipeDetailsFragment,
  RecipeVoteStateFragment,
} from "@/components/recipe/fragments";
import { RecipeVersionsPageQuery } from "@/components/recipe/queries";
import { RecipeVersionsTab } from "@/components/recipe/RecipeVersionsTab";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/groups/[groupId]/versions` — `82450ad1:src/app/(authenticated)/recipes/groups/[groupId]/versions/page.tsx`,
 * restored: the text breadcrumbs, "{name} - All Versions", the blurb and
 * `RecipeVersionsTab`. In production it threw on load (`recipe_votes` had no
 * Hasura permission).
 *
 * The middle breadcrumb goes to `/recipes/groups/{id}`; the old one was
 * `/recipes/{groupId}`, which put a group id on the recipe route (a 404).
 * Versions beyond the first 20 (`RECIPE_VERSIONS_PAGE_SIZE`) are counted, not
 * shown.
 */
export const dynamic = "force-dynamic";

export default async function RecipeVersionsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await apiServerQuery(RecipeVersionsPageQuery, { groupId });
  const result = unwrapResult(data.recipeGroup, "RecipeGroup");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const recipeGroup = result.data;
  const recipes = recipeGroup.recipes.edges.map((edge) =>
    versionFromNodes(
      readFragment(RecipeDetailsFragment, edge.node),
      readFragment(RecipeVoteStateFragment, edge.node),
    ),
  );
  const canonicalRecipeId = recipeGroup.canonicalRecipeId ?? null;
  const hidden = recipeGroup.recipeCount - recipes.length;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography level="body-sm" sx={{ mb: 1 }}>
          <Link href="/recipes" underline="always">
            Recipe Groups
          </Link>
          {" > "}
          <Link href={`/recipes/groups/${recipeGroup.id}`} underline="always">
            {recipeGroup.name}
          </Link>
          {" > Versions"}
        </Typography>

        <Typography level="h1" sx={{ mb: 1 }}>
          {recipeGroup.name} - All Versions
        </Typography>

        {recipeGroup.description && (
          <Typography level="body-lg" sx={{ color: "text.secondary", mb: 2 }}>
            {recipeGroup.description}
          </Typography>
        )}

        <Typography level="body-md" sx={{ color: "text.secondary" }}>
          Compare all {recipeGroup.recipeCount} versions of this recipe and vote
          for your favorite. The community's preferred version is shown as the
          canonical recipe.
        </Typography>
        {hidden > 0 && (
          <Typography level="body-sm" sx={{ color: "text.tertiary", mt: 1 }}>
            Showing the top {recipes.length}; {hidden} more are not listed.
          </Typography>
        )}
      </Box>

      {/* Recipe Versions Comparison */}
      <RecipeVersionsTab
        recipes={recipes}
        canonicalRecipeId={canonicalRecipeId}
        groupId={recipeGroup.id}
      />
    </Box>
  );
}
