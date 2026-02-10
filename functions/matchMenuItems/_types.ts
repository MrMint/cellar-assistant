/**
 * Function-specific types for matchMenuItems
 */

import {
  FunctionValidationError,
  isNonEmptyString,
  isOptionalString,
  isValidUUID,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Request interface for matchMenuItems function
 */
export interface MatchMenuItemsRequest {
  menuItemId?: string;
  placeId?: string;
  userId: string;
  batchProcess?: boolean;
}

/**
 * Menu item data structure
 */
export interface MenuItemData {
  id: string;
  menu_item_name: string;
  menu_item_description?: string;
  detected_item_type: string;
  confidence_score: number;
  extracted_attributes: Record<string, unknown>;
}

/**
 * Match result structure
 */
export interface MatchResult {
  menuItemId: string;
  matches: Array<{
    itemId: string;
    itemType: string;
    confidence: number;
    reasoning: string;
    similarityMetrics: {
      nameScore: number;
      attributeScore: number;
      overallScore: number;
    };
  }>;
}

/**
 * Similarity metrics for matching
 */
export interface SimilarityMetrics {
  nameScore: number;
  attributeScore: number;
  overallScore: number;
}

/**
 * Individual match suggestion
 */
export interface MatchSuggestion {
  itemId: string;
  itemType: string;
  confidence: number;
  reasoning: string;
  similarityMetrics: SimilarityMetrics;
}

/**
 * Match processing context
 */
export interface MatchProcessingContext {
  userId: string;
  menuItemId?: string;
  placeId?: string;
  batchProcess: boolean;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches MatchMenuItemsRequest
 */
export function isMatchMenuItemsRequest(
  value: unknown,
): value is MatchMenuItemsRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.userId === "string" &&
    input.userId.length > 0 &&
    (input.menuItemId === undefined || typeof input.menuItemId === "string") &&
    (input.placeId === undefined || typeof input.placeId === "string") &&
    (input.batchProcess === undefined ||
      typeof input.batchProcess === "boolean") &&
    // At least one of menuItemId or placeId must be provided
    (input.menuItemId !== undefined || input.placeId !== undefined)
  );
}

/**
 * Enhanced validation for MatchMenuItemsRequest with detailed error messages
 */
export function validateMatchMenuItemsRequest(
  value: unknown,
): MatchMenuItemsRequest {
  const input = validateObjectInput(value, "matchMenuItems");

  // Validate required userId
  const userId = validateRequiredField(
    input,
    "userId",
    isNonEmptyString,
    "matchMenuItems",
  );

  // Validate optional menuItemId
  const menuItemId = validateOptionalField(
    input,
    "menuItemId",
    (value: unknown): value is string | undefined => {
      if (value === undefined) return true;
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "matchMenuItems",
  );

  // Validate optional placeId
  const placeId = validateOptionalField(
    input,
    "placeId",
    (value: unknown): value is string | undefined => {
      if (value === undefined) return true;
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "matchMenuItems",
  );

  // Validate optional batchProcess
  const batchProcess = validateOptionalField(
    input,
    "batchProcess",
    (value: unknown): value is boolean | undefined => {
      return value === undefined || typeof value === "boolean";
    },
    "matchMenuItems",
  );

  // Ensure at least one of menuItemId or placeId is provided
  if (!menuItemId && !placeId) {
    throw new FunctionValidationError(
      "matchMenuItems",
      "menuItemId or placeId",
      "at least one of menuItemId or placeId must be provided",
      { menuItemId, placeId },
    );
  }

  return {
    userId,
    menuItemId,
    placeId,
    batchProcess: batchProcess ?? false,
  };
}

/**
 * Validates menu item data structure
 */
export function validateMenuItemData(value: unknown): MenuItemData {
  const input = validateObjectInput(value, "menuItemData");

  const id = validateRequiredField(
    input,
    "id",
    isNonEmptyString,
    "menuItemData",
  );
  const menu_item_name = validateRequiredField(
    input,
    "menu_item_name",
    isNonEmptyString,
    "menuItemData",
  );
  const detected_item_type = validateRequiredField(
    input,
    "detected_item_type",
    isNonEmptyString,
    "menuItemData",
  );
  const confidence_score = validateRequiredField(
    input,
    "confidence_score",
    (value: unknown): value is number =>
      typeof value === "number" && value >= 0 && value <= 1,
    "menuItemData",
  );

  const menu_item_description = validateOptionalField(
    input,
    "menu_item_description",
    isOptionalString,
    "menuItemData",
  );

  const extracted_attributes =
    validateOptionalField(
      input,
      "extracted_attributes",
      (value: unknown): value is Record<string, unknown> | undefined => {
        return (
          value === undefined || (typeof value === "object" && value !== null)
        );
      },
      "menuItemData",
    ) ?? {};

  return {
    id,
    menu_item_name,
    menu_item_description,
    detected_item_type,
    confidence_score,
    extracted_attributes,
  };
}

/**
 * Creates a processing context from the request
 */
export function createMatchProcessingContext(
  request: MatchMenuItemsRequest,
): MatchProcessingContext {
  return {
    userId: request.userId,
    menuItemId: request.menuItemId,
    placeId: request.placeId,
    batchProcess: request.batchProcess ?? false,
  };
}

// =============================================================================
// Re-exports for Convenience
// =============================================================================

// Type-only re-exports
export type {
  FunctionResponse,
  FunctionValidationError,
} from "../_utils/function-types";
// Re-export common utilities for easy access
export {
  createFunctionResponse,
  validateFunctionInput,
} from "../_utils/function-types";
