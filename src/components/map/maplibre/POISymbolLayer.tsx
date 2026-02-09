"use client";

import { useMemo } from "react";
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import type { MapDataItem, MapFilters } from "../types";
import { LAYER_IDS, SOURCE_IDS } from "./constants";
import { transformToGeoJSON } from "./utils/geoJsonTransform";

interface POISymbolLayerProps {
  items: MapDataItem[];
  filters?: MapFilters;
  isDarkMode?: boolean;
}

// --- Static layer definitions (stable references, defined outside the component) ---

// Layout properties are theme-independent so they stay as module-level constants.
const poiLayout: SymbolLayerSpecification["layout"] = {
  "icon-image": ["get", "pinImageName"],
  "icon-size": 0.85,
  "icon-anchor": "bottom",
  "icon-allow-overlap": true,
  "text-field": ["get", "name"],
  "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11, 18, 12],
  "text-variable-anchor": ["right", "left"],
  "text-radial-offset": 1.4,
  "text-justify": "auto",
  "text-max-width": 7,
  "text-optional": true,
  "text-allow-overlap": false,
  "symbol-sort-key": ["*", ["get", "sortKey"], -1],
};

// Outer glow — soft gradient that fades outward from the cluster
const clusterGlowLayer: CircleLayerSpecification = {
  id: LAYER_IDS.CLUSTER_GLOW,
  type: "circle",
  source: SOURCE_IDS.POIS,
  filter: ["==", ["get", "isCluster"], true],
  paint: {
    "circle-radius": ["*", ["get", "radius"], 2.2],
    "circle-color": "#5c6bc0",
    "circle-blur": 1,
    "circle-opacity": 0.2,
  },
};

// Inner core — readable center with subtle blur on the edge
const clusterCoreLayer: CircleLayerSpecification = {
  id: LAYER_IDS.CLUSTER_CIRCLES,
  type: "circle",
  source: SOURCE_IDS.POIS,
  filter: ["==", ["get", "isCluster"], true],
  paint: {
    "circle-radius": ["get", "radius"],
    "circle-color": "#5c6bc0",
    "circle-blur": 0.35,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "rgba(255, 255, 255, 0.7)",
    "circle-opacity": 0.55,
  },
};

const clusterLabelsLayer: SymbolLayerSpecification = {
  id: LAYER_IDS.CLUSTER_LABELS,
  type: "symbol",
  source: SOURCE_IDS.POIS,
  filter: ["==", ["get", "isCluster"], true],
  layout: {
    "text-field": ["get", "displayCount"],
    "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
    "text-size": ["step", ["get", "pointCount"], 10, 10, 11, 100, 12, 1000, 14],
    "text-allow-overlap": true,
  },
  paint: {
    "text-color": "#fff",
  },
};

export function POISymbolLayer({
  items,
  filters,
  isDarkMode,
}: POISymbolLayerProps) {
  const geoJson = useMemo(
    () => transformToGeoJSON(items, filters),
    [items, filters],
  );

  // Paint properties vary with theme — dark mode uses light text + dark halo
  // for readability against dark basemap tiles.
  const poiLayer: SymbolLayerSpecification = useMemo(
    () => ({
      id: LAYER_IDS.POI_PINS,
      type: "symbol",
      source: SOURCE_IDS.POIS,
      filter: ["!=", ["get", "isCluster"], true],
      layout: poiLayout,
      paint: {
        "icon-opacity": ["get", "opacity"],
        "text-color": isDarkMode
          ? [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#8ab4f8", // lighter blue for hover on dark bg
              "#e0e0e0", // light gray for labels on dark bg
            ]
          : [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#1a73e8",
              ["get", "itemTypeColor"],
            ],
        "text-halo-color": isDarkMode ? "rgba(0, 0, 0, 0.8)" : "#fff",
        "text-halo-width": 1.5,
        "text-opacity": ["get", "opacity"],
        "text-translate": [0, -19],
      },
    }),
    [isDarkMode],
  );

  return (
    <Source id={SOURCE_IDS.POIS} type="geojson" data={geoJson} promoteId="id">
      <Layer {...clusterGlowLayer} />
      <Layer {...clusterCoreLayer} />
      <Layer {...clusterLabelsLayer} />
      <Layer {...poiLayer} />
    </Source>
  );
}
