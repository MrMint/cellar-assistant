"use client";

import type { LatLngExpression } from "leaflet";
import React, { useMemo } from "react";
import {
  MARKER_ANIMATION_TRANSITION,
  PLACE_ANIMATION_VARIANTS,
} from "../constants/animations";
import { MAP_CONFIG, calculateMarkerSize } from "../config/constants";
import type { PlaceMarkerProps } from "../types";
import ReactPortalMarker from "./ReactPortalMarker";
import RelevanceMarker from "./RelevanceMarker";

/**
 * Consolidated place marker component that combines ReactPortalMarker with RelevanceMarker
 * Eliminates the need for EnhancedPlaceMarker wrapper
 */
const PlaceMarkerComponent: React.FC<PlaceMarkerProps> = ({
  place,
  onPlaceClick,
  size = 36,
  showLabels = true,
  animationVariants,
  animationTransition,
  filters,
}) => {
  // Database coordinates should be [lng, lat] (PostGIS standard), convert to [lat, lng] for Leaflet
  const [lng, lat] = place.location.coordinates;

  const position: LatLngExpression = [lat, lng];

  // Use passed animation variants or fall back to defaults
  const variants = animationVariants || PLACE_ANIMATION_VARIANTS;
  const transition = animationTransition || MARKER_ANIMATION_TRANSITION;

  // Compute zIndex and pane directly to avoid state cycle with RelevanceMarker
  const { zIndexOffset, pane } = useMemo(() => {
    const hasActiveFiltering =
      (filters?.selectedItemTypes?.length ?? 0) > 0 ||
      (place.overallRelevance !== undefined && place.overallRelevance !== 100);

    if (!hasActiveFiltering) {
      return { zIndexOffset: 25, pane: "mediumRelevancePane" };
    }

    let relevancePercentage = 100;
    if (place.overallRelevance !== undefined) {
      relevancePercentage = calculateMarkerSize(place.overallRelevance);
    }

    const { MIN: minZIndex, MAX: maxZIndex } = MAP_CONFIG.Z_INDEX.MARKERS;
    const normalizedRelevance = (relevancePercentage - 20) / (170 - 20);
    const zIndex = Math.round(
      minZIndex + normalizedRelevance * (maxZIndex - minZIndex),
    );
    const clampedZIndex = Math.max(minZIndex, Math.min(maxZIndex, zIndex));

    const paneName =
      clampedZIndex <= 10
        ? "lowRelevancePane"
        : clampedZIndex <= 35
          ? "mediumRelevancePane"
          : "highRelevancePane";

    return { zIndexOffset: clampedZIndex, pane: paneName };
  }, [place.overallRelevance, filters?.selectedItemTypes]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event from bubbling to map
    onPlaceClick?.(place);
  };

  return (
    <ReactPortalMarker
      position={position}
      stableId={place.id}
      zIndexOffset={zIndexOffset}
      pane={pane}
    >
      <button
        type="button"
        onClick={handleClick}
        style={{
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
        }}
      >
        <RelevanceMarker
          place={place}
          size={size}
          showLabels={showLabels}
          animationVariants={variants}
          animationTransition={transition}
          filters={filters}
        />
      </button>
    </ReactPortalMarker>
  );
};

export const PlaceMarker = React.memo(PlaceMarkerComponent, (prev, next) => {
  return (
    prev.place.id === next.place.id &&
    prev.place.overallRelevance === next.place.overallRelevance &&
    prev.place.itemTypeScores === next.place.itemTypeScores &&
    prev.place.primary_category === next.place.primary_category &&
    prev.size === next.size &&
    prev.showLabels === next.showLabels &&
    prev.filters === next.filters &&
    prev.onPlaceClick === next.onPlaceClick
  );
});
