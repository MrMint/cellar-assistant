"use client";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from "@mui/joy";
import { useState } from "react";
import { MdThumbDown, MdThumbUp } from "react-icons/md";
import { removeVoteAction, voteRecipeAction } from "@/app/actions/recipes";
import { breakpointDown, useMediaQuery } from "@/hooks/useMediaQuery";

export type RecipeVoteButtonsProps = {
  recipeId: string;
  currentVote?: string | null;
  upvotes: number;
  downvotes: number;
  size?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical" | "auto";
  showCounts?: boolean;
  compact?: boolean;
};

export const RecipeVoteButtons = ({
  recipeId,
  currentVote,
  upvotes,
  downvotes,
  size = "md",
  orientation = "auto",
  showCounts = true,
  compact = false,
}: RecipeVoteButtonsProps) => {
  const isMobile = useMediaQuery(breakpointDown("sm"));
  const isTablet = useMediaQuery(breakpointDown("md"));

  // Auto-detect orientation based on screen size
  const actualOrientation =
    orientation === "auto"
      ? isMobile
        ? "horizontal"
        : "horizontal"
      : orientation;

  // Auto-adjust size for mobile
  const actualSize = isMobile && size === "md" ? "sm" : size;

  // Auto-enable compact mode on mobile
  const isCompact = compact || isMobile;
  const [isVoting, setIsVoting] = useState(false);
  const [optimisticVote, setOptimisticVote] = useState(currentVote);
  const [optimisticUpvotes, setOptimisticUpvotes] = useState(upvotes);
  const [optimisticDownvotes, setOptimisticDownvotes] = useState(downvotes);

  const handleVote = async (voteType: "upvote" | "downvote") => {
    if (isVoting) return;

    setIsVoting(true);

    // Optimistic updates
    const previousVote = optimisticVote;
    const previousUpvotes = optimisticUpvotes;
    const previousDownvotes = optimisticDownvotes;

    try {
      if (optimisticVote === voteType) {
        // Remove vote if clicking the same vote type
        setOptimisticVote(null);
        if (voteType === "upvote") {
          setOptimisticUpvotes((prev) => prev - 1);
        } else {
          setOptimisticDownvotes((prev) => prev - 1);
        }

        const result = await removeVoteAction(recipeId);

        if (!result.success) {
          throw new Error(result.error);
        }
      } else {
        // Add or change vote
        setOptimisticVote(voteType);

        if (previousVote === "upvote") {
          setOptimisticUpvotes((prev) => prev - 1);
        } else if (previousVote === "downvote") {
          setOptimisticDownvotes((prev) => prev - 1);
        }

        if (voteType === "upvote") {
          setOptimisticUpvotes((prev) => prev + 1);
        } else {
          setOptimisticDownvotes((prev) => prev + 1);
        }

        const result = await voteRecipeAction(recipeId, voteType);

        if (!result.success) {
          throw new Error(result.error);
        }
      }
    } catch (error) {
      // Revert optimistic updates on error
      setOptimisticVote(previousVote);
      setOptimisticUpvotes(previousUpvotes);
      setOptimisticDownvotes(previousDownvotes);
      console.error("Error voting:", error);
    } finally {
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
