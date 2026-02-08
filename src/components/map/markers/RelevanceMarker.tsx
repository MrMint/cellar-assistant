"use client";

import { motion } from "framer-motion";
import React, { useMemo } from "react";
import {
  MdCasino,
  MdHotel,
  MdLiquor,
  MdLocalBar,
  MdLocalCafe,
  MdLocalGroceryStore,
  MdMusicNote,
  MdRestaurant,
  MdSportsBar,
  MdWineBar,
} from "react-icons/md";
import {
  calculateMarkerSize,
  getMarkerCircleSize,
  getMarkerIconSize,
  MAP_CONFIG,
} from "../config/constants";
import {
  MARKER_ANIMATION_TRANSITION,
  PLACE_ANIMATION_VARIANTS,
} from "../constants/animations";
import { ITEM_TYPE_COLORS } from "../constants/colors";
import type { BaseMarkerProps, ItemType, MapFilters, Place } from "../types";

interface RelevanceMarkerProps extends BaseMarkerProps {
  place: Place;
  size?: number;
  showLabels?: boolean;
  filters?: MapFilters;
}

/**
 * React component for relevance-based POI markers that shows:
 * - Background color: Most relevant item type (calculated server-side with enhanced scoring)
 * - Triple relevance indication system with smooth animations:
 *   - Size scaling: POI size scales from 20% to 170% based on relevance to current search filters
 *   - Opacity scaling: Background opacity scales from 15% to 100% based on relevance
 *   - Z-index layering: More relevant POIs appear on top (z-index 1-100)
 *   - Framer Motion animations: Smooth transitions for size, opacity, and color changes
 *   - No filters = standard size and full opacity for all POIs (clean view)
 *   - With filters = dramatic visual hierarchy through both size and opacity
 *   - Highly relevant places are larger, more opaque, and prominent
 * - Category icon in center with item-type-colored background
 */
const RelevanceMarkerComponent: React.FC<RelevanceMarkerProps> = ({
  place,
  size = MAP_CONFIG.MARKER.DEFAULT_SIZE,
  showLabels = true,
  animationVariants,
  animationTransition,
  filters,
  disableAnimations = false,
}) => {
  // Use passed animation variants or fall back to defaults
  const variants = animationVariants || PLACE_ANIMATION_VARIANTS;
  const transition = animationTransition || MARKER_ANIMATION_TRANSITION;

  const itemTypeScores = place.itemTypeScores ?? {};

  // Always find the most relevant item type for background color (server now provides scores for all types)
  const allItemTypeEntries = Object.entries(itemTypeScores);
  const mostRelevantItemType =
    allItemTypeEntries.length > 0
      ? (allItemTypeEntries.reduce((prev, current) =>
          Number(current[1]) > Number(prev[1]) ? current : prev,
        )[0] as ItemType)
      : null;

  // Calculate overall relevance for sizing - now uses server-calculated score
  const calculateOverallRelevance = () => {
    // Use server-calculated overall relevance if available
    const serverRelevance = place.overallRelevance;
    if (serverRelevance !== undefined) {
      // Use centralized configuration for size scaling
      return calculateMarkerSize(serverRelevance);
    }

    // Fallback to old logic if server relevance not available
    const hasItemTypeFilters = (filters?.selectedItemTypes?.length ?? 0) > 0;

    if (!hasItemTypeFilters) {
      return 100; // Default size when no filters
    }

    // Get scores for selected item types
    const relevantScores = (filters?.selectedItemTypes ?? [])
      .map(
        (type: string) => (itemTypeScores as Record<string, number>)[type] ?? 0,
      )
      .filter((score: number) => score > 0);

    if (relevantScores.length === 0) {
      return 25; // Very small for irrelevant places
    }

    // Use the highest score among selected types
    const maxRelevance = Math.max(...relevantScores);

    // Scale to create dramatic size differences: 20% to 170% of base size
    const minSize = 20; // Smallest POI (20% of base) - tiny dots
    const maxSize = 170; // Largest POI (170% of base) - prominently larger
    const scaledRelevance =
      minSize + (maxRelevance / 100) * (maxSize - minSize);

    return scaledRelevance;
  };

  const relevancePercentage = calculateOverallRelevance();
  const scaledSize = (size * relevancePercentage) / 100;

  // Calculate opacity based on relevance (0.15 to 1.0 range for extreme contrast)
  const calculateOpacity = () => {
    const hasActiveFiltering =
      (filters?.selectedItemTypes?.length ?? 0) > 0 ||
      (place.overallRelevance !== undefined && place.overallRelevance !== 100);
    if (!hasActiveFiltering) {
      return 1.0; // Full opacity when no filters
    }

    // Scale relevance percentage (20-170) to opacity (0.15-1.0) - extreme range
    const { MIN: minOpacity, MAX: maxOpacity } = MAP_CONFIG.OPACITY;

    // Normalize relevance to 0-1 range, then scale to opacity range
    const normalizedRelevance = (relevancePercentage - 20) / (170 - 20); // 20-170 -> 0-1
    const opacity =
      minOpacity + normalizedRelevance * (maxOpacity - minOpacity);

    return Math.max(minOpacity, Math.min(maxOpacity, opacity));
  };

  const backgroundOpacity = calculateOpacity();

  // Get icon for primary category
  const getCategoryIcon = (category: string, iconSize: number) => {
    const iconProps = { size: iconSize };

    switch (category?.toLowerCase()) {
      // Beer bar
      case "beer_bar":
      case "beer_garden":
      case "sports_bar":
      case "pub":
      case "brewery":
        return <MdSportsBar {...iconProps} />;
      // Wine bar
      case "wine_bar":
      case "wine_tasting_room":
      case "winery":
      case "sake_bar":
        return <MdWineBar {...iconProps} />;
      // Cocktail bar
      case "cocktail_bar":
      case "lounge":
      case "bar":
        return <MdLocalBar {...iconProps} />;
      // Spirits bar
      case "whiskey_bar":
      case "distillery":
        return <MdLiquor {...iconProps} />;
      // Coffee
      case "cafe":
      case "coffee_shop":
      case "coffee_roastery":
        return <MdLocalCafe {...iconProps} />;
      // Food
      case "restaurant":
      case "gastropub":
      case "tapas_bar":
        return <MdRestaurant {...iconProps} />;
      // Retail (grocery)
      case "grocery_store":
      case "grocery":
      case "supermarket":
      case "specialty_grocery_store":
      case "organic_grocery_store":
        return <MdLocalGroceryStore {...iconProps} />;
      // Retail (liquor)
      case "liquor_store":
      case "beer_wine_and_spirits":
      case "beverage_store":
      case "wine_wholesaler":
        return <MdLiquor {...iconProps} />;
      // Other
      case "hotel":
      case "resort":
        return <MdHotel {...iconProps} />;
      case "casino":
        return <MdCasino {...iconProps} />;
      case "nightclub":
        return <MdMusicNote {...iconProps} />;
      default:
        return <MdRestaurant {...iconProps} />;
    }
  };

  // Calculate scale factor for smooth animations (scale relative to base size)
  const scaleFactor = scaledSize / size;

  // Memoize animate target to avoid Framer Motion re-evaluating on every render
  const animateTarget = useMemo(
    () => ({
      ...variants.visible,
      scale: scaleFactor,
    }),
    [variants.visible, scaleFactor],
  );

  const transitionConfig = useMemo(
    () => ({
      ...transition,
      scale: { duration: 0.4, ease: "easeInOut" as const },
    }),
    [transition],
  );

  const baseStyle: React.CSSProperties = {
    position: "relative",
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const content = (
    <>
      {/* Center icon */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          width: getMarkerCircleSize(size),
          height: getMarkerCircleSize(size),
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          borderWidth: "2px",
          borderStyle: "solid",
          backgroundColor: mostRelevantItemType
            ? `${ITEM_TYPE_COLORS[mostRelevantItemType]}${Math.round(
                backgroundOpacity * 255,
              )
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(255, 255, 255, ${backgroundOpacity * 0.9})`,
          borderColor: `rgba(255, 255, 255, ${backgroundOpacity * 0.8})`,
          transition: disableAnimations
            ? undefined
            : "background-color 0.3s ease-out, border-color 0.3s ease-out",
        }}
      >
        {getCategoryIcon(
          place.primary_category || place.categories?.[0] || "restaurant",
          getMarkerIconSize(size),
        )}
      </div>

      {/* Place label */}
      {showLabels && (
        <div
          className="poi-label"
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: "-15px",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            color: "#333",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            fontWeight: "500",
            whiteSpace: "nowrap",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            border: "1px solid rgba(0,0,0,0.1)",
            pointerEvents: "none",
            maxWidth: "120px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {place.name}
        </div>
      )}
    </>
  );

  if (disableAnimations) {
    return (
      <div
        className="relevance-poi-marker"
        role="img"
        aria-label={`POI marker for ${place.name}`}
        style={{ ...baseStyle, transform: `scale(${scaleFactor})` }}
      >
        {content}
      </div>
    );
  }

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate={animateTarget}
      exit="exit"
      transition={transitionConfig}
      className="relevance-poi-marker"
      role="img"
      aria-label={`POI marker for ${place.name}`}
      style={baseStyle}
    >
      {content}
    </motion.div>
  );
};

export const RelevanceMarker = React.memo(
  RelevanceMarkerComponent,
  (prev, next) => {
    return (
      prev.place.id === next.place.id &&
      prev.place.overallRelevance === next.place.overallRelevance &&
      prev.place.itemTypeScores === next.place.itemTypeScores &&
      prev.place.primary_category === next.place.primary_category &&
      prev.size === next.size &&
      prev.showLabels === next.showLabels &&
      prev.filters === next.filters
    );
  },
);

export default RelevanceMarker;
