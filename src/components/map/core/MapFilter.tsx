import { Check, Place, Star, StarBorder } from "@mui/icons-material";
import {
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
  counts = {},
  searchQuery = "",
  onSearchQueryChange,
  minRating,
  onMinRatingChange,
  visitStatuses = [],
  onVisitStatusesChange,
  tierLists = [],
  selectedTierListIds = [],
  onTierListsChange,
  tierListsLoading = false,
  isTierListFilterActive = false,
  isMobile = false,
}: MapFilterProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Get icon component for item type
  const getIconComponent = (iconName: string) => {
    return (
      ITEM_TYPE_ICONS[iconName as keyof typeof ITEM_TYPE_ICONS] || FaCocktail
    );
  };

  // Close advanced filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
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

  const renderRatingStars = (rating: number) => {
    return (
      <Stack direction="row" spacing={0.25}>
        {[1, 2, 3, 4, 5].map((star) => {
          const IconComponent = star <= rating ? Star : StarBorder;
          return (
            <IconComponent
              key={star}
              sx={{
                fontSize: 16,
                color: star <= rating ? "warning.500" : "neutral.300",
              }}
            />
          );
        })}
      </Stack>
    );
  };

  return (
    <Stack
      direction="row"
      spacing={2}
      ref={filterRef}
      sx={{ position: "relative" }}
    >
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
            color={
              minRating !== undefined ||
              visitStatuses.length > 0 ||
              isTierListFilterActive
                ? "primary"
                : "neutral"
            }
            onClick={() => setShowAdvanced(!showAdvanced)}
            size="sm"
            aria-label="More filters"
            sx={{
              position: "relative",
            }}
          >
            <MdFilterList />
            {/* Active filter indicator */}
            {(minRating !== undefined ||
              visitStatuses.length > 0 ||
              isTierListFilterActive) &&
              !showAdvanced && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "primary.500",
                    zIndex: 1,
                  }}
                />
              )}
          </IconButton>
        </Tooltip>
      </Sheet>

      {/* Advanced filters popup */}
      {showAdvanced && (
        <Box
          sx={{
            position: isMobile ? "fixed" : "absolute",
            top: isMobile ? "auto" : "100%",
            ...(isMobile ? { left: 8, right: 8 } : { right: 0 }),
            mt: 1,
            zIndex: 1200,
          }}
        >
          <Sheet
            sx={{
              p: 2,
              borderRadius: "md",
              boxShadow: "lg",
              minWidth: isMobile ? "auto" : 320,
              maxWidth: isMobile ? "none" : 400,
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.surface",
            }}
          >
            <Stack spacing={2}>
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
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={minRating === rating ? "solid" : "outlined"}
                      color="warning"
                      size="sm"
                      onClick={() => onMinRatingChange(rating)}
                      startDecorator={renderRatingStars(rating)}
                      sx={{
                        minWidth: "auto",
                        px: 1,
                        flexShrink: 0,
                      }}
                    >
                      {rating}+
                    </Button>
                  ))}
                </Stack>
                {minRating && (
                  <Box sx={{ mt: 1 }}>
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
                          ×
                        </IconButton>
                      }
                    >
                      {minRating}+ stars
                    </Chip>
                  </Box>
                )}
              </Box>

              <Divider />

              {/* Visit status filter */}
              <Box>
                <Typography level="body-sm" sx={{ mb: 1, fontWeight: "md" }}>
                  Visit Status
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    variant={
                      visitStatuses.includes("unvisited") ? "solid" : "outlined"
                    }
                    color="primary"
                    size="sm"
                    startDecorator={<Place />}
                    onClick={() => {
                      if (visitStatuses.includes("unvisited")) {
                        onVisitStatusesChange(
                          visitStatuses.filter((s) => s !== "unvisited"),
                        );
                      } else {
                        onVisitStatusesChange([...visitStatuses, "unvisited"]);
                      }
                    }}
                  >
                    New Places
                  </Button>
                  <Button
                    variant={
                      visitStatuses.includes("visited") ? "solid" : "outlined"
                    }
                    color="success"
                    size="sm"
                    startDecorator={<Check />}
                    onClick={() => {
                      if (visitStatuses.includes("visited")) {
                        onVisitStatusesChange(
                          visitStatuses.filter((s) => s !== "visited"),
                        );
                      } else {
                        onVisitStatusesChange([...visitStatuses, "visited"]);
                      }
                    }}
                  >
                    Visited
                  </Button>
                </Stack>
                {visitStatuses.length > 0 && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1 }}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {visitStatuses.map((status) => (
                      <Chip
                        key={status}
                        variant="soft"
                        color={status === "unvisited" ? "primary" : "success"}
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
                            ×
                          </IconButton>
                        }
                      >
                        {status === "unvisited" ? "New Places" : "Visited"}
                      </Chip>
                    ))}
                  </Stack>
                )}
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
                    {tierListsLoading ? (
                      <CircularProgress size="sm" />
                    ) : (
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        useFlexGap
                      >
                        {tierLists.map((tierList) => {
                          const isSelected = selectedTierListIds.includes(
                            tierList.id,
                          );
                          return (
                            <Button
                              key={tierList.id}
                              variant={isSelected ? "solid" : "outlined"}
                              color="primary"
                              size="sm"
                              onClick={() => {
                                if (!onTierListsChange) return;
                                if (isSelected) {
                                  onTierListsChange(
                                    selectedTierListIds.filter(
                                      (id) => id !== tierList.id,
                                    ),
                                  );
                                } else {
                                  onTierListsChange([
                                    ...selectedTierListIds,
                                    tierList.id,
                                  ]);
                                }
                              }}
                            >
                              {tierList.name}
                            </Button>
                          );
                        })}
                      </Stack>
                    )}
                    {isTierListFilterActive && (
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ mt: 1 }}
                        flexWrap="wrap"
                        useFlexGap
                      >
                        {selectedTierListIds.map((id) => {
                          const tl = tierLists.find((t) => t.id === id);
                          if (!tl) return null;
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
                                        (tid) => tid !== id,
                                      ),
                                    );
                                  }}
                                  sx={{ ml: 0.5 }}
                                >
                                  x
                                </IconButton>
                              }
                            >
                              {tl.name}
                            </Chip>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </>
              )}

              {/* Clear all filters button */}
              {(minRating !== undefined ||
                visitStatuses.length > 0 ||
                isTierListFilterActive) && (
                <>
                  <Divider />
                  <Button
                    variant="outlined"
                    color="danger"
                    size="sm"
                    onClick={() => {
                      onMinRatingChange(undefined);
                      onVisitStatusesChange([]);
                      onTierListsChange?.(
                        tierLists.map((tl) => tl.id),
                      );
                    }}
                    sx={{ alignSelf: "center" }}
                  >
                    Clear All Filters
                  </Button>
                </>
              )}

              {/* Close button */}
              <Button
                variant="plain"
                size="sm"
                onClick={() => setShowAdvanced(false)}
                sx={{ alignSelf: "center" }}
              >
                Done
              </Button>
            </Stack>
          </Sheet>
        </Box>
      )}
    </Stack>
  );
};

export type { ItemType, VisitStatus };
