"use client";

import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { RatingInput } from "@/components/app/RatingInput";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useRefreshAfterWrite } from "@/components/item/parts/pane-refresh";
import { Button } from "@/components/ui/button";
import {
  AddItemReviewMutation,
  DeleteItemReviewMutation,
  UpdateItemReviewMutation,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { RichTextEditor } from "../common/RichTextEditor";
import { plainTextFromRichText } from "../common/rich-text";
import { LoadingButton } from "../item/LoadingButton";

export type AddReviewProps = {
  itemId: string;
  type: ApiItemType;
  /**
   * `Item.myReview` (G7): the viewer's own review, which this form edits
   * rather than adding a second — the API allows one per viewer.
   */
  myReview?: {
    id: string;
    score: number;
    /** Serialized Lexical state, or null (`richTextFromReviewText`). */
    text: string | null;
  } | null;
};

/**
 * `82450ad1:src/components/review/AddReview.tsx`, restored.
 *
 * Six `{type}Id` props → one `itemId` + `type`; `addReviewAction` →
 * `addItemReview`. Three changes, each forced by the data and each listed in
 * the inventory (§7):
 *
 * - **A score is required.** `item_reviews.score` is NOT NULL (0.5–5 in half
 *   steps, which is exactly what the half-star `Rating` produces), and the old
 *   form let a text-only review through to fail. "Add" waits for a star.
 * - **One review per viewer.** A second `addItemReview` is a `ConflictError`,
 *   so a viewer who already reviewed opens their review pre-filled and saves
 *   with `updateItemReview`; "Delete" (`deleteItemReview`) is there too. The
 *   rewrite had both; the old form allowed unlimited reviews.
 * - The text is stored as the editor's serialized state, as before
 *   (`JSON.stringify(editorState)`), so old and new rows read the same way.
 */
export const AddReview = ({
  itemId,
  type,
  myReview = null,
}: AddReviewProps) => {
  const refreshAfterWrite = useRefreshAfterWrite();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // F-146 / F-147: the editor's draft. It is seeded from the saved review
  // each time the editor opens (`openEditor`), never once at mount, so it
  // follows every refresh (an Add, a Remove from ⋯ and its Undo) and an
  // abandoned edit (Cancel) is thrown away rather than carried to the next.
  const [score, setScore] = useState<number | undefined>(undefined);
  const [text, setText] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [, addReview] = useMutation(AddItemReviewMutation);
  const [, updateReview] = useMutation(UpdateItemReviewMutation);
  const [, deleteReview] = useMutation(DeleteItemReviewMutation);

  const editing = myReview !== null;

  const handleRatingClick = (rating: number) => {
    setScore(rating);
  };

  const canSubmit = score !== undefined && score > 0;

  const finish = () => {
    setOpen(false);
    refreshAfterWrite();
  };

  const handleClick = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      setError(null);
      if (myReview === null) {
        const result = unwrapResult(
          (
            await addReview({
              itemId,
              type,
              input: { reviewId: crypto.randomUUID(), score, text },
            })
          ).data?.addItemReview,
          "ItemReview",
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
      } else {
        const result = unwrapResult(
          (
            await updateReview({
              itemId,
              type,
              reviewId: myReview.id,
              input: { score, text },
            })
          ).data?.updateItemReview,
          "ItemReview",
        );
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
      }
      finish();
    });
  };

  const handleDelete = () => {
    if (myReview === null) return;
    startTransition(async () => {
      setError(null);
      const result = unwrapResult(
        (await deleteReview({ itemId, type, reviewId: myReview.id })).data
          ?.deleteItemReview,
        "DeletedItemReview",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      finish();
    });
  };

  const note =
    myReview?.text === null || myReview?.text === undefined
      ? ""
      : plainTextFromRichText(myReview.text).trim();
  const openEditor = () => {
    feedback("tick");
    setScore(myReview?.score);
    setText(myReview?.text ?? undefined);
    setError(null);
    setOpen(true);
  };
  // Button already sounds the press (KIT § 2); Cancel only closes, and the
  // draft is re-seeded on the next open.
  const cancel = () => setOpen(false);

  if (open === false) {
    // Cellars-Bottles 01: the rating and note sit under the photo — the
    // stars (gold: the owner's own verdict), the score beside them, the note,
    // then "Add note" / "Edit note". Tapping the stars opens the editor.
    return (
      <section
        id="your-review"
        data-testid="your-rating"
        aria-label="Your rating"
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openEditor}
            aria-label={editing ? "Change your rating" : "Rate it"}
            className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            <Stars value={myReview?.score ?? null} size="lg" />
          </button>
          {editing && (
            <span className="t-score tabular text-ink">
              {formatKitScore(myReview.score)}
            </span>
          )}
        </div>
        {note !== "" && (
          <p className="t-body line-clamp-4 whitespace-pre-line text-ink">
            {note}
          </p>
        )}
        <Button
          variant="quiet"
          className="-ml-2.5 self-start"
          onClick={openEditor}
        >
          {note === "" ? "Add note" : "Edit note"}
        </Button>
      </section>
    );
  }

  return (
    <section
      id="your-review"
      data-testid="your-rating"
      aria-label="Your rating"
      className="flex flex-col gap-3"
    >
      <RatingInput
        value={score}
        onChange={handleRatingClick}
        disabled={isPending}
        label="Your score"
      />
      <RichTextEditor
        placeholder="What did you think of it?"
        initialText={text}
        onChange={setText}
      />
      {error !== null && (
        <p role="alert" className="t-body text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          onClick={handleClick}
          disabled={!canSubmit}
          loading={isPending}
        >
          {editing ? "Save" : "Add"}
        </LoadingButton>
        <Button variant="outline" disabled={isPending} onClick={cancel}>
          Cancel
        </Button>
        {editing && (
          <Button
            variant="quiet-muted"
            className="ml-auto"
            disabled={isPending}
            onClick={handleDelete}
          >
            Remove rating
          </Button>
        )}
      </div>
    </section>
  );
};
