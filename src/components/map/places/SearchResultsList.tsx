"use client";

import { Close, Place as PlaceIcon, Star } from "@mui/icons-material";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ITEM_TYPE_COLORS } from "../constants/colors";
import type { ItemType, PlaceResult, SemanticPlaceResult } from "../types";

interface SearchResultsListProps {
  results: SemanticPlaceResult[];
  searchQuery: string;
  isLoading: boolean;
  onPlaceSelect: (place: PlaceResult) => void;
  onCenterOnPlace: (place: PlaceResult) => void;
  onClose: () => void;
  isDetailOpen?: boolean;
}

function formatCategoryName(category: string) {
  return category
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getMostRelevantItemType(
  itemTypeScores?: Record<ItemType, number>,
): ItemType | null {
  if (!itemTypeScores) return null;
  const entries = Object.entries(itemTypeScores);
  if (entries.length === 0) return null;
  const best = entries.reduce((prev, current) =>
    Number(current[1]) > Number(prev[1]) ? current : prev,
  );
  return Number(best[1]) > 0 ? (best[0] as ItemType) : null;
}

export function SearchResultsList({
  results,
  searchQuery,
  isLoading,
  onPlaceSelect,
  onCenterOnPlace,
  onClose,
  isDetailOpen = false,
}: SearchResultsListProps) {
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");
  const sidebarOffset = hasSidebar ? 56 : 0;

  // Swipe-down-to-dismiss state for mobile drag handle
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const handleDragTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
    setDragOffset(0);
  }, []);

  const handleDragTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    // Only allow downward drag
    setDragOffset(Math.max(0, delta));
  }, []);

  const handleDragTouchEnd = useCallback(() => {
    if (dragOffset > 80) {
      onClose();
    }
    dragStartYRef.current = null;
    setDragOffset(0);
  }, [dragOffset, onClose]);

  const handleResultClick = (place: SemanticPlaceResult) => {
    onCenterOnPlace(place);
    onPlaceSelect(place);
  };

  if (isDesktop) {
    return (
      <AnimatePresence>
        <motion.div
          key="desktop"
          initial={{ x: -400, opacity: 0 }}
          animate={
            isDetailOpen ? { x: -20, opacity: 0.4 } : { x: 0, opacity: 1 }
          }
          exit={{ x: -400, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            opacity: { duration: 0.2 },
          }}
          style={{
            position: "fixed",
            top: 0,
            left: sidebarOffset,
            width: 400,
            height: "100vh",
            backgroundColor: "var(--joy-palette-background-body)",
            boxShadow: "4px 0 20px rgba(0,0,0,0.08)",
            zIndex: 949,
            borderRight: "1px solid var(--joy-palette-divider)",
            display: "flex",
            flexDirection: "column",
            pointerEvents: isDetailOpen ? "none" : "auto",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Box
            sx={{
              pt: 10,
              px: 3,
              pb: 2,
              flexShrink: 0,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography level="h4" noWrap sx={{ flex: 1, mr: 1 }}>
                {searchQuery}
              </Typography>
              <IconButton
                variant="soft"
                color="neutral"
                size="sm"
                onClick={onClose}
              >
                <Close />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="sm" variant="soft" color="primary">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </Chip>
              {isLoading && <CircularProgress size="sm" />}
            </Stack>
          </Box>

          {/* Results list */}
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              px: 2,
              py: 1,
            }}
          >
            <Stack spacing={1}>
              {results.map((place) => (
                <ResultCard
                  key={place.id}
                  place={place}
                  onClick={() => handleResultClick(place)}
                />
              ))}
            </Stack>
          </Box>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Mobile: bottom sheet
  return (
    <AnimatePresence>
      <motion.div
        key="mobile"
        initial={{ y: "100%", opacity: 0 }}
        animate={isDetailOpen ? { y: 40, opacity: 0.5 } : { y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
          opacity: { duration: 0.2 },
        }}
        style={{
          position: "fixed",
          bottom: 50,
          left: 0,
          right: 0,
          height: "50vh",
          backgroundColor: "var(--joy-palette-background-body)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
          zIndex: 1099,
          display: "flex",
          flexDirection: "column",
          pointerEvents: isDetailOpen ? "none" : "auto",
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <Box
          onTouchStart={handleDragTouchStart}
          onTouchMove={handleDragTouchMove}
          onTouchEnd={handleDragTouchEnd}
          sx={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            py: 1,
            flexShrink: 0,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 5,
              backgroundColor: dragOffset > 0 ? "neutral.500" : "neutral.400",
              borderRadius: 3,
              transition: "background-color 0.15s ease",
            }}
          />
        </Box>

        {/* Header */}
        <Box
          sx={{
            px: 2,
            pb: 1.5,
            flexShrink: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography level="title-md" noWrap sx={{ flex: 1, mr: 1 }}>
              {searchQuery}
            </Typography>
            <IconButton
              variant="soft"
              color="neutral"
              size="sm"
              onClick={onClose}
            >
              <Close />
            </IconButton>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="sm" variant="soft" color="primary">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
          </Stack>
        </Box>

        {/* Results list */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 1.5,
            py: 1,
          }}
        >
          <Stack spacing={0.75}>
            {results.map((place) => (
              <ResultCard
                key={place.id}
                place={place}
                compact
                onClick={() => handleResultClick(place)}
              />
            ))}
          </Stack>
        </Box>
      </motion.div>
    </AnimatePresence>
  );
}

function ResultCard({
  place,
  compact,
  onClick,
}: {
  place: SemanticPlaceResult;
  compact?: boolean;
  onClick: () => void;
}) {
  const itemType = getMostRelevantItemType(place.itemTypeScores);
  const accentColor = itemType ? ITEM_TYPE_COLORS[itemType] : undefined;

  return (
    <Card
      variant="outlined"
      sx={{
        cursor: "pointer",
        transition: "all 0.15s ease",
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
        "&:hover": {
          boxShadow: "sm",
          backgroundColor: "background.level1",
        },
        ...(compact ? { p: 1.5 } : {}),
      }}
      onClick={onClick}
    >
      <CardContent sx={{ p: compact ? 0 : undefined }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              p: 0.75,
              borderRadius: "sm",
              backgroundColor: accentColor ? `${accentColor}20` : "neutral.100",
              color: accentColor ?? "neutral.600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <PlaceIcon sx={{ fontSize: compact ? 18 : 20 }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              level={compact ? "title-sm" : "title-md"}
              noWrap
              sx={{ mb: 0.25 }}
            >
              {place.name}
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 0.5 }}
            >
              {place.rating && (
                <Stack direction="row" spacing={0.25} alignItems="center">
                  <Star sx={{ fontSize: 14, color: "warning.400" }} />
                  <Typography level="body-xs" sx={{ fontWeight: "md" }}>
                    {place.rating.toFixed(1)}
                  </Typography>
                </Stack>
              )}
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary" }}
                noWrap
              >
                {formatCategoryName(
                  place.primary_category || place.categories?.[0] || "",
                )}
              </Typography>
            </Stack>

            {place.street_address && (
              <Typography
                level="body-xs"
                sx={{ color: "text.secondary" }}
                noWrap
              >
                {place.street_address}
                {place.locality && `, ${place.locality}`}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
