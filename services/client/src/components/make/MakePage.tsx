import { notFound } from "next/navigation";
import { ErrorState } from "@/components/app/EmptyState";
import { recipeDetailsFromNode } from "@/components/recipe/adapter";
import {
  RecipeDetailsFragment,
  RecipeReviewFragment,
} from "@/components/recipe/fragments";
import {
  RECIPE_REVIEWS_PAGE_SIZE,
  RECIPE_VERSIONS_PAGE_SIZE,
  RecipePageQuery,
} from "@/components/recipe/queries";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { MakeMode } from "./MakeMode";

/**
 * ux-c L08: `/recipes/[id]/make` — the recipe page's one read, then Make
 * mode. A recipe the viewer may not see is a 404 exactly like a missing one
 * (§1.6), as on the recipe page.
 */
export async function MakePage({ recipeId }: { recipeId: string }) {
  const data = await apiServerQuery(RecipePageQuery, {
    recipeId,
    reviewFirst: RECIPE_REVIEWS_PAGE_SIZE,
    versionFirst: RECIPE_VERSIONS_PAGE_SIZE,
  });
  const result = unwrapResult(data.recipe, "Recipe");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <ErrorState
        title="Couldn't open this recipe"
        reason="Check your connection"
      />
    );
  }
  const recipe = recipeDetailsFromNode(
    readFragment(RecipeDetailsFragment, result.data),
    {
      reviews: result.data.reviews.edges.map((edge) =>
        readFragment(RecipeReviewFragment, edge.node),
      ),
    },
  );
  return <MakeMode recipe={recipe} viewerId={data.me?.id ?? null} />;
}
