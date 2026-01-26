"use client";

import { Box, Grid } from "@mui/joy";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RecipeGroupCard, type RecipeGroupCardData } from "./RecipeGroupCard";
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
    const { rows, totalRows, totalHeight } = useMemo(() => {
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
      <Box
        ref={containerRef}
        sx={{
          height: containerHeight,
          overflow: "auto",
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-track": {
            background: "neutral.100",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "neutral.400",
            borderRadius: "4px",
            "&:hover": {
              background: "neutral.500",
            },
          },
        }}
        onScroll={handleScroll}
      >
        {/* Top spacer for virtual scrolling */}
        {topSpacerHeight > 0 && <Box sx={{ height: topSpacerHeight }} />}

        {/* Visible items */}
        <Grid container spacing={2} sx={{ px: 1 }}>
          {visibleRecipeGroups.map((recipeGroup) => (
            <Grid key={recipeGroup.id} xs={12} sm={6} md={4}>
              <RecipeGroupCard
                recipeGroup={recipeGroup}
                href={`/recipes/${recipeGroup.id}`}
                onClick={onRecipeGroupSelect}
              />
            </Grid>
          ))}

          {/* Loading skeletons */}
          {isLoading &&
            Array.from({ length: loadingItems }).map((_, index) => (
              <Grid key={`loading-${index}`} xs={12} sm={6} md={4}>
                <RecipeGroupCardSkeleton />
              </Grid>
            ))}
        </Grid>

        {/* Bottom spacer for virtual scrolling */}
        {bottomSpacerHeight > 0 && <Box sx={{ height: bottomSpacerHeight }} />}

        {/* End of list indicator */}
        {!hasMore && !isLoading && recipeGroups.length > 0 && (
          <Box sx={{ textAlign: "center", py: 2, color: "text.secondary" }}>
            <Box sx={{ fontSize: "sm" }}>
              End of results • {recipeGroups.length} recipe groups
            </Box>
          </Box>
        )}
      </Box>
    );
  },
);

VirtualizedRecipeGroupGrid.displayName = "VirtualizedRecipeGroupGrid";
