import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { recipeDetailsFromNode } from "./adapter";
import { RecipeDetailsFragment, RecipeReviewFragment } from "./fragments";
import {
  RECIPE_REVIEWS_PAGE_SIZE,
  RECIPE_VERSIONS_PAGE_SIZE,
  RecipePageQuery,
} from "./queries";
import { RecipeDetails } from "./RecipeDetails";

/** One recipe read per request, for the page and its title (X21). */
const loadRecipePage = cache((recipeId: string) =>
  apiServerQuery(RecipePageQuery, {
    recipeId,
    reviewFirst: RECIPE_REVIEWS_PAGE_SIZE,
    versionFirst: RECIPE_VERSIONS_PAGE_SIZE,
  }),
);

/** X21: the recipe's name as the document title. */
export async function recipePageMetadata(recipeId: string): Promise<Metadata> {
  const result = unwrapResult(
    (await loadRecipePage(recipeId)).recipe,
    "Recipe",
  );
  return {
    title: result.ok
      ? readFragment(RecipeDetailsFragment, result.data).name
      : "Recipe",
  };
}

/**
 * One recipe as `RecipeDetails`, read on the server — what the old detail page
 * and the old group page each did with their own Hasura query.
 *
 * `NotFoundError` covers "no such recipe" and "not yours to see" alike
 * (§1.6), so both are a 404; the old detail page printed "Recipe not found"
 * with a 200. `header` goes above the details (the group page's).
 */
export async function RecipePage({
  recipeId,
  header,
}: {
  recipeId: string;
  header?: ReactNode;
}) {
  const data = await loadRecipePage(recipeId);
  const result = unwrapResult(data.recipe, "Recipe");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <p className="type-body text-destructive">{result.error.message}</p>;
  }

  const group = result.data.recipeGroup ?? null;
  const recipe = {
    ...recipeDetailsFromNode(readFragment(RecipeDetailsFragment, result.data), {
      group,
      reviews: result.data.reviews.edges.map((edge) =>
        readFragment(RecipeReviewFragment, edge.node),
      ),
    }),
    // X14 / D9: the viewer's own verdict and Love, beside the fragment.
    is_loved: result.data.isLoved,
    makeability: result.data.makeability ?? null,
  };

  return (
    <>
      {header}
      <RecipeDetails
        // The recipe is the page's heading unless a header above it (a
        // group's name) already is.
        titleLevel={header === undefined ? "h1" : "h2"}
        recipe={recipe}
        viewerId={data.me?.id ?? null}
        isCanonical={
          group !== null &&
          group.recipeCount > 1 &&
          group.canonicalRecipeId === recipe.id
        }
        reviewsEndCursor={result.data.reviews.pageInfo.endCursor ?? null}
        reviewsHasNextPage={result.data.reviews.pageInfo.hasNextPage}
      />
    </>
  );
}
