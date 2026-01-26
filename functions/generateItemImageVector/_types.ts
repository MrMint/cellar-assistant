/**
 * Type definitions for generateItemImageVector function
 *
 * This function processes item image uploads to generate embeddings/vectors
 * for similarity search and recommendation features.
 */

import type { Item_Image } from "@cellar-assistant/shared";
import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Mutation to update item_image with generated vector
 */
export const UPDATE_ITEM_IMAGE_VECTOR_MUTATION = graphql(`
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
}

/**
 * Result from updating item_image with vector
 */
export type UpdateItemImageResult = ResultOf<
  typeof UPDATE_ITEM_IMAGE_VECTOR_MUTATION
>;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate ItemImageVectorInput
 */
export function isItemImageVectorInput(
  value: unknown,
): value is ItemImageVectorInput {
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
