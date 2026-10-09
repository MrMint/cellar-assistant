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
  tea: "#2E7D32", // Green (matcha/green tea)
} as const;
