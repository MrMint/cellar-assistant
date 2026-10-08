"use client";

import { isEmpty, isNotNil, not } from "ramda";
import { useEffect } from "react";
import { RatingDisplay } from "@/components/app/RatingInput";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

  const all = list.rows;
  const hasReviews = not(isEmpty(all));

  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
      <p className="px-4 pt-4 type-headline">Reviews:</p>
      {!hasReviews && (
        <p className="p-4 text-center type-body">
          No reviews yet! Want to add one?
        </p>
      )}
      {hasReviews && (
        <Accordion type="multiple" className="divide-y divide-line">
          {all.map((x) => (
            <AccordionItem key={x.id} value={x.id} className="border-b-0">
              <AccordionTrigger className="min-h-11 items-center px-4 py-3 hover:no-underline hover:bg-accent/50 [&>svg]:translate-y-0">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <UserAvatar
                    avatarUrl={x.user.avatarUrl}
                    displayName={x.user.displayName}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate type-headline">
                      {x.user.displayName}
                    </span>
                    {/* A text-only review has no score: no stars, rather than five empty ones reading as zero. */}
                    {x.score !== undefined && (
                      <RatingDisplay value={x.score} size="md" />
                    )}
                  </span>
                  {/* One line beside the stars: "Oct 8, 2026" wrapped at 390px. */}
                  <span className="shrink-0 whitespace-nowrap type-callout text-ink-2">
                    <Timestamp iso={x.created_at} precision="date" />
                  </span>
                </span>
              </AccordionTrigger>
              {isNotNil(x.text) && (
                <AccordionContent className="px-4 type-body">
                  <RichTextDisplay text={x.text} />
                </AccordionContent>
              )}
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {list.canLoadMore && recipeId !== undefined && (
        <Button
          variant="ghost"
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
          onClick={() => void list.loadMore()}
        >
          {list.status === "loadingMore" && <Spinner aria-hidden />}
          Show more reviews
        </Button>
      )}
      {list.failure !== null && (
        <p className="px-4 pb-4 type-callout text-destructive">
          {list.failure.message}
        </p>
      )}
    </section>
  );
};
