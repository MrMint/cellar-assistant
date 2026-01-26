"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import { useCallback, useEffect, useState } from "react";
import { QUICK_ADD_AUTO_CONFIRM_DELAY } from "@/constants";

export type ItemType = "WINE" | "BEER" | "SPIRIT" | "COFFEE" | "SAKE";

export type QuickAddItemDefaults = {
  name?: string;
  description?: string;
  vintage?: string;
  country?: string;
  style?: string;
  variety?: string;
  region?: string;
  type?: string;
  roast_level?: string;
  category?: string;
};

type QuickAddCardProps = {
  defaults: QuickAddItemDefaults;
  itemType: ItemType;
  confidence: number;
  onConfirm: () => Promise<string | undefined>;
  onEdit: () => void;
  autoConfirmSeconds?: number;
};

function getConfidenceColor(
  confidence: number,
): "success" | "warning" | "danger" {
  if (confidence >= 0.9) return "success";
  if (confidence >= 0.7) return "warning";
  return "danger";
}

function getItemSummary(
  defaults: QuickAddItemDefaults,
  itemType: ItemType,
): string {
  const parts: string[] = [];

  switch (itemType) {
    case "WINE":
      if (defaults.vintage) parts.push(defaults.vintage);
      if (defaults.variety) parts.push(defaults.variety.replace(/_/g, " "));
      if (defaults.style) parts.push(defaults.style.replace(/_/g, " "));
      if (defaults.region) parts.push(defaults.region);
      if (defaults.country) parts.push(defaults.country.replace(/_/g, " "));
      break;
    case "BEER":
      if (defaults.style) parts.push(defaults.style.replace(/_/g, " "));
      if (defaults.country) parts.push(defaults.country.replace(/_/g, " "));
      break;
    case "SPIRIT":
      if (defaults.type) parts.push(defaults.type.replace(/_/g, " "));
      if (defaults.style) parts.push(defaults.style);
      if (defaults.country) parts.push(defaults.country.replace(/_/g, " "));
      break;
    case "COFFEE":
      if (defaults.roast_level)
        parts.push(defaults.roast_level.replace(/_/g, " "));
      if (defaults.country) parts.push(defaults.country.replace(/_/g, " "));
      break;
    case "SAKE":
      if (defaults.category) parts.push(defaults.category.replace(/_/g, " "));
      if (defaults.type) parts.push(defaults.type.replace(/_/g, " "));
      if (defaults.country) parts.push(defaults.country.replace(/_/g, " "));
      break;
  }

  return parts.join(" · ") || "No additional details";
}

export const QuickAddCard = ({
  defaults,
  itemType,
  confidence,
  onConfirm,
  onEdit,
  autoConfirmSeconds = QUICK_ADD_AUTO_CONFIRM_DELAY,
}: QuickAddCardProps) => {
  const [countdown, setCountdown] = useState(autoConfirmSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Handle confirm action
  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    setIsPaused(true);

    try {
      await onConfirm();
    } catch (error) {
      console.error("Failed to confirm quick add:", error);
      setIsConfirming(false);
      setIsPaused(false);
    }
  }, [isConfirming, onConfirm]);

  // Countdown timer logic
  useEffect(() => {
    if (isPaused || countdown <= 0 || isConfirming) return;

    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isPaused, isConfirming]);

  // Auto-confirm when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && !isPaused && !isConfirming) {
      handleConfirm();
    }
  }, [countdown, isPaused, isConfirming, handleConfirm]);

  // Pause countdown on any user interaction
  const handlePause = useCallback(() => {
    if (!isPaused) {
      setIsPaused(true);
    }
  }, [isPaused]);

  const progress = (countdown / autoConfirmSeconds) * 100;
  const confidencePercent = Math.round(confidence * 100);

  return (
    <Card
      variant="outlined"
      sx={{
        maxWidth: 400,
        mx: "auto",
      }}
      onMouseEnter={handlePause}
      onTouchStart={handlePause}
    >
      <CardContent>
        <Stack spacing={2}>
          {/* Header with name and confidence */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
          >
            <Typography level="title-lg" sx={{ flex: 1, mr: 1 }}>
              {defaults.name || "Unknown Item"}
            </Typography>
            <Chip
              color={getConfidenceColor(confidence)}
              size="sm"
              variant="soft"
            >
              {confidencePercent}% match
            </Chip>
          </Stack>

          {/* Item summary */}
          <Typography level="body-sm" color="neutral">
            {getItemSummary(defaults, itemType)}
          </Typography>

          {/* Description preview if available */}
          {defaults.description && (
            <Typography
              level="body-xs"
              color="neutral"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {defaults.description}
            </Typography>
          )}

          {/* Countdown progress */}
          {!isPaused && !isConfirming && (
            <Box>
              <LinearProgress
                determinate
                value={progress}
                color="primary"
                sx={{ height: 4, borderRadius: 2 }}
              />
              <Typography
                level="body-xs"
                color="neutral"
                textAlign="center"
                mt={0.5}
              >
                Adding in {countdown}s...
              </Typography>
            </Box>
          )}

          {isPaused && !isConfirming && (
            <Typography level="body-xs" color="neutral" textAlign="center">
              Auto-add paused
            </Typography>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={onEdit}
              disabled={isConfirming}
              sx={{ flex: 1 }}
            >
              Edit Details
            </Button>
            <Button
              variant="solid"
              color="primary"
              onClick={handleConfirm}
              loading={isConfirming}
              sx={{ flex: 1 }}
            >
              {isConfirming
                ? "Adding..."
                : isPaused
                  ? "Add to Cellar"
                  : `Add (${countdown}s)`}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};
