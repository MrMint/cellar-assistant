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
import { useEffect } from "react";
import { Rating } from "react-simple-star-rating";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { Timestamp } from "../common/Timestamp";
import { UserAvatar } from "../common/UserAvatar";
import { reviewFromRow } from "./adapter";
import { ItemPageReviewFragment, ItemReviewsPageQuery } from "./fragments";

export type Review = {
  id: string;
  score?: number;
  user: {
    displayName: string;
    avatarUrl: string;
  };
  /** Serialized Lexical state (`richTextFromReviewText`), or null. */
  text?: string | null;
  createdAt: string;
};

export type ItemReviewsProps = {
  reviews: Review[];
  /** Paging, which the old list did not have: the first page is the server's. */
  itemId?: string;
  type?: ApiItemType;
  endCursor?: string | null;
  hasNextPage?: boolean;
};

/**
 * `82450ad1:src/components/item/ItemReviews.tsx`, restored.
 *
 * Author via `ItemReview.user` (G4). The date is `common/Timestamp` rather
 * than date-fns' `MM/dd/yyyy` — the hydration rule (`hydration-safety.test.ts`)
 * — so it reads in the viewer's own locale. Text goes through
 * `richTextFromReviewText` in the adapter, so migrated Lexical rows, the
 * rewrite's `{ body }` rows and plain strings all render (decision 6).
 *
 * Added: "Show more reviews". The old page fetched every review; the API pages
 * at 20, and a list that silently stops at 20 would be worse than either.
 */
export const ItemReviews = ({
  reviews,
  itemId,
  type,
  endCursor = null,
  hasNextPage = false,
}: ItemReviewsProps) => {
  const list = usePagedConnection({
    query: ItemReviewsPageQuery,
    variables: (args: { itemId: string; type: ApiItemType }, after) => ({
      itemId: args.itemId,
      type: args.type,
      after: after ?? "",
    }),
    select: (data) => {
      const result = unwrapResult(data?.item, "QueryItemSuccess");
      return pageOf(
        result.ok ? { ok: true, data: result.data.data.reviews } : result,
        (edge) =>
          reviewFromRow(readFragment(ItemPageReviewFragment, edge.node)),
      );
    },
    initial: { rows: reviews, endCursor, hasNextPage },
    initialArgs: { itemId: itemId ?? "", type: type ?? "WINE" },
  });

  // A `router.refresh()` after a review hands the server's new first page in.
  const { replace } = list;
  useEffect(() => {
    replace({ rows: reviews, endCursor, hasNextPage });
  }, [replace, reviews, endCursor, hasNextPage]);

  const all = list.rows;
  const hasReviews = all.length > 0;
  const canPage = itemId !== undefined && type !== undefined;

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
                  <Timestamp iso={x.createdAt} precision="date" />
                </Typography>
              </AccordionSummary>
              {x.text !== null && x.text !== undefined && (
                <AccordionDetails>
                  <RichTextDisplay text={x.text} />
                </AccordionDetails>
              )}
            </Accordion>
          ))}
        </AccordionGroup>
      )}
      {list.canLoadMore && canPage && (
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
