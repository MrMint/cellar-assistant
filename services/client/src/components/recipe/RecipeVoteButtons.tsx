"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "urql";
import { ThumbsDown, ThumbsUp } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { nextVoteState, type RecipeVoteType } from "./adapter";
import { RemoveRecipeVoteMutation, VoteOnRecipeMutation } from "./queries";
import {
  undoWrite,
  type VoteWrite,
  voteToast,
  voteToastId,
  voteWrite,
} from "./vote-plan";

export type RecipeVoteButtonsProps = {
  recipeId: string;
  /** Votes live on the group: `voteOnRecipe(recipeGroupId, recipeId, …)`. */
  recipeGroupId: string;
  /** For the buttons' accessible names, `Upvote {name}` / `Downvote {name}`. */
  recipeName: string;
  currentVote?: RecipeVoteType | null;
  upvotes: number;
  downvotes: number;
  /** After a vote (or its Undo) commits — the page re-reads the tallies. */
  onVoted?: (result: { canonicalChanged: boolean }) => void;
  /** A vote that did not commit, with the server's reason. */
  onError?: (message: string) => void;
};

type Tally = {
  userVote: RecipeVoteType | null;
  upvotes: number;
  downvotes: number;
};

const net = (tally: Tally) => tally.upvotes - tally.downvotes;

/** "+1", "0", "−2" (a real minus, KIT § 4 Formatting). */
const netLabel = (value: number) =>
  value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0";

/**
 * A version's vote row (Recipes-Browse 16–20): outlined Up, the net score,
 * outlined Down. Your vote is the selected fill with `aria-pressed`; tapping
 * it again takes it back. Every vote says what it did in a toast with Undo
 * (teal, CROSS-LOT "Undo"), and Undo puts the vote back where it was
 * (`vote-plan.ts`). The arithmetic is optimistic, reverted on failure and
 * re-synced from props when the page's poll lands.
 */
export const RecipeVoteButtons = ({
  recipeId,
  recipeGroupId,
  recipeName,
  currentVote = null,
  upvotes,
  downvotes,
  onVoted,
  onError,
}: RecipeVoteButtonsProps) => {
  const [, voteOnRecipe] = useMutation(VoteOnRecipeMutation);
  const [, removeRecipeVote] = useMutation(RemoveRecipeVoteMutation);
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState<Tally>({
    userVote: currentVote,
    upvotes,
    downvotes,
  });
  const voting = useRef(false);

  // The page's poll (or its re-read after this vote) is the truth once it
  // lands; the optimistic numbers only bridge the round trip.
  useEffect(() => {
    if (voting.current) return;
    setTally({ userVote: currentVote, upvotes, downvotes });
  }, [currentVote, upvotes, downvotes]);

  const tallyAfter = (from: Tally, write: VoteWrite): Tally => {
    if (write.kind === "vote") {
      const next = nextVoteState(
        { ...from, netScore: net(from) },
        write.voteType,
      );
      return {
        userVote: next.userVote,
        upvotes: next.upvotes,
        downvotes: next.downvotes,
      };
    }
    // Removing: the same arithmetic as tapping the cast vote again.
    if (from.userVote === null) return from;
    const next = nextVoteState({ ...from, netScore: net(from) }, from.userVote);
    return {
      userVote: next.userVote,
      upvotes: next.upvotes,
      downvotes: next.downvotes,
    };
  };

  /** Sends one write; true when it committed. */
  const send = async (write: VoteWrite, from: Tally): Promise<boolean> => {
    voting.current = true;
    setBusy(true);
    setTally(tallyAfter(from, write));
    try {
      const result =
        write.kind === "remove"
          ? unwrapResult(
              (await removeRecipeVote({ recipeGroupId, recipeId })).data
                ?.removeRecipeVote,
              "RemovedRecipeVote",
            )
          : unwrapResult(
              (
                await voteOnRecipe({
                  recipeGroupId,
                  recipeId,
                  voteType: write.voteType,
                })
              ).data?.voteOnRecipe,
              "RecipeVotePayload",
            );
      if (!result.ok) throw new Error(result.error.message);
      onVoted?.({ canonicalChanged: result.data.canonicalChanged });
      return true;
    } catch (error) {
      setTally(from);
      feedback("refuse");
      onError?.(
        error instanceof Error ? error.message : "The vote was not recorded.",
      );
      return false;
    } finally {
      voting.current = false;
      setBusy(false);
    }
  };

  const handleVote = async (clicked: RecipeVoteType) => {
    if (voting.current) return;
    const before = tally;
    const write = voteWrite(before.userVote, clicked);
    if (!(await send(write, before))) return;
    const after = tallyAfter(before, write);
    const id = voteToastId(recipeId);
    notify(voteToast(write, recipeName), {
      id,
      undo: () => {
        void send(undoWrite(before.userVote), after).then((ok) => {
          if (ok) notify("Vote undone", { id });
        });
      },
    });
  };

  const button = (voteType: RecipeVoteType) => {
    const cast = tally.userVote === voteType;
    const Glyph = voteType === "upvote" ? ThumbsUp : ThumbsDown;
    return (
      <Button
        variant="outline"
        size="lg"
        className={cn("min-w-24", cast && "border-ink-3 bg-sel text-ink")}
        onClick={() => handleVote(voteType)}
        aria-label={`${voteType === "upvote" ? "Upvote" : "Downvote"} ${recipeName}`}
        aria-pressed={cast}
        disabled={busy}
        data-vote={voteType}
      >
        <Glyph aria-hidden />
        {voteType === "upvote" ? "Up" : "Down"}
      </Button>
    );
  };

  return (
    <div data-slot="recipe-vote" className="flex items-center gap-3">
      {button("upvote")}
      <span className="t-head tabular min-w-[3ch] text-center text-ink">
        <span className="sr-only">Net score </span>
        {netLabel(net(tally))}
      </span>
      {button("downvote")}
    </div>
  );
};
