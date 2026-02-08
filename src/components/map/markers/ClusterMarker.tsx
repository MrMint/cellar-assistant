"use client";

import { motion } from "framer-motion";
import type React from "react";
import {
  CLUSTER_ANIMATION_VARIANTS,
  HOVER_SCALE,
  MARKER_ANIMATION_TRANSITION,
} from "../constants/animations";
import { getMarkerColors } from "../constants/colors";
import type { ClusterMarkerProps } from "../types";
import ReactPortalMarker from "./ReactPortalMarker";

/**
 * Optimized cluster marker component
 * Separated from POILayer for better maintainability
 */
export function ClusterMarker({
  position,
  pointCount,
  clusterId,
  isDarkMode = false,
  isDensityHigh = false,
  onClusterClick,
  animationVariants,
  animationTransition,
}: ClusterMarkerProps) {
  // Use passed animation variants or defaults
  const variants = animationVariants || CLUSTER_ANIMATION_VARIANTS;
  const transition = animationTransition || MARKER_ANIMATION_TRANSITION;

  // Calculate cluster size based on point count (more granular tiers)
  const size =
    pointCount < 10
      ? 40
      : pointCount < 100
        ? 50
        : pointCount < 1000
          ? 60
          : pointCount < 10000
            ? 70
            : 80;

  // Format large numbers with abbreviation (e.g., 28329 → "28K")
  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${Math.round(count / 1000000)}M`;
    if (count >= 1000) return `${Math.round(count / 1000)}K`;
    return String(count);
  };
  const displayCount = formatCount(pointCount);

  // Colors based on theme
  const colors = getMarkerColors(isDarkMode);
  const {
    background: backgroundColor,
    border: borderColor,
    text: textColor,
    shadow,
  } = colors;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClusterClick?.(clusterId);
  };

  return (
    <ReactPortalMarker position={position} stableId={`cluster-${clusterId}`}>
      <motion.div
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={transition}
        whileHover={{ scale: HOVER_SCALE }}
        onClick={handleClick}
        style={{
          position: "relative",
          width: size,
          height: size,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor,
            border: `3px solid ${borderColor}`,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 2px 12px ${shadow}`,
          }}
        >
          <span
            style={{
              color: textColor,
              fontFamily:
                "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: "500",
              fontSize:
                size >= 70
                  ? "18px"
                  : size >= 50
                    ? "16px"
                    : size >= 45
                      ? "14px"
                      : "13px",
              lineHeight: 1,
            }}
          >
            {displayCount}
          </span>
        </div>
      </motion.div>
    </ReactPortalMarker>
  );
}
