/**
 * Centralized configuration constants for map components
 *
 * This file consolidates all hardcoded values that were previously
 * scattered across map components to improve maintainability and
 * provide a single source of truth for configuration.
 */

export const MAP_CONFIG = {
  // Animation durations and timing
  ANIMATION: {
    MARKER_DURATION: 0.3,
    HOVER_DURATION: 0.2,
    DRAWER_OPACITY_DURATION: 0.15,
    DRAWER_TRANSITION_DURATION: 0.2,
    HOVER_SCALE: 1.1,
  },

  // Marker sizing and appearance
  MARKER: {
    DEFAULT_SIZE: 100,
    MIN_SIZE_PERCENT: 20, // Smallest POI (20% of base)
    MAX_SIZE_PERCENT: 170, // Largest POI (170% of base)
    Z_INDEX_OFFSET: 25,
    CIRCLE_SIZE_RATIO: 0.6, // Circle is 60% of marker size
    ICON_SIZE_RATIO: 0.4, // Icon is 40% of marker size
  },

  // Opacity values
  OPACITY: {
    MIN: 0.15,
    MAX: 1.0,
    HOVER_MULTIPLIER: 1.2,
  },

  // Z-Index management system
  Z_INDEX: {
    // Marker layers
    MARKERS: {
      MIN: 1,
      MAX: 50,
    },
    // UI component layers
    LABEL_BASE: 1000,
    LABEL_TIER_1: 1001,
    LABEL_TIER_2: 1002,
    LABEL_TIER_3: 1003,
    LABEL_TIER_4: 1004,
    // Control layers
    CONTROLS: 1000,
    DRAWER_BACKDROP: 949,
    DRAWER: 950,
    FILTER: 1200,
    OVERLAY: 10000,
  },

  // Search and query limits
  SEARCH: {
    PLACES_LIMIT: 500,
    SEMANTIC_LIMIT: 20,
    MENU_ITEMS_LIMIT: 3,
    DISCOVERY_LIMIT: 20,
    MAX_DISTANCE: 0.8,
  },

  // Timing and performance
  TIMING: {
    GEOLOCATION_TIMEOUT: 10000, // 10 seconds
    BOUNDS_UPDATE_DEBOUNCE: 300, // 300ms
    BOUNDS_UPDATE_DEBOUNCE_MOBILE: 500, // 500ms — longer on mobile for smoother panning
    SEARCH_DEBOUNCE: 500, // 500ms
  },

  // Default map settings
  DEFAULTS: {
    ZOOM: 12,
    CENTER: { lat: 37.7749, lng: -122.4194 }, // San Francisco
  },
} as const;

// Type the configuration for IntelliSense and validation
export type MapConfig = typeof MAP_CONFIG;

// Helper functions for common calculations
export const calculateMarkerSize = (relevance: number): number => {
  const { MIN_SIZE_PERCENT, MAX_SIZE_PERCENT, DEFAULT_SIZE } =
    MAP_CONFIG.MARKER;
  const minSize = (MIN_SIZE_PERCENT / 100) * DEFAULT_SIZE;
  const maxSize = (MAX_SIZE_PERCENT / 100) * DEFAULT_SIZE;
  return minSize + (relevance / 100) * (maxSize - minSize);
};

export const getMarkerCircleSize = (markerSize: number): number => {
  return markerSize * MAP_CONFIG.MARKER.CIRCLE_SIZE_RATIO;
};

export const getMarkerIconSize = (markerSize: number): number => {
  return markerSize * MAP_CONFIG.MARKER.ICON_SIZE_RATIO;
};

// Validation function (for future use)
export const validateMapConfig = (config: MapConfig): boolean => {
  // Add runtime validation for configuration values
  const { MARKER, OPACITY, Z_INDEX } = config;

  return (
    MARKER.MIN_SIZE_PERCENT >= 0 &&
    MARKER.MAX_SIZE_PERCENT > MARKER.MIN_SIZE_PERCENT &&
    OPACITY.MIN >= 0 &&
    OPACITY.MIN <= 1 &&
    OPACITY.MAX >= 0 &&
    OPACITY.MAX <= 1 &&
    OPACITY.MAX >= OPACITY.MIN &&
    Z_INDEX.MARKERS.MIN >= 0 &&
    Z_INDEX.MARKERS.MAX > Z_INDEX.MARKERS.MIN
  );
};
