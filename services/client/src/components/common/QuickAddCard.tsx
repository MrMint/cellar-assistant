"use client";

import { type ReactNode, useCallback, useState } from "react";
import { AI } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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
  /** The read's confidence; no longer shown (kept for callers). */
  confidence: number;
  onConfirm: () => Promise<string | undefined>;
  onEdit: () => void;
  /** Retired with the countdown (B-223); kept so callers still compile. */
  autoConfirmSeconds?: number;
  /** A line above the name — "Is it this one?" when it names a known item. */
  heading?: string;
  /** The confirm button's words ("+1 bottle" if unset). */
  confirmLabel?: string;
  /** The quiet button's words (default "Not this"). */
  editLabel?: string;
  /**
   * The details line, when the caller already has it in words — the
   * catalogue item's own, for a known item — instead of one built from
   * `defaults`.
   */
  summary?: string;
  /**
   * Choices that belong to this add — X05's "Into" cellar row. Rendered
   * inside the card, so reaching for one pauses the countdown like any other
   * touch: the bottle is never filed under someone still choosing where.
   */
  children?: ReactNode;
};

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

/**
 * Quick add (Capture-Place 11, Add-bottle 12): the read names a known item,
 * so "+1 bottle" files another bottle of it with one tap. No countdown any
 * more (B-223 lost): nothing is filed until the person taps. "Not this" is
 * the quiet way to the draft. One primary on the card (CROSS-LOT 2).
 */
export const QuickAddCard = ({
  defaults,
  itemType,
  onConfirm,
  onEdit,
  heading,
  confirmLabel = "+1 bottle",
  editLabel = "Not this",
  summary,
  children,
}: QuickAddCardProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      // Says why and waits for another tap; never retries on its own.
      setIsConfirming(false);
      setError(
        cause instanceof Error ? cause.message : "The bottle wasn't added.",
      );
    }
  }, [isConfirming, onConfirm]);

  return (
    <section
      data-slot="quick-add"
      aria-label={heading ?? "Quick add"}
      className="mx-auto flex w-full max-w-[600px] flex-col gap-4 rounded-t-2xl bg-card p-4 shadow-pop md:rounded-2xl"
    >
      {heading !== undefined && (
        <h2 className="t-title m-0 text-ink">{heading}</h2>
      )}
      <p className="t-cap flex items-center gap-1.5 text-ink-2">
        <AI aria-hidden className="size-4" />
        Read from the label
      </p>
      <div className="flex flex-col gap-0.5 rounded-lg bg-raised p-3">
        <p className="t-head text-ink">{defaults.name || "Unknown item"}</p>
        {defaults.brand_name && (
          <p className="t-cap text-ink-2">{defaults.brand_name}</p>
        )}
        <p className="t-cap text-ink-2">
          {summary !== undefined && summary !== ""
            ? summary
            : getItemSummary(defaults, itemType)}
        </p>
      </div>

      {children}

      {error !== null && (
        <p role="alert" className="t-body text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="quiet-muted" onClick={onEdit} disabled={isConfirming}>
          {editLabel}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isConfirming}
          aria-busy={isConfirming || undefined}
          className="flex-1"
        >
          {isConfirming && <Spinner aria-hidden />}
          {confirmLabel}
        </Button>
      </div>
    </section>
  );
};
