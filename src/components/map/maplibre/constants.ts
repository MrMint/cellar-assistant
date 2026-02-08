/**
 * Shared constants for MapLibre map layers.
 * Single source of truth for layer and source IDs used across
 * MapLibreRenderer, POISymbolLayer, and useMapInteraction.
 */

/** Layer IDs that respond to click/hover interactions */
export const INTERACTIVE_LAYER_IDS = ["poi-pins", "cluster-circles"] as const;

/** All layer IDs in render order (bottom to top) */
export const LAYER_IDS = {
  CLUSTER_GLOW: "cluster-glow",
  CLUSTER_CIRCLES: "cluster-circles",
  CLUSTER_LABELS: "cluster-labels",
  POI_PINS: "poi-pins",
  USER_LOCATION_PULSE: "user-location-pulse",
  USER_LOCATION_DOT: "user-location-dot",
} as const;

/** GeoJSON source IDs */
export const SOURCE_IDS = {
  POIS: "pois",
  USER_LOCATION: "user-location",
} as const;
