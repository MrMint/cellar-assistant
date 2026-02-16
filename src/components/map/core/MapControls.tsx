"use client";

import {
  MdAddLocationAlt,
  MdClose,
  MdDarkMode,
  MdLanguage,
  MdLightMode,
  MdLocationOn,
  MdSearch,
} from "react-icons/md";
import {
  Box,
  Divider,
  IconButton,
  Input,
  Sheet,
  Stack,
  Tooltip,
} from "@mui/joy";
import { useEffect, useRef, useState } from "react";
import { AnimatedPlaceholder } from "@/components/common/AnimatedPlaceholder";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useMapActions,
  useMapCore,
  useMapData,
  useMapPinPlacement,
  useMapUI,
} from "../hooks/useMapMachine";
import { useMapSearchParams } from "../hooks/useMapSearchParams";
import { useTierListFilter } from "../hooks/useTierListFilter";
import { MapFilter } from "./MapFilter";

const SEARCH_DEBOUNCE_MS = 1500;

// Toggle between "typewriter" and "fade" to compare animation styles
const PLACEHOLDER_VARIANT: "typewriter" | "fade" = "typewriter";

const MAP_SEARCH_EXAMPLES_DESKTOP = [
  "Search places...",
  "cozy wine bar...",
  "craft brewery with food...",
  "good coffee nearby...",
  "Starbucks...",
  "speakeasy cocktail bar...",
  "123 Sesame Street, NY 10023...",
  "rooftop bar...",
  "Hooper's Store, Sesame St 10023...",
  "Total Wine...",
  "date night spot...",
  "natural wine...",
  "Oscar's Trash Can, Sesame St 10023...",
];

const MAP_SEARCH_EXAMPLES_MOBILE = [
  "Search places...",
  "wine bar...",
  "craft beer...",
  "123 Sesame St, NY 10023...",
  "Starbucks...",
  "good coffee...",
  "cocktail spot...",
  "happy hour...",
  "Hooper's Store, 10023...",
];

interface MapControlsProps {
  // Action props
  onLocationClick?: () => void;

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
  onLocationClick,
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

  // Decouple input value from URL state to prevent text reversion during typing.
  // Local state updates instantly; URL state is debounced to reduce expensive
  // semantic search calls (embedding generation + vector query).
  const [inputValue, setInputValue] = useState(search);
  const [isFocused, setIsFocused] = useState(false);
  const isLocalChange = useRef(false);

  // Animated placeholder examples
  const examples = isMobile
    ? MAP_SEARCH_EXAMPLES_MOBILE
    : MAP_SEARCH_EXAMPLES_DESKTOP;
  const isPlaceholderActive = !isFocused && !inputValue;

  const typewriterPlaceholder = useAnimatedPlaceholder({
    examples,
    enabled: isPlaceholderActive && PLACEHOLDER_VARIANT === "typewriter",
  });

  // Sync external → local (clear button, URL navigation, back/forward)
  useEffect(() => {
    if (!isLocalChange.current) {
      setInputValue(search);
    }
    isLocalChange.current = false;
  }, [search]);

  // Debounced sync local → URL (triggers semantic search via useSearchParamsSync)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(inputValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, setSearch]);

  const handleSearchChange = (value: string) => {
    isLocalChange.current = true;
    setInputValue(value);
  };

  const handleSearchClear = () => {
    isLocalChange.current = true;
    setInputValue("");
    setSearch(""); // bypass debounce for instant clear
  };

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
  const { isLoading } = useMapData();
  const { toggleDarkMode, enterPinPlacement, exitPinPlacement } =
    useMapActions();
  const { isPlacing } = useMapPinPlacement();

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
  const fallbackPlaceholder = "Search places...";

  const SearchInput = (
    <Box sx={{ position: "relative" }}>
      <Input
        placeholder={
          PLACEHOLDER_VARIANT === "typewriter"
            ? isPlaceholderActive
              ? typewriterPlaceholder
              : fallbackPlaceholder
            : isPlaceholderActive && PLACEHOLDER_VARIANT === "fade"
              ? ""
              : fallbackPlaceholder
        }
        value={inputValue}
        onChange={(e) => handleSearchChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        startDecorator={
          <Box
            component="span"
            sx={{
              ...(isLoading && {
                animation: "pulse 1.5s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.3 },
                },
              }),
            }}
          >
            <MdSearch />
          </Box>
        }
        endDecorator={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            {inputValue && (
              <IconButton
                variant="plain"
                color="neutral"
                onClick={handleSearchClear}
                size="sm"
                sx={{
                  minWidth: "auto",
                  minHeight: "auto",
                  padding: "4px",
                }}
              >
                <MdClose size={18} />
              </IconButton>
            )}
            <Tooltip
              title={
                globalSearch ? "Searching globally" : "Searching in viewport"
              }
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
                <MdLanguage size={18} />
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
      {PLACEHOLDER_VARIANT === "fade" && (
        <AnimatedPlaceholder
          examples={examples}
          enabled={isPlaceholderActive}
        />
      )}
    </Box>
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
            color={isPlacing ? "danger" : "primary"}
            onClick={isPlacing ? exitPinPlacement : enterPinPlacement}
            size="sm"
            title={isPlacing ? "Cancel adding place" : "Add a new place"}
          >
            {isPlacing ? <MdClose /> : <MdAddLocationAlt />}
          </IconButton>

          {onLocationClick && (
            <IconButton
              variant="soft"
              color="neutral"
              onClick={onLocationClick}
              size="sm"
              title="Go to my location"
            >
              <MdLocationOn />
            </IconButton>
          )}

          <IconButton
            variant="soft"
            color="neutral"
            onClick={toggleDarkMode}
            size="sm"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkMode ? <MdLightMode /> : <MdDarkMode />}
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
 *   <MapControls onLocationClick={handleLocation} />
 * </MapMachineProvider>
 * ```
 */
