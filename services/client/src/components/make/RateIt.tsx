"use client";

import { useRef, useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { RatingInput } from "@/components/app/RatingInput";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { reviewTextForSave } from "@/components/recipe/adapter";
import {
  AddRecipeReviewMutation,
  UpdateRecipeReviewMutation,
} from "@/components/recipe/queries";
import type { OwnReview } from "@/components/recipe/review-plan";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";

type Saved = { score?: number; text?: string };

/**
 * Made it's "Rate it" card (Recipes-Make board, F-120): five stars that save
 * on the tap, and a quiet "Add a note" beside the title. Both write the
 * viewer's one review of the recipe (the API allows one per viewer): the
 * first write adds it under an id minted here, every later one updates that
 * id. Writes go one after another, so a quick second tap never lands before
 * the first. A refused write says so and puts the last saved value back.
 */
export function RateIt({
  recipeId,
  myReview,
}: {
  recipeId: string;
  myReview: OwnReview | null;
}) {
  const [, addReview] = useMutation(AddRecipeReviewMutation);
  const [, updateReview] = useMutation(UpdateRecipeReviewMutation);
  const reviewId = useRef(myReview?.id ?? crypto.randomUUID());
  const exists = useRef(myReview !== null);
  const saved = useRef<Saved>({
    score: myReview?.score,
    text: myReview?.text ?? undefined,
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [score, setScore] = useState<number | undefined>(myReview?.score);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState<string | undefined>(saved.current.text);
  const [savingNote, setSavingNote] = useState(false);

  const write = async (next: Saved): Promise<boolean> => {
    const input = { score: next.score ?? null, text: next.text ?? null };
    const result = exists.current
      ? unwrapResult(
          (
            await updateReview({
              recipeId,
              reviewId: reviewId.current,
              input,
            })
          ).data?.updateRecipeReview,
          "RecipeReview",
        )
      : unwrapResult(
          (
            await addReview({
              recipeId,
              input: { reviewId: reviewId.current, ...input },
            })
          ).data?.addRecipeReview,
          "RecipeReview",
        );
    if (!result.ok) {
      feedback("refuse");
      notify(`Couldn't save that: ${result.error.message}`, { tone: "error" });
      return false;
    }
    exists.current = true;
    saved.current = next;
    return true;
  };

  /** Runs `write` after every earlier one has settled. */
  const enqueue = (next: Saved): Promise<boolean> => {
    const run = queue.current.then(() => write(next));
    queue.current = run.catch(() => false);
    return run;
  };

  const rate = (value: number) => {
    setScore(value);
    void enqueue({ ...saved.current, score: value }).then((ok) => {
      if (!ok) setScore(saved.current.score);
    });
  };

  const saveNote = async () => {
    setSavingNote(true);
    const ok = await enqueue({
      score: saved.current.score,
      text: reviewTextForSave(draft),
    });
    setSavingNote(false);
    if (!ok) return;
    feedback("success");
    notify("Note saved");
    setNoteOpen(false);
  };

  const openNote = (open: boolean) => {
    if (savingNote) return;
    if (open) setDraft(saved.current.text);
    setNoteOpen(open);
  };

  const hasNote = saved.current.text !== undefined;

  return (
    <section
      aria-label="Rate it"
      className="flex flex-col gap-2 rounded-md border border-edge bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-head m-0 text-ink">Rate it</h2>
        <Button variant="quiet" onClick={() => openNote(true)}>
          {hasNote ? "Edit note" : "Add a note"}
        </Button>
      </div>
      <RatingInput value={score} onChange={rate} label="Rate it" />
      <ResponsiveDialog
        open={noteOpen}
        onOpenChange={openNote}
        title="Your note"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              className="text-ink-2"
              disabled={savingNote}
              onClick={() => openNote(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveNote()}
              disabled={savingNote || reviewTextForSave(draft) === undefined}
              aria-busy={savingNote || undefined}
            >
              {savingNote && <Spinner aria-hidden />}
              Save note
            </Button>
          </div>
        }
      >
        <RichTextEditor
          placeholder="How was it? Anything you changed?"
          onChange={setDraft}
          initialText={draft}
        />
      </ResponsiveDialog>
    </section>
  );
}
