/**
 * Shared color constants for map components
 * Centralized color definitions to ensure consistency across markers and UI
 */

import type { ItemType } from "../types";

// Item type color palette - consistent across all map components
export const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  wine: "#8B0000", // Deep burgundy
  beer: "#DAA520", // Amber gold
  spirit: "#607D8B", // Blue-gray (needs contrast with white icons on pins)
  coffee: "#8B4513", // Rich brown
  sake: "#7B1FA2", // Deep purple (needs contrast with white icons on pins)
} as const;

// Joy UI color schemes for item types (used in UI components)
export const ITEM_TYPE_JOY_COLORS: Record<
  ItemType,
  "danger" | "warning" | "neutral" | "success"
> = {
  wine: "danger", // Red theme
  beer: "warning", // Amber theme
  spirit: "neutral", // Gray theme
  coffee: "success", // Brown/green theme
  sake: "neutral", // Purple/lavender theme (using neutral as closest match)
} as const;

// Theme-based colors for markers
export const MARKER_COLORS = {
  light: {
    background: "#ffffff",
    border: "#4285f4",
    text: "#333333",
    shadow: "rgba(66, 133, 244, 0.3)",
  },
  dark: {
    background: "#2c3e50",
    border: "#3498db",
    text: "#ffffff",
    shadow: "rgba(52, 152, 219, 0.3)",
  },
} as const;

// Neutral colors for general use
export const NEUTRAL_COLORS = {
  gray: "#808080",
  lightGray: "#e0e0e0",
  darkGray: "#404040",
} as const;

// Status colors
export const STATUS_COLORS = {
  success: "#4caf50",
  warning: "#ff9800",
  error: "#f44336",
  info: "#2196f3",
} as const;

// Helper function to get theme-appropriate marker colors
export function getMarkerColors(isDarkMode: boolean) {
  return isDarkMode ? MARKER_COLORS.dark : MARKER_COLORS.light;
}

// Helper function to get item type color
export function getItemTypeColor(itemType: ItemType): string {
  return ITEM_TYPE_COLORS[itemType] || NEUTRAL_COLORS.gray;
}

// Helper function to get Joy UI color scheme for item type
export function getItemTypeJoyColor(itemType: ItemType) {
  return ITEM_TYPE_JOY_COLORS[itemType] || "neutral";
}
