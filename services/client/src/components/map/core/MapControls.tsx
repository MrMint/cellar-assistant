"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import {
  AddPlace,
  Close,
  DarkMode,
  ICON_STROKE,
  LightMode,
  Place,
  Public,
  Search,
} from "@/components/app/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
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
    enabled: isPlaceholderActive,
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

  // Where the desktop panels sit.
  const POSITION_CLASSES = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  } as const;
  const positionClasses = (pos: string | undefined) =>
    POSITION_CLASSES[pos as keyof typeof POSITION_CLASSES] ??
    POSITION_CLASSES["top-left"];

  // Shared search input
  const fallbackPlaceholder = "Search places...";

  const SearchInput = (
    <InputGroup className="h-10 border-0 bg-transparent shadow-none dark:bg-transparent">
      <InputGroupAddon>
        <Search
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={cn(
            "text-ink-2",
            isLoading && "animate-pulse motion-reduce:animate-none",
          )}
        />
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Search places"
        placeholder={
          isPlaceholderActive ? typewriterPlaceholder : fallbackPlaceholder
        }
        value={inputValue}
        onChange={(e) => handleSearchChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      <InputGroupAddon align="inline-end" className="gap-0.5">
        {inputValue && (
          <IconButton
            aria-label="Clear search"
            size="sm"
            onClick={handleSearchClear}
            className="text-ink-2"
          >
            <Close />
          </IconButton>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label="Search globally"
              aria-pressed={globalSearch}
              size="sm"
              onClick={() => setGlobalSearch(!globalSearch)}
              className={cn(
                globalSearch
                  ? "bg-ink-1 text-background hover:bg-ink-1/90 hover:text-background dark:hover:bg-ink-1/90"
                  : "text-ink-2",
              )}
            >
              <Public />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>
            {globalSearch ? "Searching globally" : "Searching in viewport"}
          </TooltipContent>
        </Tooltip>
      </InputGroupAddon>
    </InputGroup>
  );

  // Shared filter + action controls row
  const FilterAndActions = (showFilters || showActions) && (
    <div
      className={cn(
        "flex flex-row items-center gap-2",
        isMobile ? "flex-wrap" : "flex-nowrap",
      )}
    >
      {showFilters && (
        <div className="relative z-[999] flex min-w-0 items-center gap-2">
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

          {showActions && (
            <Separator orientation="vertical" className="h-6 self-center" />
          )}
        </div>
      )}

      {showActions && (
        <div className="flex flex-row gap-1">
          <IconButton
            aria-label={isPlacing ? "Cancel adding place" : "Add a new place"}
            title={isPlacing ? "Cancel adding place" : "Add a new place"}
            variant={isPlacing ? "destructive" : "secondary"}
            size="sm"
            onClick={isPlacing ? exitPinPlacement : enterPinPlacement}
            className={cn(!isPlacing && "text-brass")}
          >
            {isPlacing ? <Close /> : <AddPlace />}
          </IconButton>

          {onLocationClick && (
            <IconButton
              aria-label="Go to my location"
              title="Go to my location"
              variant="secondary"
              size="sm"
              onClick={onLocationClick}
            >
              <Place />
            </IconButton>
          )}

          <IconButton
            aria-label={
              isDarkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            variant="secondary"
            size="sm"
            onClick={toggleDarkMode}
          >
            {isDarkMode ? <LightMode /> : <DarkMode />}
          </IconButton>
        </div>
      )}
    </div>
  );

  // Mobile: single unified container with search + filters
  if (isMobile) {
    return (
      <div className="absolute inset-x-2 top-2 z-[1000]">
        <div className="overflow-visible rounded-md bg-surface-1 p-2 shadow-md">
          {showSearch && SearchInput}
          {(showFilters || showActions) && (
            <>
              {showSearch && <Separator className="my-1" />}
              {FilterAndActions}
            </>
          )}
        </div>
      </div>
    );
  }

  // Desktop: separate search and filter containers
  const SearchControl = showSearch ? (
    <div
      className={cn(
        "absolute z-[1001] w-[calc(50%-24px)] max-w-[375px]",
        positionClasses(position.search),
      )}
    >
      <div
        className={cn(
          "rounded-md p-2 shadow-md transition-colors duration-(--ca-dur-short) ease-standard",
          isDrawerOpen ? "surface-glass" : "bg-surface-1 hover:bg-surface-2",
        )}
      >
        {SearchInput}
      </div>
    </div>
  ) : null;

  const FilterAndActionControls =
    showFilters || showActions ? (
      <div
        className={cn("absolute z-[1000]", positionClasses(position.filters))}
      >
        <div className="overflow-visible rounded-md bg-surface-1 p-2 shadow-md">
          {FilterAndActions}
        </div>
      </div>
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
 * <MapMachineProvider userId={userId}>
 *   <MapControls onLocationClick={handleLocation} />
 * </MapMachineProvider>
 * ```
 */
