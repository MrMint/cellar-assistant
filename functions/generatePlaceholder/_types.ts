/**
 * Type definitions for generatePlaceholder function
 *
 * This function generates placeholder images for item images using an external service.
 * It's triggered by Hasura when a new item_image is inserted.
 */

import type { Item_Image } from "@cellar-assistant/shared";
import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Mutation to update item_image with generated placeholder
 */
export const UPDATE_ITEM_IMAGE_PLACEHOLDER_MUTATION = graphql(`
  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {
    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {
      id
    }
  }
`);

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for generatePlaceholder webhook function
 * Triggered by Hasura when a new item_image is inserted
 */
export interface PlaceholderInput {
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
 * Response from generatePlaceholder function
 */
export interface PlaceholderOutput {
  success: boolean;
  itemImageId: string;
}

/**
 * Result from updating item_image with placeholder
 */
export type UpdateItemImagePlaceholderResult = ResultOf<
  typeof UPDATE_ITEM_IMAGE_PLACEHOLDER_MUTATION
>;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate PlaceholderInput
 */
export function isPlaceholderInput(value: unknown): value is PlaceholderInput {
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
  return (
    typeof newItem.id === "string" &&
    newItem.id.length > 0 &&
    typeof newItem.file_id === "string" &&
    newItem.file_id.length > 0
  );
}

/**
 * Validates PlaceholderInput and throws descriptive errors
 */
export function validatePlaceholderInput(value: unknown): PlaceholderInput {
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

  return value as PlaceholderInput;
}
