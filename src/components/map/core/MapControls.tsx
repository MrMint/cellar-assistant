"use client";

import { Close, LocationOn, Refresh, Search } from "@mui/icons-material";
import { Box, Divider, IconButton, Input, Sheet, Stack } from "@mui/joy";
import { useEffect, useState } from "react";
import { useMapUI } from "../hooks/useMapMachine";
import { useMapSearchParams } from "../hooks/useMapSearchParams";
import { MapFilter } from "./MapFilter";

interface MapControlsProps {
  // Action props
  onRefresh: () => void;
  onLocationClick?: () => void;
  loading?: boolean;

  // Data props (for counts)
  counts?: {
    restaurants?: number;
    bars?: number;
    cafes?: number;
    breweries?: number;
    wineries?: number;
  };

  // Customization props
  variant?: "mobile" | "desktop" | "auto";
  showSearch?: boolean;
  showFilters?: boolean;
  showActions?: boolean;
  position?: {
    search?: "top-left" | "top-right" | "top-center";
    filters?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    actions?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
}

/**
 * XState-powered unified map controls component
 * - Uses XState hooks for all state management
 * - Automatically syncs with map machine state
 * - Optimized re-renders through granular selectors
 */
export function MapControls({
  onRefresh,
  onLocationClick,
  loading = false,
  counts,
  variant = "auto",
  showSearch = true,
  showFilters = true,
  showActions = true,
  position = {
    search: "top-left",
    filters: "top-right",
    actions: "top-right",
  },
}: MapControlsProps) {
  const [isMobile, setIsMobile] = useState(false);

  // URL-backed filter state via nuqs
  const {
    search,
    itemTypes,
    minRating,
    visitStatuses,
    setSearch,
    setItemTypes,
    setMinRating,
    setVisitStatuses,
  } = useMapSearchParams();
  const { isDrawerOpen } = useMapUI();

  // Detect mobile vs desktop for responsive layout
  useEffect(() => {
    if (variant === "auto") {
      const checkIsMobile = () => {
        setIsMobile(window.innerWidth < 768); // md breakpoint
      };

      checkIsMobile();
      window.addEventListener("resize", checkIsMobile);
      return () => window.removeEventListener("resize", checkIsMobile);
    } else {
      setIsMobile(variant === "mobile");
    }
  }, [variant]);

  // Helper function to get position styles
  const getPositionStyles = (pos: string) => {
    const positions = {
      "top-left": { top: 16, left: 16 },
      "top-right": { top: 16, right: 16 },
      "top-center": { top: 16, left: "50%", transform: "translateX(-50%)" },
      "bottom-left": { bottom: 16, left: 16 },
      "bottom-right": { bottom: 16, right: 16 },
    };
    return positions[pos as keyof typeof positions] || positions["top-left"];
  };

  // Search component
  const SearchControl = showSearch ? (
    <Box
      sx={{
        position: "absolute",
        zIndex: 1000,
        padding: isMobile ? 2 : 0,
        width: isMobile ? "calc(100% - 32px)" : 375,
        ...getPositionStyles(position.search || "top-left"),
      }}
    >
      <Sheet
        sx={{
          p: 1,
          borderRadius: "md",
          boxShadow: "md",
          backgroundColor: isDrawerOpen
            ? "rgba(255, 255, 255, 0.1)"
            : "background.surface",
          backdropFilter: isDrawerOpen ? "blur(8px)" : undefined,
          border: isDrawerOpen
            ? "1px solid rgba(255, 255, 255, 0.2)"
            : "1px solid",
          borderColor: isDrawerOpen ? "rgba(255, 255, 255, 0.2)" : "divider",
          "&:hover": {
            backgroundColor: isDrawerOpen
              ? "rgba(255, 255, 255, 0.15)"
              : "neutral.softBg",
          },
        }}
      >
        <Input
          placeholder="Search places, items, or descriptions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startDecorator={<Search />}
          endDecorator={
            search ? (
              <IconButton
                variant="plain"
                color="neutral"
                onClick={() => setSearch("")}
                size="sm"
                sx={{
                  minWidth: "auto",
                  minHeight: "auto",
                  padding: "4px",
                }}
              >
                <Close sx={{ fontSize: "18px" }} />
              </IconButton>
            ) : undefined
          }
          sx={{
            border: "none",
            boxShadow: "none",
            backgroundColor: "transparent",
            "&:hover": { backgroundColor: "transparent" },
            "&:focus-within": {
              backgroundColor: "transparent",
              borderColor: "primary.500",
              boxShadow: "none",
            },
          }}
          size="sm"
        />
      </Sheet>
    </Box>
  ) : null;

  // Filter and action controls
  const FilterAndActionControls =
    showFilters || showActions ? (
      <Box
        sx={{
          position: "absolute",
          zIndex: 1000,
          padding: isMobile ? 2 : 0,
          ...getPositionStyles(
            isMobile
              ? position.search || "top-left"
              : position.filters || "top-right",
          ),
          ...(isMobile && { top: 80 }), // Add spacing below search when stacked
        }}
      >
        <Sheet
          sx={{
            p: 1,
            borderRadius: "md",
            display: "flex",
            flexDirection: "row",
            gap: 1,
            alignItems: "center",
            boxShadow: "md",
            backgroundColor: "background.surface",
            overflow: "visible",
          }}
        >
          {showFilters && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                position: "relative",
                zIndex: 999,
              }}
            >
              <MapFilter
                selectedItemTypes={itemTypes}
                onItemTypesChange={setItemTypes}
                counts={counts}
                searchQuery={search}
                onSearchQueryChange={setSearch}
                minRating={minRating ?? undefined}
                onMinRatingChange={setMinRating}
                visitStatuses={visitStatuses}
                onVisitStatusesChange={setVisitStatuses}
              />

              {showActions && <Divider orientation="vertical" />}
            </Box>
          )}

          {showActions && (
            <Stack direction="row" spacing={1}>
              <IconButton
                variant="soft"
                color="neutral"
                onClick={onRefresh}
                loading={loading}
                size="sm"
                title="Refresh places"
              >
                <Refresh />
              </IconButton>

              {onLocationClick && (
                <IconButton
                  variant="soft"
                  color="neutral"
                  onClick={onLocationClick}
                  size="sm"
                  title="Go to my location"
                >
                  <LocationOn />
                </IconButton>
              )}
            </Stack>
          )}
        </Sheet>
      </Box>
    ) : null;

  return (
    <>
      {SearchControl}
      {FilterAndActionControls}
    </>
  );
}

/**
 * XState-powered preset configurations for common use cases
 */

// Minimal controls - just search and refresh
export function MinimalMapControls(
  props: Omit<MapControlsProps, "showFilters" | "showActions">,
) {
  return <MapControls {...props} showFilters={false} showActions={true} />;
}

// Filter-focused controls - filters and actions, minimal search
export function FilterMapControls(
  props: Omit<MapControlsProps, "showSearch" | "position">,
) {
  return (
    <MapControls
      {...props}
      showSearch={false}
      position={{
        filters: "top-right",
        actions: "top-right",
      }}
    />
  );
}

// Full-featured controls (default behavior)
export function FullMapControls(props: MapControlsProps) {
  return <MapControls {...props} />;
}

/**
 * Key differences from original UnifiedMapControls:
 *
 * 1. **No prop drilling**: State comes from XState hooks
 * 2. **Automatic optimization**: Granular selectors prevent unnecessary re-renders
 * 3. **Type safety**: XState ensures state transitions are valid
 * 4. **Consistent state**: All components share the same machine state
 * 5. **DevTools integration**: Built-in debugging with XState inspector
 *
 * Usage:
 * ```tsx
 * // Must be wrapped in MapMachineProvider
 * <MapMachineProvider userId={userId} urqlClient={client}>
 *   <UnifiedMapControlsXState
 *     onRefresh={handleRefresh}
 *     onLocationClick={handleLocation}
 *     loading={isLoading}
 *   />
 * </MapMachineProvider>
 * ```
 */
