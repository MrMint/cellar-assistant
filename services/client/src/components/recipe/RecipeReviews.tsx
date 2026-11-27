"use client";

import { isEmpty, isNotNil, not } from "ramda";
import { useEffect } from "react";
import { Stars } from "@/components/app/parts/Stars";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { Timestamp } from "../common/Timestamp";
import { type RecipeReview, reviewFromNode } from "./adapter";
import { RecipeReviewFragment } from "./fragments";
import { RECIPE_REVIEWS_PAGE_SIZE, RecipeReviewsPageQuery } from "./queries";

export type { RecipeReview };

export type RecipeReviewsProps = {
  reviews: RecipeReview[];
  /** Paging, which the old list did not have: the first page is the server's. */
  recipeId?: string;
  endCursor?: string | null;
  hasNextPage?: boolean;
  /** The viewer: their own review is drawn by `AddRecipeReview`, not here. */
  viewerId?: string | null;
};

/**
 * `82450ad1:src/components/recipe/RecipeReviews.tsx`, restored. It never
 * rendered a review in production — `recipe_reviews` had no Hasura
 * permission — so this is its first real data.
 *
 * Author via `RecipeReview.user` (G4). The date is `common/Timestamp` rather
 * than date-fns' `MM/dd/yyyy` (the hydration rule, as on the item page).
 * Text goes through `richTextFromReviewText`, so Lexical, `{ body }` and plain
 * rows all render (decision 6).
 *
 * Added: "Show more reviews". The API pages at 20; a list that silently
 * stopped at 20 would be worse than either the old page or the rewrite.
 */
export const RecipeReviews = ({
  reviews,
  recipeId,
  endCursor = null,
  hasNextPage = false,
  viewerId = null,
}: RecipeReviewsProps) => {
  const list = usePagedConnection({
    query: RecipeReviewsPageQuery,
    variables: (id: string, after) => ({
      recipeId: id,
      first: RECIPE_REVIEWS_PAGE_SIZE,
      after,
    }),
    select: (data) => {
      const result = unwrapResult(data?.recipe, "Recipe");
      return pageOf(
        result.ok ? { ok: true, data: result.data.reviews } : result,
        (edge) => reviewFromNode(readFragment(RecipeReviewFragment, edge.node)),
      );
    },
    initial: { rows: reviews, endCursor, hasNextPage },
    initialArgs: recipeId ?? "",
  });

  // A `router.refresh()` after a review hands the server's new first page in.
  const { replace } = list;
  useEffect(() => {
    replace({ rows: reviews, endCursor, hasNextPage });
  }, [replace, reviews, endCursor, hasNextPage]);

  const all = list.rows.filter((review) => review.userId !== viewerId);
  const hasReviews = not(isEmpty(all));

  if (!hasReviews && !list.canLoadMore && list.failure === null) return null;

  return (
    <ul data-slot="recipe-reviews" className="m-0 flex list-none flex-col p-0">
      {all.map((x) => (
        <li
          key={x.id}
          className="flex flex-col gap-1 border-hair border-b py-3 last:border-b-0"
        >
          <div className="flex min-h-11 items-center gap-3">
            <UserAvatar
              avatarUrl={x.user.avatarUrl}
              displayName={x.user.displayName}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="t-head truncate text-ink">
                {x.user.displayName}
              </span>
              <span className="t-cap text-ink-2">
                <Timestamp iso={x.created_at} precision="date" />
              </span>
            </span>
            {/* A text-only review has no score: no stars, rather than five
                empty ones reading as zero. Another person's stars are never
                gold (KIT § 2 Stars). */}
            {x.score !== undefined && (
              <Stars value={x.score} tone="other" size="md" />
            )}
          </div>
          {isNotNil(x.text) && (
            <div className="t-body text-ink-2">
              <RichTextDisplay text={x.text} />
            </div>
          )}
        </li>
      ))}
      {list.canLoadMore && recipeId !== undefined && (
        <li>
          <Button
            variant="ghost"
            disabled={list.status === "loadingMore"}
            aria-busy={list.status === "loadingMore" || undefined}
            onClick={() => void list.loadMore()}
          >
            {list.status === "loadingMore" && <Spinner aria-hidden />}
            Show more reviews
          </Button>
        </li>
      )}
      {list.failure !== null && (
        <li className="t-cap py-2 text-danger">{list.failure.message}</li>
      )}
    </ul>
  );
};
