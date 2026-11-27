"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import { Close, ICON_STROKE, Place } from "@/components/app/icons";
import { pressFeedback } from "@/components/app/overlays/press";
import { Score } from "@/components/app/Score";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { spring, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ViewportInsets } from "../hooks/useViewportInsets";
import type { ItemType, PlaceResult, SemanticPlaceResult } from "../types";
import { MOBILE_NAV_HEIGHT, SIDEBAR_WIDTH } from "../utils/layout";
import { PlaceReviewBadge } from "./PlaceReviewBadge";
import { formatCategoryName } from "./place-utils";

interface SearchResultsListProps {
  results: SemanticPlaceResult[];
  searchQuery: string;
  isLoading: boolean;
  onPlaceSelect: (place: PlaceResult) => void;
  onCenterOnPlace: (place: PlaceResult) => void;
  onClose: () => void;
  isDetailOpen?: boolean;
  /**
   * The map's distance from the viewport's left and bottom edges (the side
   * rail, the tab bar); measured by `MapLibreRenderer`. Until it is, the old
   * shell's 56 px rail and 50 px bar.
   */
  insets?: ViewportInsets | null;
}

/** The result's leading rule, in its strongest item type's colour. */
const TYPE_RULE: Record<ItemType, string> = {
  wine: "border-l-type-wine",
  beer: "border-l-type-beer",
  spirit: "border-l-type-spirit",
  sake: "border-l-type-sake",
  coffee: "border-l-type-coffee",
  tea: "border-l-type-tea",
};

function getMostRelevantItemType(
  itemTypeScores?: Record<ItemType, number>,
): ItemType | null {
  if (!itemTypeScores) return null;
  const entries = Object.entries(itemTypeScores);
  if (entries.length === 0) return null;
  const best = entries.reduce((prev, current) =>
    Number(current[1]) > Number(prev[1]) ? current : prev,
  );
  return Number(best[1]) > 0 ? (best[0] as ItemType) : null;
}

function ResultsHeader({
  searchQuery,
  count,
  isLoading,
  onClose,
  desktop,
}: {
  searchQuery: string;
  count: number;
  isLoading: boolean;
  onClose: () => void;
  desktop: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          desktop ? "mb-2" : "mb-1",
        )}
      >
        <h2
          className={cn(
            "min-w-0 flex-1 truncate",
            desktop ? "t-title" : "t-head",
          )}
        >
          {searchQuery}
        </h2>
        <IconButton
          aria-label="Close search results"
          variant="secondary"
          size="sm"
          onClick={onClose}
        >
          <Close />
        </IconButton>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="tabular">
          {count} result{count !== 1 ? "s" : ""}
        </Badge>
        {isLoading && <Spinner className="text-ink-2" />}
      </div>
    </>
  );
}

export function SearchResultsList({
  results,
  searchQuery,
  isLoading,
  onPlaceSelect,
  onCenterOnPlace,
  onClose,
  isDetailOpen = false,
  insets,
}: SearchResultsListProps) {
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");
  const leftInset = insets?.left ?? (hasSidebar ? SIDEBAR_WIDTH : 0);
  const bottomInset = insets?.bottom ?? MOBILE_NAV_HEIGHT;

  // Swipe-down-to-dismiss state for mobile drag handle
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const handleDragTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
    setDragOffset(0);
  }, []);

  const handleDragTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    // Only allow downward drag
    setDragOffset(Math.max(0, delta));
  }, []);

  const handleDragTouchEnd = useCallback(() => {
    if (dragOffset > 80) {
      onClose();
    }
    dragStartYRef.current = null;
    setDragOffset(0);
  }, [dragOffset, onClose]);

  const handleResultClick = (place: SemanticPlaceResult) => {
    onCenterOnPlace(place);
    onPlaceSelect(place);
  };

  const transition = { ...spring.sheet, opacity: tween("short") };

  if (isDesktop) {
    return (
      <AnimatePresence>
        <motion.section
          key="desktop"
          aria-label="Search results"
          initial={{ x: -400, opacity: 0 }}
          animate={
            isDetailOpen ? { x: -20, opacity: 0.4 } : { x: 0, opacity: 1 }
          }
          exit={{ x: -400, opacity: 0 }}
          transition={transition}
          className={cn(
            "fixed top-0 z-[949] flex h-dvh w-[400px] flex-col border-rule border-r bg-background shadow-xl",
            isDetailOpen ? "pointer-events-none" : "pointer-events-auto",
          )}
          style={{ left: leftInset }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 border-rule border-b px-6 pt-20 pb-4">
            <ResultsHeader
              searchQuery={searchQuery}
              count={results.length}
              isLoading={isLoading}
              onClose={onClose}
              desktop
            />
          </div>

          {/* Results list */}
          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
            {results.map((place) => (
              <li key={place.id}>
                <ResultCard
                  place={place}
                  onClick={() => handleResultClick(place)}
                />
              </li>
            ))}
          </ul>
        </motion.section>
      </AnimatePresence>
    );
  }

  // Mobile: bottom sheet
  return (
    <AnimatePresence>
      <motion.section
        key="mobile"
        aria-label="Search results"
        initial={{ y: "100%", opacity: 0 }}
        animate={
          isDetailOpen ? { y: 40, opacity: 0.5 } : { y: dragOffset, opacity: 1 }
        }
        exit={{ y: "100%", opacity: 0 }}
        transition={transition}
        className={cn(
          "fixed inset-x-0 z-[1099] flex h-[50vh] flex-col rounded-t-lg bg-background shadow-[0_-8px_32px_black] shadow-black/15",
          isDetailOpen ? "pointer-events-none" : "pointer-events-auto",
        )}
        style={{ bottom: bottomInset }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          aria-hidden
          onTouchStart={handleDragTouchStart}
          onTouchMove={handleDragTouchMove}
          onTouchEnd={handleDragTouchEnd}
          className="flex w-full shrink-0 cursor-grab touch-none justify-center py-2"
        >
          <div
            className={cn(
              "h-[5px] w-12 rounded-[3px] transition-colors duration-(--ca-dur-short) ease-standard",
              dragOffset > 0 ? "bg-ink-2" : "bg-ink-3",
            )}
          />
        </div>

        {/* Header */}
        <div className="shrink-0 border-rule border-b px-4 pb-3">
          <ResultsHeader
            searchQuery={searchQuery}
            count={results.length}
            isLoading={isLoading}
            onClose={onClose}
            desktop={false}
          />
        </div>

        {/* Results list */}
        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
          {results.map((place) => (
            <li key={place.id}>
              <ResultCard
                place={place}
                compact
                onClick={() => handleResultClick(place)}
              />
            </li>
          ))}
        </ul>
      </motion.section>
    </AnimatePresence>
  );
}

function ResultCard({
  place,
  compact,
  onClick,
}: {
  place: SemanticPlaceResult;
  compact?: boolean;
  onClick: () => void;
}) {
  const itemType = getMostRelevantItemType(place.itemTypeScores);
  const token = itemType
    ? itemTypeTokens[itemType.toUpperCase() as Uppercase<ItemType>]
    : null;

  return (
    <button
      type="button"
      {...pressFeedback()}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md bg-surface-1 text-left outline-none transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        compact ? "p-3" : "p-4",
        itemType && ["border-l-[3px]", TYPE_RULE[itemType]],
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-sm p-1.5",
          token
            ? [token.tintClass, token.textClass]
            : "bg-surface-3 text-ink-2",
        )}
      >
        <Place
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={compact ? "size-[18px]" : "size-5"}
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "mb-0.5 truncate text-ink",
            compact ? "t-body font-semibold" : "t-head",
          )}
        >
          {place.name}
        </span>

        {/* X27: the viewer's own place under review, found by its name */}
        <PlaceReviewBadge status={place.review_status} className="mb-1" />

        <span className="mb-1 flex items-center gap-2">
          {place.rating ? (
            <Score value={place.rating} className="t-cap" />
          ) : null}
          <span className="t-cap truncate">
            {formatCategoryName(
              place.primary_category || place.categories?.[0] || "",
            )}
          </span>
        </span>

        {place.street_address && (
          <span className="t-cap truncate text-ink-2">
            {place.street_address}
            {place.locality && `, ${place.locality}`}
          </span>
        )}
      </span>
    </button>
  );
}
