/**
 * Function-specific types for searchNearbyPlaces
 *
 * This module defines all types related to nearby place searching using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  isPositiveNumber,
  isValidLatitude,
  isValidLongitude,
  isValidStringArray,
  validateObjectInput,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definition
// =============================================================================

/**
 * GraphQL query for searching nearby places
 * This operation defines the complete interface for the searchNearbyPlaces function
 */
const SEARCH_NEARBY_PLACES_QUERY = graphql(`
  query SearchNearbyPlaces($input: search_nearby_places_input!) {
    search_nearby_places(input: $input) {
      success
      places {
        id
        name
        primary_category
        confidence
        location
        distance_meters
      }
      total
      queryInfo {
        center {
          lat
          lng
        }
        radius
        categories
      }
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input type for searchNearbyPlaces function
 * Extracted from the SearchNearbyPlaces query variables
 */
export type SearchNearbyPlacesInput = VariablesOf<
  typeof SEARCH_NEARBY_PLACES_QUERY
>["input"];

/**
 * Output type for searchNearbyPlaces function
 * Extracted from the SearchNearbyPlaces query result
 */
export type SearchNearbyPlacesOutput = ResultOf<
  typeof SEARCH_NEARBY_PLACES_QUERY
>["search_nearby_places"];

/**
 * Individual place result from search nearby places function
 */
export type SearchNearbyPlace =
  NonNullable<SearchNearbyPlacesOutput>["places"][number];

/**
 * Query info from search nearby places function
 */
export type SearchQueryInfo =
  NonNullable<SearchNearbyPlacesOutput>["queryInfo"];

// =============================================================================
// Type Aliases for Convenience
// =============================================================================

/**
 * Request type alias for better readability in function implementation
 */
export type SearchRequest = SearchNearbyPlacesInput;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches SearchNearbyPlacesInput
 */
export function isSearchNearbyPlacesInput(
  value: unknown,
): value is SearchNearbyPlacesInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.latitude === "number" &&
    input.latitude >= -90 &&
    input.latitude <= 90 &&
    typeof input.longitude === "number" &&
    input.longitude >= -180 &&
    input.longitude <= 180 &&
    typeof input.radius === "number" &&
    input.radius > 0 &&
    typeof input.limit === "number" &&
    input.limit > 0 &&
    input.limit <= 1000 &&
    Array.isArray(input.categories) &&
    input.categories.every((cat) => typeof cat === "string")
  );
}

/**
 * Enhanced validation for SearchNearbyPlacesInput with detailed error messages
 */
export function validateSearchNearbyPlacesInput(
  value: unknown,
): SearchNearbyPlacesInput {
  const input = validateObjectInput(value, "searchNearbyPlaces");

  // Validate latitude
  const latitude = validateRequiredField(
    input,
    "latitude",
    isValidLatitude,
    "searchNearbyPlaces",
  );

  // Validate longitude
  const longitude = validateRequiredField(
    input,
    "longitude",
    isValidLongitude,
    "searchNearbyPlaces",
  );

  // Validate radius
  const radius = validateRequiredField(
    input,
    "radius",
    isPositiveNumber,
    "searchNearbyPlaces",
  );

  // Validate limit
  const limit = validateRequiredField(
    input,
    "limit",
    (value: unknown): value is number => {
      return isPositiveNumber(value) && value <= 1000;
    },
    "searchNearbyPlaces",
  );

  // Validate categories
  const categories = validateRequiredField(
    input,
    "categories",
    isValidStringArray,
    "searchNearbyPlaces",
  );

  return {
    latitude,
    longitude,
    radius,
    limit,
    categories,
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
