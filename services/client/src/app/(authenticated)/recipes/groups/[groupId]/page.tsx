import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { People, Verified } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { shownVersion } from "@/components/recipe/group-pick";
import { RecipeGroupPageQuery } from "@/components/recipe/queries";
import { RecipePage } from "@/components/recipe/RecipePage";
import {
  QUIET_ACTION,
  RecipeInfoCard,
} from "@/components/recipe/RecipePageParts";
import { RecipeReadError } from "@/components/recipe/RecipeReadError";
import { versionsLine } from "@/components/recipe/recipe-meta";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/groups/[groupId]` (Recipes-Browse 13 to 15, 21): the recipe page
 * of the version shown, with "Negroni · 3 versions" above its name (the
 * title names the version shown, ruling 4) and a pick card under the
 * description.
 *
 * The version shown is the community pick (MC-pick: at least 3 net votes
 * from people other than its author, ruling 1), labelled "Community pick";
 * with none it is the original, under "No pick yet · Showing the original"
 * and a way to Vote on the versions page.
 */
export const dynamic = "force-dynamic";

/** One group read per request, for the page and its title (X21). */
const loadRecipeGroup = cache((groupId: string) =>
  apiServerQuery(RecipeGroupPageQuery, { groupId }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  const result = unwrapResult(
    (await loadRecipeGroup(groupId)).recipeGroup,
    "RecipeGroup",
  );
  return { title: result.ok ? result.data.name : "Recipe" };
}

export default async function RecipeGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await loadRecipeGroup(groupId);
  const result = unwrapResult(data.recipeGroup, "RecipeGroup");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <RecipeReadError reason={result.error.message} />;
  }

  const recipeGroup = result.data;
  const versionCount = recipeGroup.recipeCount;
  const versionsHref = `/recipes/groups/${recipeGroup.id}/versions`;
  const shown = shownVersion(
    recipeGroup.communityPickId,
    recipeGroup.recipes.edges.map((edge) => edge.node),
  );

  if (shown === null) {
    return (
      <EmptyState
        title="No versions yet"
        action={
          <Link href="/recipes" underline="none" className={QUIET_ACTION}>
            All recipes
          </Link>
        }
      />
    );
  }

  const many = versionCount > 1;
  return (
    <RecipePage
      recipeId={shown.id}
      parent="/recipes"
      eyebrow={
        many ? (
          <Link href={versionsHref} underline="none" className="text-ink-2">
            {recipeGroup.name} · {versionsLine(versionCount)}
          </Link>
        ) : undefined
      }
      aside={
        many ? (
          <RecipeInfoCard
            data-pick={shown.isPick ? "community" : "none"}
            glyph={shown.isPick ? <Verified /> : <People />}
            title={shown.isPick ? "Community pick" : "No pick yet"}
            detail={
              shown.isPick ? "Most votes from others" : "Showing the original"
            }
            action={
              <Link
                href={versionsHref}
                underline="none"
                className={QUIET_ACTION}
              >
                {shown.isPick ? "Versions" : "Vote"}
              </Link>
            }
          />
        ) : undefined
      }
    />
  );
}
