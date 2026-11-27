import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppBar } from "@/components/app/AppBar";
import { ErrorState } from "@/components/app/EmptyState";
import { Page } from "@/components/app/Page";
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
 * `/recipes/groups/[groupId]/versions` — Versions (Recipes-Browse 16–20,
 * desktop 03): the bar says "Versions" over "Negroni · 3", Back goes to the
 * group, and every version is a card with its vote row
 * (`RecipeVersionsTab`). Versions beyond the first 20
 * (`RECIPE_VERSIONS_PAGE_SIZE`) are counted, never shown as a total.
 */
export const dynamic = "force-dynamic";

/** One versions read per request, for the page and its title (X21). */
const loadVersions = cache((groupId: string) =>
  apiServerQuery(RecipeVersionsPageQuery, { groupId }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  const result = unwrapResult(
    (await loadVersions(groupId)).recipeGroup,
    "RecipeGroup",
  );
  return {
    title: result.ok ? `${result.data.name}: all versions` : "Recipe versions",
  };
}

export default async function RecipeVersionsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await loadVersions(groupId);
  const result = unwrapResult(data.recipeGroup, "RecipeGroup");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <Page>
        <AppBar title="Versions" parent="/recipes" />
        <ErrorState
          title="Couldn't open the versions"
          reason={result.error.message}
        />
      </Page>
    );
  }

  const recipeGroup = result.data;
  const recipes = recipeGroup.recipes.edges.map((edge) =>
    versionFromNodes(
      readFragment(RecipeDetailsFragment, edge.node),
      readFragment(RecipeVoteStateFragment, edge.node),
    ),
  );
  const hidden = recipeGroup.recipeCount - recipes.length;

  return (
    <Page wide>
      <AppBar
        parent={`/recipes/groups/${recipeGroup.id}`}
        title={
          <div className="flex min-w-0 flex-col">
            <h1 className="t-head m-0 truncate text-ink">Versions</h1>
            <p className="t-cap m-0 truncate text-ink-2">
              {recipeGroup.name} · {recipeGroup.recipeCount}
            </p>
          </div>
        }
      />
      <RecipeVersionsTab
        recipes={recipes}
        canonicalRecipeId={recipeGroup.canonicalRecipeId ?? null}
        communityPickId={recipeGroup.communityPickId ?? null}
        groupId={recipeGroup.id}
        viewerId={data.me?.id ?? null}
      />
      {hidden > 0 && (
        <p className="t-cap m-0 text-ink-3">
          {recipes.length} of {recipeGroup.recipeCount} shown
        </p>
      )}
    </Page>
  );
}
