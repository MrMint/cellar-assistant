"use client";

import {
  Close,
  DarkMode,
  Language,
  LightMode,
  LocationOn,
  Refresh,
  Search,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  IconButton,
  Input,
  Sheet,
  Stack,
  Tooltip,
} from "@mui/joy";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMapActions, useMapCore, useMapUI } from "../hooks/useMapMachine";
import { useMapSearchParams } from "../hooks/useMapSearchParams";
import { useTierListFilter } from "../hooks/useTierListFilter";
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
  const isMobileQuery = useMediaQuery("(max-width: 768px)");
  const isMobile = variant === "auto" ? isMobileQuery : variant === "mobile";

  // URL-backed filter state via nuqs
  const {
    search,
    itemTypes,
    minRating,
    visitStatuses,
    tierLists: tierListIds,
    globalSearch,
    setSearch,
    setItemTypes,
    setMinRating,
    setVisitStatuses,
    setTierLists,
    setGlobalSearch,
  } = useMapSearchParams();

  // Core state (userId needed for tier list query)
  const { userId, isDarkMode } = useMapCore();

  // Tier list filter data
  const {
    tierLists: tierListOptions,
    effectiveSelectedIds,
    isFilterActive: isTierListFilterActive,
    loading: tierListsLoading,
  } = useTierListFilter(tierListIds, userId);
  const { isDrawerOpen } = useMapUI();
  const { toggleDarkMode } = useMapActions();

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

  // Shared search input
  const SearchInput = (
    <Input
      placeholder={
        isMobile
          ? "Search places..."
          : "Search places, items, or descriptions..."
      }
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      startDecorator={<Search />}
      endDecorator={
        <Stack direction="row" spacing={0} sx={{ alignItems: "center" }}>
          {search && (
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
          )}
          <Tooltip
            title={globalSearch ? "Searching globally" : "Searching in viewport"}
            variant="soft"
            size="sm"
          >
            <IconButton
              variant={globalSearch ? "soft" : "plain"}
              color={globalSearch ? "primary" : "neutral"}
              onClick={() => setGlobalSearch(!globalSearch)}
              size="sm"
              sx={{
                minWidth: "auto",
                minHeight: "auto",
                padding: "4px",
              }}
            >
              <Language sx={{ fontSize: "18px" }} />
            </IconButton>
          </Tooltip>
        </Stack>
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
  );

  // Shared filter + action controls row
  const FilterAndActions = (showFilters || showActions) && (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: 1,
        alignItems: "center",
        flexWrap: isMobile ? "wrap" : "nowrap",
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
            minWidth: 0,
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
            tierLists={tierListOptions}
            selectedTierListIds={effectiveSelectedIds}
            onTierListsChange={setTierLists}
            tierListsLoading={tierListsLoading}
            isTierListFilterActive={isTierListFilterActive}
            isMobile={isMobile}
          />

          {showActions && <Divider orientation="vertical" />}
        </Box>
      )}

      {showActions && (
        <Stack direction="row" spacing={0.5}>
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

          <IconButton
            variant="soft"
            color="neutral"
            onClick={toggleDarkMode}
            size="sm"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <LightMode /> : <DarkMode />}
          </IconButton>
        </Stack>
      )}
    </Box>
  );

  // Mobile: single unified container with search + filters
  if (isMobile) {
    return (
      <Box
        sx={{
          position: "absolute",
          zIndex: 1000,
          top: 8,
          left: 8,
          right: 8,
        }}
      >
        <Sheet
          sx={{
            p: 1,
            borderRadius: "md",
            boxShadow: "md",
            backgroundColor: "background.surface",
            border: "1px solid",
            borderColor: "divider",
            overflow: "visible",
          }}
        >
          {showSearch && SearchInput}
          {(showFilters || showActions) && (
            <>
              {showSearch && <Divider sx={{ my: 0.5 }} />}
              {FilterAndActions}
            </>
          )}
        </Sheet>
      </Box>
    );
  }

  // Desktop: separate search and filter containers
  const SearchControl = showSearch ? (
    <Box
      sx={{
        position: "absolute",
        zIndex: 1001,
        width: "calc(50% - 24px)",
        maxWidth: 375,
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
        {SearchInput}
      </Sheet>
    </Box>
  ) : null;

  const FilterAndActionControls =
    showFilters || showActions ? (
      <Box
        sx={{
          position: "absolute",
          zIndex: 1000,
          ...getPositionStyles(position.filters || "top-right"),
        }}
      >
        <Sheet
          sx={{
            p: 1,
            borderRadius: "md",
            boxShadow: "md",
            backgroundColor: "background.surface",
            overflow: "visible",
          }}
        >
          {FilterAndActions}
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
