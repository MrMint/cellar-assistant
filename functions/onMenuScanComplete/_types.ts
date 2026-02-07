/**
 * Type definitions for onMenuScanComplete event trigger handler
 *
 * This function is triggered by Hasura when a menu_scans row has its
 * processing_status updated to "completed". It extracts the place_id
 * and triggers batch matching of menu items.
 */

import type { Menu_Scans } from "@cellar-assistant/shared";

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for onMenuScanComplete webhook function
 * Triggered by Hasura when menu_scans.processing_status is updated to "completed"
 */
export interface MenuScanCompleteInput {
  event: {
    data: {
      new: Menu_Scans;
      old: Menu_Scans;
    };
  };
  table: {
    name: string;
    schema: string;
  };
}

// =============================================================================
// Output Types
// =============================================================================

/**
 * Response from onMenuScanComplete function
 */
export interface MenuScanCompleteOutput {
  success: boolean;
  menuScanId: string;
  placeId?: string;
  message: string;
  matchingResult?: {
    itemsProcessed: number;
    totalMatches: number;
    highConfidenceMatches: number;
  };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate MenuScanCompleteInput
 */
export function isMenuScanCompleteInput(
  value: unknown,
): value is MenuScanCompleteInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;

  // Check event structure
  if (!data.event || typeof data.event !== "object") {
    return false;
  }

  const event = data.event as Record<string, unknown>;
  if (!event.data || typeof event.data !== "object") {
    return false;
  }

  const eventData = event.data as Record<string, unknown>;
  if (!eventData.new || typeof eventData.new !== "object") {
    return false;
  }

  const newItem = eventData.new as Record<string, unknown>;

  // Check required fields
  return typeof newItem.id === "string" && newItem.id.length > 0;
}

/**
 * Validates MenuScanCompleteInput and throws descriptive errors
 */
export function validateMenuScanCompleteInput(
  value: unknown,
): MenuScanCompleteInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid request body format");
  }

  const data = value as Record<string, unknown>;

  if (!data.event) {
    throw new Error("Missing event field");
  }

  if (typeof data.event !== "object") {
    throw new Error("Invalid event field type");
  }

  const event = data.event as Record<string, unknown>;
  if (!event.data || typeof event.data !== "object") {
    throw new Error("Missing or invalid event data");
  }

  const eventData = event.data as Record<string, unknown>;
  if (!eventData.new || typeof eventData.new !== "object") {
    throw new Error("Missing new menu_scans data");
  }

  if (!eventData.old || typeof eventData.old !== "object") {
    throw new Error("Missing old menu_scans data");
  }

  const newItem = eventData.new as Record<string, unknown>;
  if (!newItem.id) {
    throw new Error("Missing required field: id");
  }

  if (typeof newItem.id !== "string") {
    throw new Error("Invalid field type: id must be a string");
  }

  return value as MenuScanCompleteInput;
}
