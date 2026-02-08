"use client";

import type { Map as LeafletMap } from "leaflet";
import { useCallback, useRef, useState } from "react";
import type { MapBounds } from "../types";

/**
 * Non-debounced bounds tracker for viewport-based marker filtering.
 * Updates synchronously on every moveend/zoomend (not during drag).
 * Separate from useMapBounds which is debounced for server fetches.
 */
export function useViewportBounds() {
  const [viewportBounds, setViewportBounds] = useState<MapBounds | undefined>(
    undefined,
  );
  const mapRef = useRef<LeafletMap | null>(null);

  const updateViewportBounds = useCallback((map: LeafletMap) => {
    const b = map.getBounds();
    setViewportBounds({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, []);

  const setupViewportListeners = useCallback(
    (map: LeafletMap) => {
      mapRef.current = map;
      updateViewportBounds(map);

      const handler = () => updateViewportBounds(map);
      map.on("moveend", handler);
      map.on("zoomend", handler);

      return () => {
        map.off("moveend", handler);
        map.off("zoomend", handler);
      };
    },
    [updateViewportBounds],
  );

  return { viewportBounds, setupViewportListeners };
}
