"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { ThumbsDown, ThumbsUp } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { breakpointDown, useMediaQuery } from "@/hooks/useMediaQuery";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { nextVoteState, type RecipeVoteType } from "./adapter";
import { RemoveRecipeVoteMutation, VoteOnRecipeMutation } from "./queries";

/**
 * A cast vote is a tint plus text in its colour — success for up, danger for
 * down — never a solid green or red slab (design §3.1). `aria-pressed` says
 * which one is yours.
 *
 * Each colour is repeated under `dark:` because the `outline` and `ghost`
 * variants carry `dark:border-input dark:bg-input/30 dark:hover:bg-*`, and a
 * `dark:` utility sorts after a plain one: without the repeats the dark
 * theme (the default) drew a cast vote with no tint and no coloured border.
 */
const CAST = {
  upvote:
    "border-success/60 bg-success/10 text-success hover:bg-success/15 hover:text-success dark:border-success/60 dark:bg-success/10 dark:hover:bg-success/15",
  downvote:
    "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/60 dark:bg-destructive/10 dark:hover:bg-destructive/15",
} as const;

const scoreClass = (netScore: number) =>
  netScore > 0
    ? "text-success"
    : netScore < 0
      ? "text-destructive"
      : "text-ink-3";

export type RecipeVoteButtonsProps = {
  recipeId: string;
  /** Votes live on the group: `voteOnRecipe(recipeGroupId, recipeId, …)`. */
  recipeGroupId: string;
  /** For the buttons' accessible names, `Upvote {name}` / `Downvote {name}`. */
  recipeName: string;
  currentVote?: RecipeVoteType | null;
  upvotes: number;
  downvotes: number;
  size?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical" | "auto";
  showCounts?: boolean;
  compact?: boolean;
  /** After a vote commits — the page re-reads the tallies and the canonical. */
  onVoted?: (result: { canonicalChanged: boolean }) => void;
  /** A vote that did not commit, with the server's reason. */
  onError?: (message: string) => void;
};

/**
 * `82450ad1:src/components/recipe/RecipeVoteButtons.tsx`, restored. In
 * production `voteRecipeAction` always failed (`recipe_votes` had no
 * permission) and the counts it was handed were wrong (an unaliased
 * `votes_aggregate`, so downvotes were always 0). Now:
 *
 * - counts are `Recipe.upvotes` / `downvotes` and the marker is `myVote` (G27);
 * - `voteRecipeAction` / `removeVoteAction` → `voteOnRecipe` /
 *   `removeRecipeVote`, which address `(group, recipe)` and the viewer, never
 *   a user id;
 * - the optimistic arithmetic is the old `handleVote`'s (`nextVoteState`),
 *   reverted on failure, and re-synced from props when the page re-reads;
 * - the buttons carry `aria-label`s (`Upvote {name}`), which the old ones did
 *   not — their accessible name was a bare count.
 */
export const RecipeVoteButtons = ({
  recipeId,
  recipeGroupId,
  recipeName,
  currentVote = null,
  upvotes,
  downvotes,
  size = "md",
  orientation = "auto",
  showCounts = true,
  compact = false,
  onVoted,
  onError,
}: RecipeVoteButtonsProps) => {
  // Logic only: the compact layout and the smaller size below `sm`.
  const isMobile = useMediaQuery(breakpointDown("sm"));
  const [, voteOnRecipe] = useMutation(VoteOnRecipeMutation);
  const [, removeRecipeVote] = useMutation(RemoveRecipeVoteMutation);

  // Auto-detect orientation based on screen size
  const actualOrientation = orientation === "auto" ? "horizontal" : orientation;

  // Auto-adjust size for mobile
  const actualSize = isMobile && size === "md" ? "sm" : size;

  // Auto-enable compact mode on mobile
  const isCompact = compact || isMobile;
  const [isVoting, setIsVoting] = useState(false);
  const [optimisticVote, setOptimisticVote] = useState(currentVote);
  const [optimisticUpvotes, setOptimisticUpvotes] = useState(upvotes);
  const [optimisticDownvotes, setOptimisticDownvotes] = useState(downvotes);

  const voting = useRef(false);

  // The page's poll (or its re-read after this vote) is the truth once it
  // lands; the optimistic numbers only bridge the round trip. Re-synced when
  // the props change, never merely because a vote finished — that would put
  // the pre-vote numbers back until the re-read arrives.
  useEffect(() => {
    if (voting.current) return;
    setOptimisticVote(currentVote);
    setOptimisticUpvotes(upvotes);
    setOptimisticDownvotes(downvotes);
  }, [currentVote, upvotes, downvotes]);

  const handleVote = async (voteType: RecipeVoteType) => {
    if (isVoting) return;

    voting.current = true;
    setIsVoting(true);

    // Optimistic updates
    const previous = {
      userVote: optimisticVote,
      upvotes: optimisticUpvotes,
      downvotes: optimisticDownvotes,
      netScore: optimisticUpvotes - optimisticDownvotes,
    };
    const next = nextVoteState(previous, voteType);
    setOptimisticVote(next.userVote);
    setOptimisticUpvotes(next.upvotes);
    setOptimisticDownvotes(next.downvotes);

    try {
      let canonicalChanged: boolean;
      if (previous.userVote === voteType) {
        // Remove vote if clicking the same vote type
        const result = unwrapResult(
          (await removeRecipeVote({ recipeGroupId, recipeId })).data
            ?.removeRecipeVote,
          "RemovedRecipeVote",
        );
        if (!result.ok) throw new Error(result.error.message);
        canonicalChanged = result.data.canonicalChanged;
      } else {
        // Add or change vote
        const result = unwrapResult(
          (await voteOnRecipe({ recipeGroupId, recipeId, voteType })).data
            ?.voteOnRecipe,
          "RecipeVotePayload",
        );
        if (!result.ok) throw new Error(result.error.message);
        canonicalChanged = result.data.canonicalChanged;
      }
      onVoted?.({ canonicalChanged });
    } catch (error) {
      // Revert optimistic updates on error
      setOptimisticVote(previous.userVote);
      setOptimisticUpvotes(previous.upvotes);
      setOptimisticDownvotes(previous.downvotes);
      onError?.(
        error instanceof Error ? error.message : "The vote was not recorded.",
      );
    } finally {
      voting.current = false;
      setIsVoting(false);
    }
  };

  const netScore = optimisticUpvotes - optimisticDownvotes;

  const iconButtonSize =
    actualSize === "sm" ? "sm" : actualSize === "lg" ? "lg" : "default";
  const buttonSize =
    actualSize === "sm" ? "sm" : actualSize === "lg" ? "lg" : "default";
  const iconClass =
    actualSize === "sm" ? "size-4" : actualSize === "lg" ? "size-6" : "size-5";
  const formattedNet = netScore > 0 ? `+${netScore}` : netScore;

  const glyph = (voteType: RecipeVoteType, className: string) =>
    isVoting && optimisticVote === voteType ? (
      <Spinner aria-hidden className={className} />
    ) : voteType === "upvote" ? (
      <ThumbsUp aria-hidden className={className} />
    ) : (
      <ThumbsDown aria-hidden className={className} />
    );

  if (actualOrientation === "vertical") {
    return (
      <div
        className={cn(
          "flex flex-col items-center",
          isCompact ? "gap-1" : "gap-2",
        )}
      >
        {/* Upvote */}
        <div
          className={cn(
            "flex flex-col items-center",
            isCompact ? "gap-0.5" : "gap-1",
          )}
        >
          <IconButton
            variant="outline"
            size={iconButtonSize}
            className={cn(optimisticVote === "upvote" && CAST.upvote)}
            onClick={() => handleVote("upvote")}
            aria-label={`Upvote ${recipeName}`}
            aria-pressed={optimisticVote === "upvote"}
            disabled={isVoting}
          >
            {glyph("upvote", iconClass)}
          </IconButton>
          {showCounts && !isCompact && (
            <span className="tabular type-footnote text-success">
              {optimisticUpvotes}
            </span>
          )}
        </div>

        {/* Net Score */}
        {showCounts && (
          <span
            className={cn(
              "tabular font-bold",
              isCompact ? "text-xs" : "type-callout font-bold",
              scoreClass(netScore),
            )}
          >
            {formattedNet}
          </span>
        )}

        {/* Downvote */}
        <div
          className={cn(
            "flex flex-col items-center",
            isCompact ? "gap-0.5" : "gap-1",
          )}
        >
          <IconButton
            variant="outline"
            size={iconButtonSize}
            className={cn(optimisticVote === "downvote" && CAST.downvote)}
            onClick={() => handleVote("downvote")}
            aria-label={`Downvote ${recipeName}`}
            aria-pressed={optimisticVote === "downvote"}
            disabled={isVoting}
          >
            {glyph("downvote", iconClass)}
          </IconButton>
          {showCounts && !isCompact && (
            <span className="tabular type-footnote text-destructive">
              {optimisticDownvotes}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Compact horizontal layout for mobile
  if (isCompact) {
    return (
      <div className="flex w-fit items-center gap-1 self-center rounded-md bg-surface-2 p-1">
        {/* Upvote */}
        <IconButton
          variant="ghost"
          size="sm"
          className={cn(
            "border border-transparent",
            optimisticVote === "upvote" && CAST.upvote,
          )}
          onClick={() => handleVote("upvote")}
          aria-label={`Upvote ${recipeName}`}
          aria-pressed={optimisticVote === "upvote"}
          disabled={isVoting}
        >
          {glyph("upvote", "size-3.5")}
        </IconButton>

        {/* Net Score */}
        {showCounts && (
          <span
            className={cn(
              "tabular min-w-[2ch] text-center font-bold text-xs",
              scoreClass(netScore),
            )}
          >
            {formattedNet}
          </span>
        )}

        {/* Downvote */}
        <IconButton
          variant="ghost"
          size="sm"
          className={cn(
            "border border-transparent",
            optimisticVote === "downvote" && CAST.downvote,
          )}
          onClick={() => handleVote("downvote")}
          aria-label={`Downvote ${recipeName}`}
          aria-pressed={optimisticVote === "downvote"}
          disabled={isVoting}
        >
          {glyph("downvote", "size-3.5")}
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 md:flex-nowrap md:gap-2">
      {/* Upvote */}
      <Button
        variant="outline"
        size={buttonSize}
        className={cn(
          "tabular min-w-fit px-2 md:px-4",
          optimisticVote === "upvote" && CAST.upvote,
        )}
        onClick={() => handleVote("upvote")}
        aria-label={`Upvote ${recipeName}`}
        aria-pressed={optimisticVote === "upvote"}
        disabled={isVoting}
      >
        {glyph("upvote", iconClass)}
        {showCounts && optimisticUpvotes}
      </Button>

      {/* Net Score */}
      {showCounts && (
        <span
          className={cn(
            "tabular min-w-[2ch] shrink-0 text-center font-bold type-callout md:min-w-[3ch]",
            scoreClass(netScore),
          )}
        >
          {formattedNet}
        </span>
      )}

      {/* Downvote */}
      <Button
        variant="outline"
        size={buttonSize}
        className={cn(
          "tabular min-w-fit px-2 md:px-4",
          optimisticVote === "downvote" && CAST.downvote,
        )}
        onClick={() => handleVote("downvote")}
        aria-label={`Downvote ${recipeName}`}
        aria-pressed={optimisticVote === "downvote"}
        disabled={isVoting}
      >
        {glyph("downvote", iconClass)}
        {showCounts && optimisticDownvotes}
      </Button>
    </div>
  );
};
