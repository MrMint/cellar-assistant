import { Check, Close, Place, Star } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Sheet,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import { type FC, useEffect, useRef, useState } from "react";
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";
import { MdFilterList } from "react-icons/md";
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

// Icon mapping for item types
const ITEM_TYPE_ICONS = {
  WineBar: FaWineGlass,
  SportsBar: FaBeer,
  LocalBar: FaCocktail,
  Coffee: FaCoffee,
  Sake: FaGlassWhiskey,
};

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
  const [mobilePanelTop, setMobilePanelTop] = useState<number>(88);
  const filterRef = useRef<HTMLDivElement>(null);
  const advancedFiltersPanelId = "map-advanced-filters";

  // Get icon component for item type
  const getIconComponent = (iconName: string) => {
    return (
      ITEM_TYPE_ICONS[iconName as keyof typeof ITEM_TYPE_ICONS] || FaCocktail
    );
  };

  // Close advanced filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('[role="listbox"]') ||
        target.closest('[role="option"]')
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

  const getVisitStatusColor = (status: VisitStatus) => {
    if (status === "unvisited") return "primary";
    if (status === "visited") return "success";
    return "warning";
  };

  return (
    <Stack direction="row" ref={filterRef} sx={{ position: "relative" }}>
      {/* Item type filters + more filters toggle */}
      <Sheet
        variant="outlined"
        sx={{
          borderRadius: "md",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          p: 0.5,
        }}
      >
        <ToggleButtonGroup
          variant="plain"
          spacing={0.5}
          value={selectedItemTypes}
          onChange={(_event, newItemTypes) => {
            onItemTypesChange(newItemTypes);
          }}
          aria-label="item types"
        >
          {ITEM_TYPES.map((itemType) => {
            const IconComponent = getIconComponent(itemType.icon);

            return (
              <Tooltip key={itemType.id} title={itemType.label}>
                <IconButton value={itemType.id} aria-label={itemType.label}>
                  <IconComponent />
                </IconButton>
              </Tooltip>
            );
          })}
        </ToggleButtonGroup>

        <Divider orientation="vertical" />

        {/* Advanced filter toggle */}
        <Tooltip title="More filters">
          <IconButton
            color={hasAdvancedFilters || showAdvanced ? "primary" : "neutral"}
            variant={showAdvanced ? "soft" : "plain"}
            onClick={() => setShowAdvanced((prev) => !prev)}
            size="sm"
            aria-label="More filters"
            aria-expanded={showAdvanced}
            aria-controls={advancedFiltersPanelId}
            sx={{
              position: "relative",
            }}
          >
            <MdFilterList />
            {activeFilterCount > 0 && !showAdvanced && (
              <Box
                sx={{
                  position: "absolute",
                  top: -1,
                  right: -1,
                  minWidth: 14,
                  height: 14,
                  px: 0.25,
                  borderRadius: "999px",
                  backgroundColor: "primary.500",
                  color: "common.white",
                  fontSize: "10px",
                  lineHeight: "14px",
                  textAlign: "center",
                  fontWeight: "lg",
                }}
              >
                {activeFilterCount}
              </Box>
            )}
          </IconButton>
        </Tooltip>
      </Sheet>

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
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
              opacity: { duration: 0.15 },
            }}
            style={{
              position: isMobile ? "fixed" : "absolute",
              top: isMobile ? `${mobilePanelTop}px` : "calc(100% + 8px)",
              left: isMobile ? 8 : undefined,
              right: isMobile ? 8 : 0,
              zIndex: 1200,
            }}
          >
            <Sheet
              sx={{
                p: 2,
                borderRadius: "md",
                boxShadow: "lg",
                minWidth: isMobile ? "auto" : 340,
                maxWidth: isMobile ? "none" : 420,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.surface",
                maxHeight: isMobile
                  ? `calc(100dvh - ${mobilePanelTop + 8}px)`
                  : "min(75vh, 640px)",
                overflowY: "auto",
              }}
            >
              <Stack spacing={2}>
                {hasAdvancedFilters && (
                  <Box>
                    <Typography
                      level="body-sm"
                      sx={{ mb: 1, fontWeight: "md" }}
                    >
                      Active Filters
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {minRating !== undefined && (
                        <Chip
                          variant="soft"
                          color="warning"
                          size="sm"
                          endDecorator={
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => onMinRatingChange(undefined)}
                              sx={{ ml: 0.5 }}
                            >
                              <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                          }
                        >
                          {minRating}+ stars
                        </Chip>
                      )}

                      {visitStatuses.map((status) => (
                        <Chip
                          key={status}
                          variant="soft"
                          color={getVisitStatusColor(status)}
                          size="sm"
                          endDecorator={
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => {
                                onVisitStatusesChange(
                                  visitStatuses.filter((s) => s !== status),
                                );
                              }}
                              sx={{ ml: 0.5 }}
                            >
                              <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                          }
                        >
                          {getVisitStatusLabel(status)}
                        </Chip>
                      ))}

                      {selectedTierListIds.length > 0 &&
                        selectedTierListIds.map((id) => {
                          const tierList = tierLists.find((t) => t.id === id);
                          if (!tierList) return null;
                          return (
                            <Chip
                              key={id}
                              variant="soft"
                              color="primary"
                              size="sm"
                              endDecorator={
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="neutral"
                                  onClick={() => {
                                    onTierListsChange?.(
                                      selectedTierListIds.filter(
                                        (tierListId) => tierListId !== id,
                                      ),
                                    );
                                  }}
                                  sx={{ ml: 0.5 }}
                                >
                                  <Close sx={{ fontSize: 14 }} />
                                </IconButton>
                              }
                            >
                              {tierList.name}
                            </Chip>
                          );
                        })}
                    </Stack>
                    <Divider sx={{ mt: 1.5 }} />
                  </Box>
                )}

                {/* Rating filter */}
                <Box>
                  <Typography level="body-sm" sx={{ mb: 1, fontWeight: "md" }}>
                    Minimum Rating
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant={minRating === undefined ? "solid" : "outlined"}
                      color="neutral"
                      size="sm"
                      onClick={() => onMinRatingChange(undefined)}
                    >
                      Any
                    </Button>
                    {[3, 4, 5].map((rating) => (
                      <Button
                        key={rating}
                        variant={minRating === rating ? "solid" : "outlined"}
                        color="warning"
                        size="sm"
                        onClick={() => onMinRatingChange(rating)}
                        startDecorator={<Star sx={{ fontSize: 16 }} />}
                        sx={{ minWidth: "auto", px: 1.25, flexShrink: 0 }}
                      >
                        {rating}+
                      </Button>
                    ))}
                  </Stack>
                </Box>

                <Divider />

                {/* Visit status filter */}
                <Box>
                  <Typography level="body-sm" sx={{ mb: 1, fontWeight: "md" }}>
                    Visit Status
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant={visitMode === "any" ? "solid" : "outlined"}
                      color="neutral"
                      size="sm"
                      onClick={() => setVisitMode("any")}
                    >
                      Any
                    </Button>
                    <Button
                      variant={visitMode === "unvisited" ? "solid" : "outlined"}
                      color="primary"
                      size="sm"
                      startDecorator={<Place />}
                      onClick={() => setVisitMode("unvisited")}
                    >
                      New Places
                    </Button>
                    <Button
                      variant={visitMode === "visited" ? "solid" : "outlined"}
                      color="success"
                      size="sm"
                      startDecorator={<Check />}
                      onClick={() => setVisitMode("visited")}
                    >
                      Visited
                    </Button>
                  </Stack>
                </Box>

                {/* Tier list filter */}
                {(tierLists.length > 0 || tierListsLoading) && (
                  <>
                    <Divider />
                    <Box>
                      <Typography
                        level="body-sm"
                        sx={{ mb: 1, fontWeight: "md" }}
                      >
                        Tier Lists
                      </Typography>
                      <Autocomplete
                        multiple
                        size="sm"
                        options={tierLists}
                        loading={tierListsLoading}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) =>
                          option.id === value.id
                        }
                        value={tierLists.filter((tierList) =>
                          selectedTierListIds.includes(tierList.id),
                        )}
                        onChange={(_, value) => {
                          onTierListsChange?.(
                            value.map((tierList) => tierList.id),
                          );
                        }}
                        placeholder="Select tier lists..."
                        noOptionsText={
                          tierListsLoading
                            ? "Loading tier lists..."
                            : "No tier lists"
                        }
                        endDecorator={
                          tierListsLoading ? (
                            <CircularProgress size="sm" />
                          ) : undefined
                        }
                      />
                      <Typography
                        level="body-xs"
                        sx={{ mt: 0.75, color: "text.tertiary" }}
                      >
                        Leave empty to include all tier lists.
                      </Typography>
                    </Box>
                  </>
                )}

                <Divider />
                <Box
                  sx={{
                    position: "sticky",
                    bottom: 0,
                    pt: 0.5,
                    backgroundColor: "background.surface",
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="space-between"
                  >
                    <Button
                      variant="outlined"
                      color="danger"
                      size="sm"
                      disabled={!hasAdvancedFilters}
                      onClick={() => {
                        onMinRatingChange(undefined);
                        onVisitStatusesChange([]);
                        onTierListsChange?.([]);
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      size="sm"
                      onClick={() => setShowAdvanced(false)}
                    >
                      Close
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Sheet>
          </motion.div>
        )}
      </AnimatePresence>
    </Stack>
  );
};

export type { ItemType, VisitStatus };
