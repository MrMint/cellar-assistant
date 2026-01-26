"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Component to create custom map panes for z-index control of POI markers
 * Based on relevance levels for proper layering
 */
export function MapPanes() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Create custom panes for different relevance levels immediately
    // Z-index values: overlayPane (400) < shadowPane (500) < markerPane (600) < tooltipPane (650) < popupPane (700)

    try {
      // Low relevance markers - below regular overlays
      if (!map.getPane("lowRelevancePane")) {
        const lowPane = map.createPane("lowRelevancePane");
        lowPane.style.zIndex = "350"; // Below default overlayPane (400)
      }

      // Medium relevance markers - at overlay level
      if (!map.getPane("mediumRelevancePane")) {
        const mediumPane = map.createPane("mediumRelevancePane");
        mediumPane.style.zIndex = "420"; // Above default overlayPane (400)
      }

      // High relevance markers - above overlays but below popups
      if (!map.getPane("highRelevancePane")) {
        const highPane = map.createPane("highRelevancePane");
        highPane.style.zIndex = "450"; // Above overlays, below popups
      }
    } catch (error) {
      // Log pane creation errors in development for debugging
      if (process.env.NODE_ENV === "development") {
        console.warn("[MapPanes] Error creating custom map panes:", error);
      }
    }
  }, [map]);

  return null; // This component doesn't render anything
}
