"use client";

import { useEffect } from "react";
import { RatingDisplay } from "@/components/app/RatingInput";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { Timestamp } from "../common/Timestamp";
import { reviewFromRow } from "./adapter";
import { ItemPageReviewFragment, ItemReviewsPageQuery } from "./fragments";
import { ItemSection } from "./ItemSection";
import { LoadingButton } from "./LoadingButton";

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
    <ItemSection title="Reviews:">
      {!hasReviews && (
        <p className="type-body p-4 text-center text-ink-2">
          No reviews yet! Want to add one?
        </p>
      )}
      {hasReviews && (
        <Accordion type="multiple" className="-mx-4 border-line border-y">
          {all.map((x) => (
            <AccordionItem key={x.id} value={x.id} className="border-line px-4">
              <AccordionTrigger
                // A review without text has nothing to open.
                disabled={x.text === null || x.text === undefined}
                className="items-center py-3 hover:no-underline disabled:opacity-100"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <UserAvatar
                    avatarUrl={x.user.avatarUrl}
                    displayName={x.user.displayName}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="type-headline truncate text-ink-1">
                      {x.user.displayName}
                    </span>
                    <RatingDisplay value={x.score} size="md" />
                  </span>
                  {/* One line beside the stars: "Oct 8, 2026" wrapped at 390px. */}
                  <span className="type-callout shrink-0 whitespace-nowrap text-ink-2">
                    <Timestamp iso={x.createdAt} precision="date" />
                  </span>
                </span>
              </AccordionTrigger>
              {x.text !== null && x.text !== undefined && (
                <AccordionContent>
                  <RichTextDisplay text={x.text} />
                </AccordionContent>
              )}
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {list.canLoadMore && canPage && (
        <LoadingButton
          variant="ghost"
          loading={list.status === "loadingMore"}
          onClick={() => void list.loadMore()}
        >
          Show more reviews
        </LoadingButton>
      )}
      {list.failure !== null && (
        <p role="alert" className="type-callout text-destructive">
          {list.failure.message}
        </p>
      )}
    </ItemSection>
  );
};
