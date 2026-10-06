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
import { isNotNil } from "ramda";
import { useState, useTransition } from "react";
import { Rating } from "react-simple-star-rating";
import { useMutation } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { RichTextEditor } from "../common/RichTextEditor";
import { reviewTextForSave } from "./adapter";
import {
  AddRecipeReviewMutation,
  DeleteRecipeReviewMutation,
  UpdateRecipeReviewMutation,
} from "./queries";

export type AddRecipeReviewResult = {
  userId: string;
  score?: number;
  text?: string;
};

export type AddRecipeReviewProps = {
  recipeId: string;
  /** The signed-in viewer, for `onReviewAdded`'s old `userId`. */
  viewerId?: string | null;
  /**
   * The viewer's own review, which this form edits rather than adding a
   * second: the API allows one per viewer per recipe.
   */
  myReview?: {
    id: string;
    score?: number;
    /** Serialized Lexical state, or null. */
    text?: string | null;
  } | null;
  onReviewAdded?: (review: AddRecipeReviewResult) => void;
};

/**
 * `82450ad1:src/components/recipe/AddRecipeReview.tsx`, restored.
 * `addRecipeReviewAction` → `addRecipeReview`. In production the action
 * always failed (`recipe_reviews` had no insert permission); these are its
 * first writes.
 *
 * Kept from the old form: a review may be **text only**. Unlike
 * `item_reviews`, `RecipeReview.score` is nullable ("a text-only note"), so
 * the old dirty rule — a score *or* some text — is what the API accepts.
 *
 * Changed, because the API forces it: **one review per viewer**. A second
 * `addRecipeReview` is a `ConflictError` (`REVIEW_ALREADY_EXISTS`), so a viewer
 * who already reviewed opens theirs pre-filled and saves it with
 * `updateRecipeReview`, with a Delete beside it — the same shape the restored
 * item page uses. The text is stored as the editor's serialized state, as
 * before, so old and new rows read the same way.
 */
export const AddRecipeReview = ({
  recipeId,
  viewerId = null,
  myReview = null,
  onReviewAdded,
}: AddRecipeReviewProps) => {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | undefined>(myReview?.score);
  const [text, setText] = useState<string | undefined>(
    myReview?.text ?? undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [, addReview] = useMutation(AddRecipeReviewMutation);
  const [, updateReview] = useMutation(UpdateRecipeReviewMutation);
  const [, deleteReview] = useMutation(DeleteRecipeReviewMutation);

  const editing = myReview !== null;
  const savedText = reviewTextForSave(text);
  const dirty = isNotNil(score) || isNotNil(savedText);

  const finish = () => {
    setOpen(false);
    onReviewAdded?.({ userId: viewerId ?? "", score, text: savedText });
  };

  const handleClick = () => {
    if (dirty === true) {
      startTransition(async () => {
        setError(null);
        if (myReview === null) {
          const result = unwrapResult(
            (
              await addReview({
                recipeId,
                input: {
                  reviewId: crypto.randomUUID(),
                  score: score ?? null,
                  text: savedText ?? null,
                },
              })
            ).data?.addRecipeReview,
            "RecipeReview",
          );
          if (!result.ok) {
            setError(
              result.error.reason === "REVIEW_ALREADY_EXISTS"
                ? "You have already reviewed this recipe."
                : result.error.message,
            );
            return;
          }
          setScore(undefined);
          setText(undefined);
        } else {
          const result = unwrapResult(
            (
              await updateReview({
                recipeId,
                reviewId: myReview.id,
                input: { score: score ?? null, text: savedText ?? null },
              })
            ).data?.updateRecipeReview,
            "RecipeReview",
          );
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
        }
        finish();
      });
    }
  };

  const handleDelete = () => {
    if (myReview === null) return;
    startTransition(async () => {
      setError(null);
      const result = unwrapResult(
        (await deleteReview({ recipeId, reviewId: myReview.id })).data
          ?.deleteRecipeReview,
        "DeletedRecipeReview",
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

  const handleCancel = () => {
    setOpen(false);
    setError(null);
    setScore(myReview?.score);
    setText(myReview?.text ?? undefined);
  };

  if (open === false) {
    return (
      <Input
        placeholder={
          editing
            ? "Edit your review of this recipe..."
            : "Add a review for this recipe..."
        }
        onClick={() => setOpen(true)}
        slotProps={{ input: { readOnly: true } }}
        sx={{ cursor: "pointer" }}
      />
    );
  }

  return (
    <Card>
      <Stack spacing={2}>
        <Typography level="title-lg">
          {editing ? "Edit Recipe Review:" : "Add Recipe Review:"}
        </Typography>
        <CardContent>
          <Stack spacing={2}>
            <div>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Rate this recipe:
              </Typography>
              <Rating
                onClick={setScore}
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
                initialValue={score}
              />
            </div>

            <RichTextEditor
              placeholder="How was this recipe? Did you make any modifications?"
              onChange={setText}
              initialText={text}
            />
            {error !== null && (
              <Typography level="body-sm" color="danger">
                {error}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Stack>
      <CardActions>
        <Button
          onClick={handleClick}
          disabled={!dirty}
          loading={isPending}
          color="primary"
        >
          {editing ? "Save Review" : "Add Review"}
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
        <Button onClick={handleCancel} variant="outlined" disabled={isPending}>
          Cancel
        </Button>
      </CardActions>
    </Card>
  );
};
