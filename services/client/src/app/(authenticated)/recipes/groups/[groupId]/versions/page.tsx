import { notFound } from "next/navigation";
import { Link } from "@/components/app/Link";
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
    return <p className="type-body text-destructive">{result.error.message}</p>;
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
    <div className="mx-auto w-full max-w-[1400px]">
      {/* Page Header */}
      <div className="mb-8">
        <p className="mb-2 type-callout">
          <Link href="/recipes" underline="always">
            Recipe Groups
          </Link>
          {" > "}
          <Link href={`/recipes/groups/${recipeGroup.id}`} underline="always">
            {recipeGroup.name}
          </Link>
          {" > Versions"}
        </p>

        <h1 className="mb-2 type-large-title">
          {recipeGroup.name} - All Versions
        </h1>

        {recipeGroup.description && (
          <p className="mb-4 type-body text-ink-2">{recipeGroup.description}</p>
        )}

        <p className="type-body text-ink-2">
          Compare all {recipeGroup.recipeCount} versions of this recipe and vote
          for your favorite. The community's preferred version is shown as the
          canonical recipe.
        </p>
        {hidden > 0 && (
          <p className="mt-2 type-callout text-ink-3">
            Showing the top {recipes.length}; {hidden} more are not listed.
          </p>
        )}
      </div>

      {/* Recipe Versions Comparison */}
      <RecipeVersionsTab
        recipes={recipes}
        canonicalRecipeId={canonicalRecipeId}
        groupId={recipeGroup.id}
      />
    </div>
  );
}
