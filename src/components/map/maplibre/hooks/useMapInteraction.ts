"use client";

import { useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { INTERACTIVE_LAYER_IDS, SOURCE_IDS } from "../constants";

/**
 * Wires pointer-cursor and hover feature-state on interactive layers.
 *
 * @param mapRef  - ref to the react-map-gl Map
 * @param enabled - pass a flag (e.g. `iconsLoaded`) so the effect re-runs
 *                  once the map and layers are actually ready
 */
export function useMapInteraction(
  mapRef: React.RefObject<MapRef | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    const map = mapRef.current?.getMap();
    if (!map) return;

    let hoveredId: string | number | null = null;

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseMove = (e: MapLayerMouseEvent) => {
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: SOURCE_IDS.POIS, id: hoveredId },
          { hover: false },
        );
      }
      if (e.features?.[0]) {
        hoveredId = e.features[0].id ?? e.features[0].properties?.id;
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: SOURCE_IDS.POIS, id: hoveredId },
            { hover: true },
          );
        }
      }
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: SOURCE_IDS.POIS, id: hoveredId },
          { hover: false },
        );
        hoveredId = null;
      }
    };

    for (const layer of INTERACTIVE_LAYER_IDS) {
      map.on("mouseenter", layer, handleMouseEnter);
      map.on("mousemove", layer, handleMouseMove);
      map.on("mouseleave", layer, handleMouseLeave);
    }

    return () => {
      for (const layer of INTERACTIVE_LAYER_IDS) {
        map.off("mouseenter", layer, handleMouseEnter);
        map.off("mousemove", layer, handleMouseMove);
        map.off("mouseleave", layer, handleMouseLeave);
      }
    };
  }, [mapRef, enabled]);
}
