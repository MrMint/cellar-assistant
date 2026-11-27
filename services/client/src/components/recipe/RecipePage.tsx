import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { ErrorState } from "@/components/app/EmptyState";
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
 * with a 200. The group page passes the line above the name (`eyebrow`) and
 * its pick card (`aside`).
 */
export async function RecipePage({
  recipeId,
  eyebrow,
  aside,
  parent,
}: {
  recipeId: string;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  parent?: string;
}) {
  const data = await loadRecipePage(recipeId);
  const result = unwrapResult(data.recipe, "Recipe");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <ErrorState
        title="Couldn't open this recipe"
        reason={result.error.message}
      />
    );
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
    <RecipeDetails
      titleLevel="h1"
      eyebrow={eyebrow}
      aside={aside}
      parent={parent}
      recipe={recipe}
      viewerId={data.me?.id ?? null}
      reviewsEndCursor={result.data.reviews.pageInfo.endCursor ?? null}
      reviewsHasNextPage={result.data.reviews.pageInfo.hasNextPage}
    />
  );
}
