"use client";

import { isNotNil } from "ramda";
import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { Stars } from "@/components/app/parts/Stars";
import { RatingInput } from "@/components/app/RatingInput";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { RichTextEditor } from "../common/RichTextEditor";
import { reviewTextForSave } from "./adapter";
import {
  AddRecipeReviewMutation,
  DeleteRecipeReviewMutation,
  UpdateRecipeReviewMutation,
} from "./queries";
import { QUIET_ACTION } from "./RecipePageParts";

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
  /** Whether anyone else has reviewed it: "No reviews yet" when not. */
  hasReviews?: boolean;
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
  hasReviews = true,
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

  const finish = (next: { score?: number; text?: string }) => {
    setOpen(false);
    onReviewAdded?.({ userId: viewerId ?? "", ...next });
  };

  /** A new review on this recipe, as the viewer: the API sets the author. */
  const add = async (input: { score?: number; text?: string }) =>
    unwrapResult(
      (
        await addReview({
          recipeId,
          input: {
            reviewId: crypto.randomUUID(),
            score: input.score ?? null,
            text: input.text ?? null,
          },
        })
      ).data?.addRecipeReview,
      "RecipeReview",
    );

  const handleSave = () => {
    if (!dirty) return;
    startTransition(async () => {
      setError(null);
      if (myReview === null) {
        const result = await add({ score, text: savedText });
        if (!result.ok) {
          setError(
            result.error.reason === "REVIEW_ALREADY_EXISTS"
              ? "You already reviewed this recipe."
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
      notify("Review saved");
      finish({ score, text: savedText });
    });
  };

  /**
   * Delete acts at once with Undo (KIT § 4 "Toast or confirm"): Undo adds
   * the same words and stars back, as a new review on this recipe.
   */
  const handleDelete = () => {
    if (myReview === null) return;
    const gone = {
      score: myReview.score,
      text: myReview.text ?? undefined,
    };
    startTransition(async () => {
      const result = unwrapResult(
        (await deleteReview({ recipeId, reviewId: myReview.id })).data
          ?.deleteRecipeReview,
        "DeletedRecipeReview",
      );
      if (!result.ok) {
        notify(`Couldn't delete it: ${result.error.message}`, {
          tone: "error",
        });
        return;
      }
      setScore(undefined);
      setText(undefined);
      notify("Review deleted", {
        undo: () => {
          void add(gone).then((back) => {
            if (back.ok) finish(gone);
            else notify("Couldn't bring it back", { tone: "error" });
          });
        },
      });
      finish({});
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setError(null);
      setScore(myReview?.score);
      setText(myReview?.text ?? undefined);
    }
  };

  return (
    <div data-slot="my-review" className="flex flex-col gap-2">
      {editing ? (
        <div className="flex flex-col gap-1">
          <div className="flex min-h-14 items-center gap-3">
            <UserAvatar displayName="You" />
            <span className="t-head min-w-0 flex-1 text-ink">You</span>
            {myReview.score !== undefined && (
              <Stars value={myReview.score} size="md" />
            )}
          </div>
          {isNotNil(myReview.text) && (
            <div className="t-body text-ink-2">
              <RichTextDisplay text={myReview.text} />
            </div>
          )}
          <div className="-ml-2 flex items-center gap-2">
            <button
              type="button"
              className={QUIET_ACTION}
              onClick={() => setOpen(true)}
              disabled={isPending}
            >
              Edit
            </button>
            <button
              type="button"
              className={QUIET_ACTION}
              onClick={handleDelete}
              disabled={isPending}
              aria-label="Delete your review"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-14 items-center gap-3">
          {!hasReviews && (
            <p className="t-cap m-0 min-w-0 flex-1 text-ink-2">
              No reviews yet
            </p>
          )}
          <Button
            variant="outline"
            className={hasReviews ? "self-start" : "ml-auto"}
            onClick={() => setOpen(true)}
          >
            Write a review
          </Button>
        </div>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={editing ? "Edit your review" : "Your review"}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              className="text-ink-2"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty || isPending}
              aria-busy={isPending || undefined}
            >
              {isPending && <Spinner aria-hidden />}
              Save review
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <RatingInput
            value={score}
            onChange={setScore}
            onClear={() => setScore(undefined)}
            disabled={isPending}
            label="Rate this recipe"
          />
          <RichTextEditor
            placeholder="How was it? Anything you changed?"
            onChange={setText}
            initialText={text}
          />
          {error !== null && (
            <p role="alert" className="t-cap m-0 text-danger">
              {error}
            </p>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
};
