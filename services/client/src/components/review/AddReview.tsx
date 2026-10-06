"use client";

import {
  Button,
  Card,
  CardActions,
  CardContent,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Rating } from "react-simple-star-rating";
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  AddItemReviewMutation,
  DeleteItemReviewMutation,
  UpdateItemReviewMutation,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { RichTextEditor } from "../common/RichTextEditor";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | undefined>(myReview?.score);
  const [text, setText] = useState<string | undefined>(
    myReview?.text ?? undefined,
  );
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
    router.refresh();
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
        setScore(undefined);
        setText(undefined);
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
      setScore(undefined);
      setText(undefined);
      finish();
    });
  };

  if (open === false) {
    return (
      <Input
        placeholder={editing ? "Edit your Review..." : "Add a Review..."}
        onClick={() => setOpen(true)}
        slotProps={{ input: { readOnly: true } }}
      />
    );
  }

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="title-lg">
          {editing ? "Edit Review:" : "Add Review:"}
        </Typography>
        <CardContent>
          <Rating
            onClick={handleRatingClick}
            initialValue={score ?? 0}
            showTooltip
            tooltipDefaultText="Your Score"
            allowFraction
            tooltipArray={[
              "Terrible",
              "Bad",
              "Bad+",
              "Mediocre",
              "Mediocre+",
              "Good",
              "Good+",
              "Very Good",
              "Very Good+",
              "Outstanding",
            ]}
            readonly={isPending}
          />
        </CardContent>
        <RichTextEditor
          placeholder="What did you think of it?"
          initialText={text}
          onChange={setText}
        />
        {error !== null && (
          <Typography level="body-sm" color="danger">
            {error}
          </Typography>
        )}
      </Stack>
      <CardActions>
        <Button onClick={handleClick} disabled={!canSubmit} loading={isPending}>
          {editing ? "Save" : "Add"}
        </Button>
        {editing && (
          <Button
            variant="plain"
            color="danger"
            disabled={isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        )}
      </CardActions>
    </Card>
  );
};
