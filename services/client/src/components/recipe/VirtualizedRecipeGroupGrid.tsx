"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecipeGroupCardData } from "./adapter";
import { RecipeGroupCard } from "./RecipeGroupCard";
import { RecipeGroupCardSkeleton } from "./RecipeGroupCardSkeleton";

export type VirtualizedRecipeGroupGridProps = {
  recipeGroups: RecipeGroupCardData[];
  onRecipeGroupSelect?: (groupId: string) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  itemsPerRow?: number;
  containerHeight?: number;
  itemHeight?: number;
  loadingItems?: number;
};

/**
 * `82450ad1:src/components/recipe/VirtualizedRecipeGroupGrid.tsx`, restored.
 * One fix: each card links to `/recipes/groups/{id}`. The old href put a
 * group id on the recipe route, so every card in production opened a 404.
 */
export const VirtualizedRecipeGroupGrid = memo<VirtualizedRecipeGroupGridProps>(
  ({
    recipeGroups,
    onRecipeGroupSelect,
    isLoading = false,
    hasMore = false,
    onLoadMore,
    itemsPerRow = 3,
    containerHeight = 600,
    itemHeight = 350,
    loadingItems = 6,
  }) => {
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // Calculate rows and total height
    const { totalRows, totalHeight } = useMemo(() => {
      const totalRows = Math.ceil(recipeGroups.length / itemsPerRow);
      const rows: RecipeGroupCardData[][] = [];

      for (let i = 0; i < totalRows; i++) {
        const start = i * itemsPerRow;
        const end = start + itemsPerRow;
        rows.push(recipeGroups.slice(start, end));
      }

      return {
        rows,
        totalRows,
        totalHeight: totalRows * itemHeight,
      };
    }, [recipeGroups, itemsPerRow, itemHeight]);

    // Calculate visible items based on scroll position
    const updateVisibleRange = useCallback(
      (scrollTop: number) => {
        const viewportHeight = containerHeight;
        const buffer = itemHeight * 2; // Buffer for smooth scrolling

        const startRow = Math.max(
          0,
          Math.floor((scrollTop - buffer) / itemHeight),
        );
        const endRow = Math.min(
          totalRows - 1,
          Math.ceil((scrollTop + viewportHeight + buffer) / itemHeight),
        );

        const start = startRow * itemsPerRow;
        const end = (endRow + 1) * itemsPerRow;

        setVisibleRange({ start, end });
      },
      [containerHeight, itemHeight, totalRows, itemsPerRow],
    );

    // Handle scroll with debouncing for performance
    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = event.currentTarget.scrollTop;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        updateVisibleRange(scrollTop);
      }, 16); // ~60fps

      // Load more when near bottom
      if (hasMore && onLoadMore && !isLoading) {
        const scrollHeight = event.currentTarget.scrollHeight;
        const clientHeight = event.currentTarget.clientHeight;
        const threshold = scrollHeight - clientHeight - 200; // 200px before bottom

        if (scrollTop >= threshold) {
          onLoadMore();
        }
      }
    };

    // Initialize visible range
    useEffect(() => {
      updateVisibleRange(0);
    }, [updateVisibleRange]);

    // Get visible recipe groups
    const visibleRecipeGroups = useMemo(() => {
      return recipeGroups.slice(visibleRange.start, visibleRange.end);
    }, [recipeGroups, visibleRange]);

    // Calculate spacer heights for virtual scrolling
    const topSpacerHeight =
      Math.floor(visibleRange.start / itemsPerRow) * itemHeight;
    const bottomSpacerHeight = Math.max(
      0,
      totalHeight -
        topSpacerHeight -
        Math.ceil(visibleRecipeGroups.length / itemsPerRow) * itemHeight,
    );

    return (
      <div
        ref={containerRef}
        className="overflow-auto [scrollbar-color:var(--ca-surface-3)_transparent] [scrollbar-width:thin]"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {/* Top spacer for virtual scrolling */}
        {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

        {/* Visible items */}
        <div className="grid grid-cols-1 gap-4 px-2 sm:grid-cols-2 md:grid-cols-3">
          {visibleRecipeGroups.map((recipeGroup) => (
            <RecipeGroupCard
              key={recipeGroup.id}
              recipeGroup={recipeGroup}
              href={`/recipes/groups/${recipeGroup.id}`}
              onClick={onRecipeGroupSelect}
            />
          ))}

          {/* Loading skeletons */}
          {isLoading && <RecipeGroupCardSkeleton count={loadingItems} />}
        </div>

        {/* Bottom spacer for virtual scrolling */}
        {bottomSpacerHeight > 0 && (
          <div style={{ height: bottomSpacerHeight }} />
        )}

        {/* End of list indicator */}
        {!hasMore && !isLoading && recipeGroups.length > 0 && (
          <p className="py-4 text-center type-callout text-ink-2">
            End of results • {recipeGroups.length} recipe groups
          </p>
        )}
      </div>
    );
  },
);

VirtualizedRecipeGroupGrid.displayName = "VirtualizedRecipeGroupGrid";
