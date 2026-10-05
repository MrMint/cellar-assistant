"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Button,
  Card,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { isEmpty, isNotNil, not } from "ramda";
import { useEffect } from "react";
import { Rating } from "react-simple-star-rating";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { Timestamp } from "../common/Timestamp";
import { UserAvatar } from "../common/UserAvatar";
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
    <Card sx={{ padding: "0" }}>
      <Typography level="title-lg" padding="1rem 0 0 1rem">
        Reviews:
      </Typography>
      {!hasReviews && (
        <Typography
          level="body-lg"
          padding="1rem"
          justifyContent="center"
          textAlign="center"
        >
          No reviews yet! Want to add one?
        </Typography>
      )}
      {hasReviews && (
        <AccordionGroup>
          {all.map((x) => (
            <Accordion key={x.id}>
              <AccordionSummary>
                <UserAvatar
                  avatarUrl={x.user.avatarUrl}
                  displayName={x.user.displayName}
                />
                <ListItemContent>
                  <Typography level="title-md">{x.user.displayName}</Typography>
                  <Rating
                    initialValue={x.score}
                    allowFraction
                    size={25}
                    readonly
                  />
                </ListItemContent>
                <Typography>
                  <Timestamp iso={x.created_at} precision="date" />
                </Typography>
              </AccordionSummary>
              {isNotNil(x.text) && (
                <AccordionDetails>
                  <RichTextDisplay text={x.text} />
                </AccordionDetails>
              )}
            </Accordion>
          ))}
        </AccordionGroup>
      )}
      {list.canLoadMore && recipeId !== undefined && (
        <Button
          variant="plain"
          color="neutral"
          loading={list.status === "loadingMore"}
          onClick={() => void list.loadMore()}
        >
          Show more reviews
        </Button>
      )}
      {list.failure !== null && (
        <Typography level="body-sm" color="danger" padding="0 1rem 1rem">
          {list.failure.message}
        </Typography>
      )}
    </Card>
  );
};
