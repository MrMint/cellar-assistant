/**
 * Function-specific types for processRecipePhoto
 *
 * This module defines all types related to recipe photo processing using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  isNonEmptyString,
  isOptionalString,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definition
// =============================================================================

/**
 * GraphQL mutation for processing recipe photos
 * This operation defines the complete interface for the processRecipePhoto function
 */
const PROCESS_RECIPE_PHOTO_MUTATION = graphql(`
  mutation ProcessRecipePhoto($input: ProcessRecipePhotoInput!) {
    processRecipePhoto(input: $input) {
      success
      recipesCreated
      totalIngredients
      enhancementsApplied
      results {
        success
        recipeName
        recipeId
        ingredientsCreated
        instructionsCreated
        error
      }
      menuAnalysis {
        extraction_method
        recipes_extracted
        restaurant_type
      }
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input type for processRecipePhoto function
 * Extracted from the ProcessRecipePhoto mutation variables
 */
export type ProcessRecipePhotoInput = VariablesOf<
  typeof PROCESS_RECIPE_PHOTO_MUTATION
>["input"];

/**
 * Output type for processRecipePhoto function
 * Extracted from the ProcessRecipePhoto mutation result
 */
export type ProcessRecipePhotoOutput = ResultOf<
  typeof PROCESS_RECIPE_PHOTO_MUTATION
>["processRecipePhoto"];

/**
 * Individual result item from processRecipePhoto function
 */
export type ProcessRecipePhotoResult =
  NonNullable<ProcessRecipePhotoOutput>["results"][number];

/**
 * Menu analysis result from processRecipePhoto function
 */
export type MenuAnalysis =
  NonNullable<ProcessRecipePhotoOutput>["menuAnalysis"];

// =============================================================================
// Type Aliases for Convenience
// =============================================================================

/**
 * Request type alias for better readability in function implementation
 */
export type RecipePhotoRequest = ProcessRecipePhotoInput;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches ProcessRecipePhotoInput
 */
export function isProcessRecipePhotoInput(
  value: unknown,
): value is ProcessRecipePhotoInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.photoId === "string" &&
    input.photoId.length > 0 &&
    typeof input.userId === "string" &&
    input.userId.length > 0 &&
    (input.placeId === undefined ||
      input.placeId === null ||
      typeof input.placeId === "string") &&
    (input.menuItemId === undefined ||
      input.menuItemId === null ||
      typeof input.menuItemId === "string")
  );
}

/**
 * Enhanced validation for ProcessRecipePhotoInput with detailed error messages
 */
export function validateProcessRecipePhotoInput(
  value: unknown,
): ProcessRecipePhotoInput {
  const input = validateObjectInput(value, "processRecipePhoto");

  // Validate required fields
  const photoId = validateRequiredField(
    input,
    "photoId",
    isNonEmptyString,
    "processRecipePhoto",
  );

  const userId = validateRequiredField(
    input,
    "userId",
    isNonEmptyString,
    "processRecipePhoto",
  );

  // Validate optional fields
  const placeId = validateOptionalField(
    input,
    "placeId",
    isOptionalString,
    "processRecipePhoto",
  );

  const menuItemId = validateOptionalField(
    input,
    "menuItemId",
    isOptionalString,
    "processRecipePhoto",
  );

  return {
    photoId,
    userId,
    placeId,
    menuItemId,
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
