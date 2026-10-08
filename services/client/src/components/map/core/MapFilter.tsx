import { AnimatePresence, motion } from "motion/react";
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import {
  Check,
  ChevronDown,
  Close,
  Filter,
  ICON_STROKE,
  Place,
  Star,
} from "@/components/app/icons";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { TypeGlyph } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { spring, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { TierListFilterOption } from "../hooks/useTierListFilter";
import type { ItemType, VisitStatus } from "../types";
import { ITEM_TYPES } from "./ItemTypeCategoryMapper";

type MapFilterProps = {
  // Item type filtering
  selectedItemTypes?: ItemType[];
  onItemTypesChange: (itemTypes: ItemType[]) => void;

  // Place counts for display
  counts?: {
    restaurants?: number;
    bars?: number;
    cafes?: number;
    breweries?: number;
    wineries?: number;
  };

  // Search
  searchQuery?: string;
  onSearchQueryChange: (query: string) => void;

  // Rating filter
  minRating?: number;
  onMinRatingChange: (rating: number | undefined) => void;

  // Visit status filter
  visitStatuses?: VisitStatus[];
  onVisitStatusesChange: (statuses: VisitStatus[]) => void;

  // Tier list filter
  tierLists?: TierListFilterOption[];
  selectedTierListIds?: string[];
  onTierListsChange?: (tierListIds: string[]) => void;
  tierListsLoading?: boolean;
  isTierListFilterActive?: boolean;

  // Layout
  isMobile?: boolean;
};

const ITEM_TYPE_VALUES = new Set<string>(ITEM_TYPES.map((t) => t.id));

const RATING_OPTIONS = [
  { value: "any", label: "Any" },
  ...[3, 4, 5].map((rating) => ({
    value: String(rating),
    label: `${rating}+`,
    icon: <Star aria-hidden strokeWidth={ICON_STROKE} />,
  })),
] as const;

const VISIT_OPTIONS = [
  { value: "any", label: "Any" },
  {
    value: "unvisited",
    label: "New Places",
    icon: <Place aria-hidden strokeWidth={ICON_STROKE} />,
  },
  {
    value: "visited",
    label: "Visited",
    icon: <Check aria-hidden strokeWidth={ICON_STROKE} />,
  },
] as const;

/** A removable "active filter" pill: the label and an × that clears it. */
function ActiveFilter({
  children,
  onRemove,
}: {
  children: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-0.5 rounded-full bg-surface-3 pr-0.5 pl-3 font-medium text-ink-1 text-sm">
      {children}
      <IconButton
        aria-label={`Remove ${children}`}
        size="sm"
        onClick={onRemove}
        className="size-7 text-ink-2 [&_svg:not([class*='size-'])]:size-3.5"
      >
        <Close />
      </IconButton>
    </span>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-callout font-medium text-ink-1">{label}</p>
      {children}
    </div>
  );
}

export const MapFilter: FC<MapFilterProps> = ({
  selectedItemTypes = [],
  onItemTypesChange,
  counts: _counts = {},
  searchQuery: _searchQuery = "",
  onSearchQueryChange: _onSearchQueryChange,
  minRating,
  onMinRatingChange,
  visitStatuses = [],
  onVisitStatusesChange,
  tierLists = [],
  selectedTierListIds = [],
  onTierListsChange,
  tierListsLoading = false,
  isMobile = false,
}: MapFilterProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tierListPickerOpen, setTierListPickerOpen] = useState(false);
  const [mobilePanelTop, setMobilePanelTop] = useState<number>(88);
  const filterRef = useRef<HTMLDivElement>(null);
  const advancedFiltersPanelId = "map-advanced-filters";

  // Close advanced filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('[role="listbox"]') ||
        target.closest('[role="option"]') ||
        // The tier-list picker portals to <body>, outside this panel.
        target.closest('[data-slot="popover-content"]')
      ) {
        return;
      }

      if (filterRef.current && !filterRef.current.contains(target)) {
        setShowAdvanced(false);
      }
    };

    if (showAdvanced) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showAdvanced]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAdvanced(false);
      }
    };

    if (showAdvanced) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [showAdvanced]);

  useEffect(() => {
    if (!showAdvanced || !isMobile) return;

    const updateMobilePanelTop = () => {
      const rect = filterRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMobilePanelTop(Math.round(rect.bottom + 8));
    };

    updateMobilePanelTop();
    window.addEventListener("resize", updateMobilePanelTop);
    window.addEventListener("scroll", updateMobilePanelTop, true);

    return () => {
      window.removeEventListener("resize", updateMobilePanelTop);
      window.removeEventListener("scroll", updateMobilePanelTop, true);
    };
  }, [showAdvanced, isMobile]);

  const hasAdvancedFilters =
    minRating !== undefined ||
    visitStatuses.length > 0 ||
    selectedTierListIds.length > 0;

  const activeFilterCount =
    Number(minRating !== undefined) +
    Number(visitStatuses.length > 0) +
    Number(selectedTierListIds.length > 0);

  const visitMode: "any" | "unvisited" | "visited" =
    visitStatuses.length === 1 &&
    (visitStatuses[0] === "unvisited" || visitStatuses[0] === "visited")
      ? visitStatuses[0]
      : "any";

  const setVisitMode = (mode: "any" | "unvisited" | "visited") => {
    if (mode === "any") {
      onVisitStatusesChange([]);
      return;
    }
    onVisitStatusesChange([mode]);
  };

  const getVisitStatusLabel = (status: VisitStatus) => {
    if (status === "unvisited") return "New Places";
    if (status === "visited") return "Visited";
    if (status === "favorites") return "Favorites";
    return status;
  };

  const selectedTierLists = tierLists.filter((tierList) =>
    selectedTierListIds.includes(tierList.id),
  );

  const toggleTierList = (id: string) => {
    onTierListsChange?.(
      selectedTierListIds.includes(id)
        ? selectedTierListIds.filter((tierListId) => tierListId !== id)
        : [...selectedTierListIds, id],
    );
  };

  return (
    <div ref={filterRef} className="relative flex flex-row">
      {/* Item type filters + more filters toggle */}
      <div className="flex items-center gap-1 rounded-md bg-surface-2 p-1">
        <ToggleGroup
          type="multiple"
          spacing={1}
          value={selectedItemTypes}
          onValueChange={(next) => {
            onItemTypesChange(
              next.filter((value): value is ItemType =>
                ITEM_TYPE_VALUES.has(value),
              ),
            );
          }}
          aria-label="item types"
          className="flex-wrap"
        >
          {ITEM_TYPES.map((itemType) => (
            <Tooltip key={itemType.id}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={itemType.id}
                  aria-label={itemType.label}
                  className="size-9 px-0"
                >
                  <TypeGlyph
                    type={
                      itemType.id.toUpperCase() as Uppercase<typeof itemType.id>
                    }
                  />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{itemType.label}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <Separator orientation="vertical" className="h-6 self-center" />

        {/* Advanced filter toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label="More filters"
              aria-expanded={showAdvanced}
              aria-controls={advancedFiltersPanelId}
              size="sm"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className={cn(
                "text-ink-2",
                (hasAdvancedFilters || showAdvanced) && "text-ink-1",
                showAdvanced && "bg-accent",
              )}
            >
              <Filter />
              {activeFilterCount > 0 && !showAdvanced && (
                <span
                  aria-hidden
                  className="tabular absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 rounded-full bg-ink-1 px-0.5 text-center font-semibold text-[10px] text-background leading-3.5"
                >
                  {activeFilterCount}
                </span>
              )}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>More filters</TooltipContent>
        </Tooltip>
      </div>

      {/* Advanced filters popup */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            key={isMobile ? "mobile" : "desktop"}
            id={advancedFiltersPanelId}
            initial={
              isMobile
                ? { y: -12, opacity: 0, scale: 0.98 }
                : { y: -8, opacity: 0, scale: 0.98 }
            }
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={
              isMobile
                ? { y: -10, opacity: 0, scale: 0.98 }
                : { y: -6, opacity: 0, scale: 0.98 }
            }
            transition={{ ...spring.snappy, opacity: tween("short") }}
            className={cn(
              "z-[1200]",
              isMobile
                ? "fixed inset-x-2"
                : "absolute top-[calc(100%+8px)] right-0",
            )}
            style={isMobile ? { top: mobilePanelTop } : undefined}
          >
            <div
              className={cn(
                "overflow-y-auto rounded-md bg-surface-2 p-4 text-ink-1 shadow-lg",
                !isMobile &&
                  "max-h-[min(75vh,640px)] min-w-[340px] max-w-[420px]",
              )}
              style={
                isMobile
                  ? { maxHeight: `calc(100dvh - ${mobilePanelTop + 8}px)` }
                  : undefined
              }
            >
              <div className="flex flex-col gap-4">
                {hasAdvancedFilters && (
                  <div className="flex flex-col gap-3">
                    <FilterSection label="Active Filters">
                      <div className="flex flex-wrap gap-2">
                        {minRating !== undefined && (
                          <ActiveFilter
                            onRemove={() => onMinRatingChange(undefined)}
                          >
                            {`${minRating}+ stars`}
                          </ActiveFilter>
                        )}

                        {visitStatuses.map((status) => (
                          <ActiveFilter
                            key={status}
                            onRemove={() => {
                              onVisitStatusesChange(
                                visitStatuses.filter((s) => s !== status),
                              );
                            }}
                          >
                            {getVisitStatusLabel(status)}
                          </ActiveFilter>
                        ))}

                        {selectedTierLists.map((tierList) => (
                          <ActiveFilter
                            key={tierList.id}
                            onRemove={() => toggleTierList(tierList.id)}
                          >
                            {tierList.name}
                          </ActiveFilter>
                        ))}
                      </div>
                    </FilterSection>
                    <Separator />
                  </div>
                )}

                {/* Rating filter */}
                <FilterSection label="Minimum Rating">
                  <SegmentedControl
                    aria-label="Minimum Rating"
                    options={RATING_OPTIONS}
                    value={minRating === undefined ? "any" : String(minRating)}
                    onValueChange={(value) =>
                      onMinRatingChange(
                        value === "any" ? undefined : Number(value),
                      )
                    }
                  />
                </FilterSection>

                <Separator />

                {/* Visit status filter */}
                <FilterSection label="Visit Status">
                  <SegmentedControl
                    aria-label="Visit Status"
                    options={VISIT_OPTIONS}
                    value={visitMode}
                    onValueChange={setVisitMode}
                  />
                </FilterSection>

                {/* Tier list filter */}
                {(tierLists.length > 0 || tierListsLoading) && (
                  <>
                    <Separator />
                    <FilterSection label="Tier Lists">
                      <Popover
                        open={tierListPickerOpen}
                        onOpenChange={setTierListPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={tierListPickerOpen}
                            aria-label="Tier Lists"
                            className="h-auto min-h-11 w-full justify-between whitespace-normal py-1.5 pr-3 pl-3 font-normal"
                          >
                            {selectedTierLists.length > 0 ? (
                              <span className="flex min-w-0 flex-wrap gap-1">
                                {selectedTierLists.map((tierList) => (
                                  <span
                                    key={tierList.id}
                                    className="rounded-full bg-surface-3 px-2 py-0.5 text-ink-1 text-xs"
                                  >
                                    {tierList.name}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Select tier lists...
                              </span>
                            )}
                            {tierListsLoading ? (
                              <Spinner className="text-ink-3" />
                            ) : (
                              <ChevronDown
                                aria-hidden
                                strokeWidth={ICON_STROKE}
                                className="text-ink-3"
                              />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-(--radix-popover-trigger-width) min-w-60 p-0"
                        >
                          <Command>
                            <CommandInput placeholder="Search tier lists..." />
                            <CommandList>
                              <CommandEmpty>
                                {tierListsLoading
                                  ? "Loading tier lists..."
                                  : "No tier lists"}
                              </CommandEmpty>
                              {tierLists.map((tierList) => {
                                const selected = selectedTierListIds.includes(
                                  tierList.id,
                                );
                                return (
                                  <CommandItem
                                    key={tierList.id}
                                    value={tierList.id}
                                    keywords={[tierList.name]}
                                    aria-selected={selected}
                                    onSelect={() => toggleTierList(tierList.id)}
                                    className="min-h-11"
                                  >
                                    <Check
                                      aria-hidden
                                      strokeWidth={ICON_STROKE}
                                      className={cn(
                                        "text-ink-1",
                                        !selected && "invisible",
                                      )}
                                    />
                                    {tierList.name}
                                  </CommandItem>
                                );
                              })}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <p className="type-footnote">
                        Leave empty to include all tier lists.
                      </p>
                    </FilterSection>
                  </>
                )}

                <Separator />
                <div className="sticky bottom-0 flex justify-between gap-2 bg-surface-2 pt-1">
                  <Button
                    variant="destructive"
                    disabled={!hasAdvancedFilters}
                    onClick={() => {
                      onMinRatingChange(undefined);
                      onVisitStatusesChange([]);
                      onTierListsChange?.([]);
                    }}
                  >
                    Reset
                  </Button>
                  <Button onClick={() => setShowAdvanced(false)}>Close</Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export type { ItemType, VisitStatus };
