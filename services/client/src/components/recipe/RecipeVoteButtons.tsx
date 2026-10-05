"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from "@mui/joy";
import { useEffect, useRef, useState } from "react";
import { MdThumbDown, MdThumbUp } from "react-icons/md";
import { useMutation } from "urql";
import { breakpointDown, useMediaQuery } from "@/hooks/useMediaQuery";
import { unwrapResult } from "@/lib/api/result";
import { nextVoteState, type RecipeVoteType } from "./adapter";
import { RemoveRecipeVoteMutation, VoteOnRecipeMutation } from "./queries";

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
  const isMobile = useMediaQuery(breakpointDown("sm"));
  const isTablet = useMediaQuery(breakpointDown("md"));
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

  const buttonSize =
    actualSize === "sm" ? "sm" : actualSize === "lg" ? "lg" : "md";
  const iconSize = actualSize === "sm" ? 16 : actualSize === "lg" ? 24 : 20;

  if (actualOrientation === "vertical") {
    return (
      <Stack spacing={isCompact ? 0.5 : 1} alignItems="center">
        {/* Upvote */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isCompact ? 0.25 : 0.5,
          }}
        >
          <IconButton
            variant={optimisticVote === "upvote" ? "solid" : "outlined"}
            color={optimisticVote === "upvote" ? "success" : "neutral"}
            size={buttonSize}
            onClick={() => handleVote("upvote")}
            aria-label={`Upvote ${recipeName}`}
            disabled={isVoting}
          >
            {isVoting && optimisticVote === "upvote" ? (
              <CircularProgress size="sm" />
            ) : (
              <MdThumbUp size={iconSize} />
            )}
          </IconButton>
          {showCounts && !isCompact && (
            <Typography level="body-xs" sx={{ color: "success.500" }}>
              {optimisticUpvotes}
            </Typography>
          )}
        </Box>

        {/* Net Score */}
        {showCounts && (
          <Typography
            level={isCompact ? "body-xs" : "title-sm"}
            sx={{
              color:
                netScore > 0
                  ? "success.500"
                  : netScore < 0
                    ? "danger.500"
                    : "neutral.500",
              fontWeight: "bold",
              fontSize: isCompact ? "0.75rem" : undefined,
            }}
          >
            {netScore > 0 ? `+${netScore}` : netScore}
          </Typography>
        )}

        {/* Downvote */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isCompact ? 0.25 : 0.5,
          }}
        >
          <IconButton
            variant={optimisticVote === "downvote" ? "solid" : "outlined"}
            color={optimisticVote === "downvote" ? "danger" : "neutral"}
            size={buttonSize}
            onClick={() => handleVote("downvote")}
            aria-label={`Downvote ${recipeName}`}
            disabled={isVoting}
          >
            {isVoting && optimisticVote === "downvote" ? (
              <CircularProgress size="sm" />
            ) : (
              <MdThumbDown size={iconSize} />
            )}
          </IconButton>
          {showCounts && !isCompact && (
            <Typography level="body-xs" sx={{ color: "danger.500" }}>
              {optimisticDownvotes}
            </Typography>
          )}
        </Box>
      </Stack>
    );
  }

  // Compact horizontal layout for mobile
  if (isCompact) {
    return (
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{
          backgroundColor: "background.level1",
          borderRadius: "sm",
          p: 0.5,
          minWidth: "fit-content",
        }}
      >
        {/* Upvote */}
        <IconButton
          variant={optimisticVote === "upvote" ? "solid" : "plain"}
          color={optimisticVote === "upvote" ? "success" : "neutral"}
          size="sm"
          onClick={() => handleVote("upvote")}
          aria-label={`Upvote ${recipeName}`}
          disabled={isVoting}
          sx={{ minHeight: 32, minWidth: 32 }}
        >
          {isVoting && optimisticVote === "upvote" ? (
            <CircularProgress size="sm" />
          ) : (
            <MdThumbUp size={14} />
          )}
        </IconButton>

        {/* Net Score */}
        {showCounts && (
          <Typography
            level="body-xs"
            sx={{
              color:
                netScore > 0
                  ? "success.500"
                  : netScore < 0
                    ? "danger.500"
                    : "neutral.500",
              fontWeight: "bold",
              minWidth: "2ch",
              textAlign: "center",
              fontSize: "0.75rem",
            }}
          >
            {netScore > 0 ? `+${netScore}` : netScore}
          </Typography>
        )}

        {/* Downvote */}
        <IconButton
          variant={optimisticVote === "downvote" ? "solid" : "plain"}
          color={optimisticVote === "downvote" ? "danger" : "neutral"}
          size="sm"
          onClick={() => handleVote("downvote")}
          aria-label={`Downvote ${recipeName}`}
          disabled={isVoting}
          sx={{ minHeight: 32, minWidth: 32 }}
        >
          {isVoting && optimisticVote === "downvote" ? (
            <CircularProgress size="sm" />
          ) : (
            <MdThumbDown size={14} />
          )}
        </IconButton>
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={isTablet ? 0.5 : 1}
      alignItems="center"
      justifyContent="center"
      sx={{ flexWrap: isTablet ? "wrap" : "nowrap" }}
    >
      {/* Upvote */}
      <Button
        variant={optimisticVote === "upvote" ? "solid" : "outlined"}
        color={optimisticVote === "upvote" ? "success" : "neutral"}
        size={buttonSize}
        startDecorator={
          isVoting && optimisticVote === "upvote" ? (
            <CircularProgress size="sm" />
          ) : (
            <MdThumbUp size={iconSize} />
          )
        }
        onClick={() => handleVote("upvote")}
        aria-label={`Upvote ${recipeName}`}
        disabled={isVoting}
        sx={{
          minWidth: isTablet ? "fit-content" : undefined,
          px: isTablet ? 1 : undefined,
        }}
      >
        {showCounts && optimisticUpvotes}
      </Button>

      {/* Net Score */}
      {showCounts && (
        <Typography
          level={isTablet ? "body-sm" : "title-sm"}
          sx={{
            color:
              netScore > 0
                ? "success.500"
                : netScore < 0
                  ? "danger.500"
                  : "neutral.500",
            fontWeight: "bold",
            minWidth: isTablet ? "2ch" : "3ch",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {netScore > 0 ? `+${netScore}` : netScore}
        </Typography>
      )}

      {/* Downvote */}
      <Button
        variant={optimisticVote === "downvote" ? "solid" : "outlined"}
        color={optimisticVote === "downvote" ? "danger" : "neutral"}
        size={buttonSize}
        startDecorator={
          isVoting && optimisticVote === "downvote" ? (
            <CircularProgress size="sm" />
          ) : (
            <MdThumbDown size={iconSize} />
          )
        }
        onClick={() => handleVote("downvote")}
        aria-label={`Downvote ${recipeName}`}
        disabled={isVoting}
        sx={{
          minWidth: isTablet ? "fit-content" : undefined,
          px: isTablet ? 1 : undefined,
        }}
      >
        {showCounts && optimisticDownvotes}
      </Button>
    </Stack>
  );
};
