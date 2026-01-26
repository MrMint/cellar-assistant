"use client";

import { motion } from "framer-motion";
import type { LatLngExpression } from "leaflet";
import type React from "react";
import { useCallback, useState } from "react";
import {
  MARKER_ANIMATION_TRANSITION,
  PLACE_ANIMATION_VARIANTS,
} from "../constants/animations";
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

  // State to capture z-index from RelevanceMarker
  const [zIndexOffset, setZIndexOffset] = useState<number>(25); // Default value
  const [pane, setPane] = useState<string>("overlayPane"); // Default pane

  // Callback to receive z-index from RelevanceMarker
  const handleZIndexCalculated = useCallback((zIndex: number) => {
    setZIndexOffset(zIndex);

    // Determine pane based on z-index for better layering control
    // Use default overlayPane as fallback if custom panes don't exist yet
    if (zIndex <= 10) {
      setPane("lowRelevancePane"); // Low relevance markers (z-index 1-10)
    } else if (zIndex <= 35) {
      setPane("mediumRelevancePane"); // Medium relevance markers (z-index 11-35)
    } else {
      setPane("highRelevancePane"); // High relevance markers (z-index 36-50)
    }
  }, []);

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
      <motion.div
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={transition}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      >
        <RelevanceMarker
          place={place}
          size={size}
          showLabels={showLabels}
          animationVariants={variants}
          animationTransition={transition}
          filters={filters}
          onZIndexCalculated={handleZIndexCalculated}
        />
      </motion.div>
    </ReactPortalMarker>
  );
};

export const PlaceMarker = PlaceMarkerComponent;
