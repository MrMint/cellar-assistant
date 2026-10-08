"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { QUICK_ADD_AUTO_CONFIRM_DELAY } from "@/constants";
import { cn } from "@/lib/utils";

export type ItemType = "WINE" | "BEER" | "SPIRIT" | "COFFEE" | "SAKE" | "TEA";

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
  caffeine_level?: string;
  // Brand fields
  brand_id?: string;
  brand_name?: string;
  is_new_brand?: boolean;
};

type QuickAddCardProps = {
  defaults: QuickAddItemDefaults;
  itemType: ItemType;
  confidence: number;
  onConfirm: () => Promise<string | undefined>;
  onEdit: () => void;
  autoConfirmSeconds?: number;
  /** A line above the name — "Is it this one?" when it names a known item. */
  heading?: string;
  /** The confirm button's words; the old "Add to Cellar" / "Add (Ns)" if unset. */
  confirmLabel?: string;
  /** The secondary button's words (default "Edit Details"). */
  editLabel?: string;
  /**
   * The details line, when the caller already has it in words — the
   * catalogue item's own, for a known item — instead of one built from
   * `defaults`.
   */
  summary?: string;
};

/**
 * The match chip's tone: Joy's soft success / warning / danger. The tokens
 * have no amber, so the middle band is a neutral chip; danger is text and
 * outline (design §3.1), never a solid slab.
 */
function confidenceBadge(confidence: number): {
  variant: "secondary" | "destructive";
  className?: string;
} {
  if (confidence >= 0.9)
    return { variant: "secondary", className: "bg-success/15 text-success" };
  if (confidence >= 0.7)
    return { variant: "secondary", className: "bg-surface-3 text-ink-1" };
  return { variant: "destructive" };
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
    case "TEA":
      if (defaults.category) parts.push(defaults.category.replace(/_/g, " "));
      if (defaults.caffeine_level)
        parts.push(defaults.caffeine_level.replace(/_/g, " "));
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
  heading,
  confirmLabel,
  editLabel = "Edit Details",
  summary,
}: QuickAddCardProps) => {
  const [countdown, setCountdown] = useState(autoConfirmSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle confirm action
  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    setIsPaused(true);
    setError(null);

    try {
      await onConfirm();
    } catch (cause) {
      // Stays paused. The old card un-paused here, and with the countdown
      // already at 0 the auto-confirm effect fired again at once — a failed
      // save retried in a loop with nothing on screen. Now it says why and
      // waits for a click.
      setIsConfirming(false);
      setError(
        cause instanceof Error ? cause.message : "Failed to add the item.",
      );
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
  const badge = confidenceBadge(confidence);

  return (
    <Card
      className="mx-auto w-full max-w-[400px] gap-4 border-0 bg-surface-1 p-4 shadow-none"
      onMouseEnter={handlePause}
      onTouchStart={handlePause}
      // A keyboard reaching either button pauses it too, so the countdown
      // never files the item under someone still deciding (WCAG 2.2.1).
      onFocus={handlePause}
    >
      {heading !== undefined && (
        <p className="type-callout font-semibold text-ink-2">{heading}</p>
      )}
      {/* Header with name and confidence */}
      <div className="flex flex-row items-start justify-between">
        <h2 className="type-headline mr-2 flex-1">
          {defaults.name || "Unknown Item"}
        </h2>
        <Badge
          variant={badge.variant}
          className={cn("tabular", badge.className)}
        >
          {confidencePercent}% match
        </Badge>
      </div>

      {/* Brand info */}
      {defaults.brand_name && (
        <div className="flex flex-row items-center gap-2">
          <p className="type-body font-semibold">{defaults.brand_name}</p>
          {defaults.is_new_brand && (
            <Badge variant="secondary" className="bg-success/15 text-success">
              New
            </Badge>
          )}
        </div>
      )}

      {/* Item summary */}
      <p className="type-callout text-ink-2">
        {summary !== undefined && summary !== ""
          ? summary
          : getItemSummary(defaults, itemType)}
      </p>

      {/* Description preview if available */}
      {defaults.description && (
        <p className="type-footnote line-clamp-2">{defaults.description}</p>
      )}

      {/* Countdown progress */}
      {!isPaused && !isConfirming && (
        <div>
          <Progress
            value={progress}
            // `ui/progress` draws `value` but does not hand it to Radix's
            // root, which would leave the bar indeterminate to a screen
            // reader; Joy's determinate bar announced it.
            aria-valuenow={Math.round(progress)}
            aria-valuetext={`${countdown} seconds`}
            aria-label="Time until it is added"
            className="h-1"
          />
          <p className="type-footnote tabular mt-1 text-center">
            Adding in {countdown}s...
          </p>
        </div>
      )}

      {error !== null && (
        <p className="type-callout text-destructive">{error}</p>
      )}

      {isPaused && !isConfirming && error === null && (
        <p className="type-footnote text-center">Auto-add paused</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-row gap-4">
        <Button
          variant="outline"
          onClick={onEdit}
          disabled={isConfirming}
          className="flex-1"
        >
          {editLabel}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isConfirming}
          aria-busy={isConfirming || undefined}
          className="tabular flex-1"
        >
          {isConfirming && <Spinner aria-hidden />}
          {isConfirming
            ? "Adding..."
            : isPaused
              ? (confirmLabel ?? "Add to Cellar")
              : `${confirmLabel ?? "Add"} (${countdown}s)`}
        </Button>
      </div>
    </Card>
  );
};
