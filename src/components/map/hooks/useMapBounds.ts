"use client";

import type { Map as LeafletMap } from "leaflet";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { MAP_CONFIG } from "../config/constants";
import type { MapBounds } from "../types";
import { debounce } from "../utils/debounce";

export function useMapBounds() {
  const [bounds, setBounds] = useState<MapBounds | undefined>(undefined);
  const mapRef = useRef<LeafletMap | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Update bounds from the map instance
  const updateBounds = useCallback((map: LeafletMap) => {
    const leafletBounds = map.getBounds();
    const newBounds: MapBounds = {
      north: leafletBounds.getNorth(),
      south: leafletBounds.getSouth(),
      east: leafletBounds.getEast(),
      west: leafletBounds.getWest(),
    };
    setBounds(newBounds);
  }, []);

  // Use longer debounce on mobile to reduce fetches during pan gestures
  const debounceMs = isMobile
    ? MAP_CONFIG.TIMING.BOUNDS_UPDATE_DEBOUNCE_MOBILE
    : MAP_CONFIG.TIMING.BOUNDS_UPDATE_DEBOUNCE;

  const debouncedUpdateBounds = useMemo(
    () => debounce(updateBounds, debounceMs),
    [updateBounds, debounceMs],
  );

  // Setup map event listeners
  const setupMapListeners = useCallback(
    (map: LeafletMap) => {
      mapRef.current = map;

      // Initial bounds update
      updateBounds(map);

      // Listen for map movements
      const handleMoveEnd = () => debouncedUpdateBounds(map);
      const handleZoomEnd = () => debouncedUpdateBounds(map);

      map.on("moveend", handleMoveEnd);
      map.on("zoomend", handleZoomEnd);

      // Return cleanup function
      return () => {
        map.off("moveend", handleMoveEnd);
        map.off("zoomend", handleZoomEnd);
      };
    },
    [updateBounds, debouncedUpdateBounds],
  );

  return {
    bounds,
    setupMapListeners,
  };
}
