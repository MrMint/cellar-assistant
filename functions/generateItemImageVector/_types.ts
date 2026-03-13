/**
 * Type definitions for generateItemImageVector function
 *
 * When a new item_image is inserted, this function triggers re-generation
 * of the parent item's vector so the combined text+image embedding stays current.
 */

import type { Item_Image } from "@cellar-assistant/shared";

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for generateItemImageVector webhook function
 * Triggered by Hasura when a new item_image is inserted
 */
export interface ItemImageVectorInput {
  event: {
    data: {
      new: Item_Image;
    };
  };
}

// =============================================================================
// Output Types
// =============================================================================

/**
 * Response from generateItemImageVector function
 */
export interface ItemImageVectorOutput {
  success: boolean;
  itemImageId: string;
  retriggeredItem?: { type: string; id: string };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates ItemImageVectorInput and throws descriptive errors
 */
export function validateItemImageVectorInput(
  value: unknown,
): ItemImageVectorInput {
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
    throw new Error("Missing new item_image data");
  }

  const newItem = eventData.new as Record<string, unknown>;
  if (!newItem.id || !newItem.file_id) {
    throw new Error("Missing required fields: id or file_id");
  }

  if (typeof newItem.id !== "string" || typeof newItem.file_id !== "string") {
    throw new Error("Invalid field types: id and file_id must be strings");
  }

  return value as ItemImageVectorInput;
}
