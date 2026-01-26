/**
 * Function-specific types for uploadItemImage
 *
 * This module defines all types related to item image uploading using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  ITEM_TYPES,
  type ItemTypeValue,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  type FunctionRequest,
  isNonEmptyString,
  isValidImageDataUrl,
  isValidItemType,
  isValidUUID,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definition
// =============================================================================

/**
 * GraphQL mutation for uploading item images
 * This operation defines the complete interface for the uploadItemImage function
 */
const ITEM_IMAGE_UPLOAD_MUTATION = graphql(`
  mutation ItemImageUpload($input: item_image_upload_input!) {
    item_image_upload(input: $input) {
      success
      item_id
      image_url
      error
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input type for item image upload (the nested input)
 * Extracted from the ItemImageUpload mutation variables
 */
export type ItemImageUploadInput = VariablesOf<
  typeof ITEM_IMAGE_UPLOAD_MUTATION
>["input"];

/**
 * Output type for uploadItemImage function
 * Extracted from the ItemImageUpload mutation result
 */
export type ItemImageUploadOutput = ResultOf<
  typeof ITEM_IMAGE_UPLOAD_MUTATION
>["item_image_upload"];

/**
 * Full request type including session variables (matches current function signature)
 */
export interface UploadImageInput
  extends FunctionRequest<{ input: ItemImageUploadInput }> {
  input: { input: ItemImageUploadInput };
}

// =============================================================================
// Type Aliases for Convenience
// =============================================================================

/**
 * Valid item types for image uploads
 * Re-exported from shared package for convenience
 */
export type ValidItemType = ItemTypeValue;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches ItemImageUploadInput
 */
export function isItemImageUploadInput(
  value: unknown,
): value is ItemImageUploadInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.image === "string" &&
    input.image.length > 0 &&
    typeof input.item_id === "string" &&
    input.item_id.length > 0 &&
    typeof input.item_type === "string" &&
    ITEM_TYPES.includes(input.item_type as ItemTypeValue)
  );
}

/**
 * Enhanced validation for ItemImageUploadInput with detailed error messages
 */
export function validateItemImageUploadInput(
  value: unknown,
): ItemImageUploadInput {
  const input = validateObjectInput(value, "itemImageUpload");

  // Validate image (base64 string)
  const image = validateRequiredField(
    input,
    "image",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidImageDataUrl(value);
    },
    "itemImageUpload",
  );

  // Validate item_id (UUID)
  const item_id = validateRequiredField(
    input,
    "item_id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "itemImageUpload",
  );

  // Validate item_type
  const item_type = validateRequiredField(
    input,
    "item_type",
    (value: unknown): value is ValidItemType => {
      return isNonEmptyString(value) && isValidItemType(value);
    },
    "itemImageUpload",
  );

  return {
    image,
    item_id,
    item_type: item_type as ValidItemType,
  };
}

/**
 * Enhanced validation for the full UploadImageInput (including session variables)
 */
export function validateUploadImageInput(value: unknown): UploadImageInput {
  const body = validateObjectInput(value, "uploadItemImage");

  // Validate required top-level fields
  const input = validateRequiredField(
    body,
    "input",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "uploadItemImage",
  );

  // Validate nested input structure
  const nestedInput = validateRequiredField(
    input as Record<string, unknown>,
    "input",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "uploadItemImage",
  );

  // Validate the actual item image upload data
  const validatedInput = validateItemImageUploadInput(nestedInput);

  // Validate session variables (optional but should be valid if present)
  const session_variables = validateOptionalField(
    body,
    "session_variables",
    (value: unknown): value is Record<string, string | undefined> => {
      return typeof value === "object" && value !== null;
    },
    "uploadItemImage",
  );

  return {
    input: { input: validatedInput },
    session_variables,
  };
}

// =============================================================================
// Re-exports for Convenience
// =============================================================================

// Type-only re-exports
export type {
  FunctionRequest,
  FunctionResponse,
  FunctionValidationError,
} from "../_utils/function-types";
// Re-export common utilities for easy access
export {
  createFunctionResponse,
  validateFunctionInput,
} from "../_utils/function-types";
