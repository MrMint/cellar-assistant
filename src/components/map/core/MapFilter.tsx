import { Check, Place, Star, StarBorder } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
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
      {/* Item type filters */}
      <Sheet
        variant="outlined"
        sx={{ borderRadius: "md", display: "flex", gap: 2, p: 0.5 }}
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
      </Sheet>

      {/* Additional filters */}
      <Sheet
        variant="outlined"
        sx={{ borderRadius: "md", display: "flex", gap: 2, p: 0.5 }}
      >
        <ToggleButtonGroup
          variant="plain"
          spacing={0.5}
          aria-label="additional filters"
        >
          {/* Advanced filter toggle */}
          <Tooltip title="More filters">
            <IconButton
              color={
                minRating !== undefined || visitStatuses.length > 0
                  ? "primary"
                  : "neutral"
              }
              onClick={() => setShowAdvanced(!showAdvanced)}
              sx={{
                position: "relative",
              }}
            >
              <MdFilterList />
              {/* Active filter indicator */}
              {(minRating !== undefined || visitStatuses.length > 0) &&
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
        </ToggleButtonGroup>
      </Sheet>

      {/* Advanced filters popup */}
      {showAdvanced && (
        <Box
          sx={{
            position: "absolute",
            top: "100%",
            right: 0,
            mt: 1,
            zIndex: 1200,
          }}
        >
          <Sheet
            sx={{
              p: 2,
              borderRadius: "md",
              boxShadow: "lg",
              minWidth: 320,
              maxWidth: 400,
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

              {/* Clear all filters button */}
              {(minRating !== undefined || visitStatuses.length > 0) && (
                <>
                  <Divider />
                  <Button
                    variant="outlined"
                    color="danger"
                    size="sm"
                    onClick={() => {
                      onMinRatingChange(undefined);
                      onVisitStatusesChange([]);
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
