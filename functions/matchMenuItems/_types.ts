/**
 * Function-specific types for matchMenuItems
 *
 * This module defines all types related to menu item matching using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
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
// GraphQL Operation Definitions
// =============================================================================

/**
 * GraphQL operations for menu item matching
 */
const GET_MENU_ITEM_QUERY = graphql(`
  query GetMenuItem($id: uuid!) {
    place_menu_items_by_pk(id: $id) {
      id
      menu_item_name
      menu_item_description
      detected_item_type
      confidence_score
      extracted_attributes
      place_id
      place {
        id
        name
      }
    }
  }
`);

const GET_UNMATCHED_MENU_ITEMS_QUERY = graphql(`
  query GetUnmatchedMenuItems($placeId: uuid!) {
    place_menu_items(
      where: {
        place_id: { _eq: $placeId }
        item_match_suggestions: { _is_null: true }
      }
    ) {
      id
      menu_item_name
      menu_item_description
      detected_item_type
      confidence_score
      extracted_attributes
    }
  }
`);

const CLEAR_EXISTING_SUGGESTIONS_MUTATION = graphql(`
  mutation ClearExistingSuggestions($menuItemId: uuid!) {
    delete_item_match_suggestions(
      where: { menu_item_id: { _eq: $menuItemId } }
    ) {
      affected_rows
    }
  }
`);

const CREATE_MATCH_SUGGESTIONS_MUTATION = graphql(`
  mutation CreateMatchSuggestions($suggestions: [item_match_suggestions_insert_input!]!) {
    insert_item_match_suggestions(objects: $suggestions) {
      affected_rows
      returning {
        id
        menu_item_id
        item_id
        item_type
        confidence_score
        reasoning
        similarity_metrics
      }
    }
  }
`);

const GET_ITEMS_BY_TYPE_QUERY = graphql(`
  query GetItemsByType($itemType: String!) {
    wines(limit: 1000, where: { name: { _is_null: false } }) @include(if: $itemType == "wine") {
      id
      name
      style
      variety
      country
      region
      producer_name
      alcohol_content_percentage
    }
    beers(limit: 1000, where: { name: { _is_null: false } }) @include(if: $itemType == "beer") {
      id
      name
      style
      country
      region
      producer_name
      alcohol_content_percentage
    }
    spirits(limit: 1000, where: { name: { _is_null: false } }) @include(if: $itemType == "spirit") {
      id
      name
      type
      country
      region
      producer_name
      alcohol_content_percentage
    }
    coffees(limit: 1000, where: { name: { _is_null: false } }) @include(if: $itemType == "coffee") {
      id
      name
      roast_level
      species
      country
      region
      producer_name
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for menu item matching operations
 */
export type GetMenuItemInput = VariablesOf<typeof GET_MENU_ITEM_QUERY>;
export type GetUnmatchedMenuItemsInput = VariablesOf<
  typeof GET_UNMATCHED_MENU_ITEMS_QUERY
>;
export type ClearExistingSuggestionsInput = VariablesOf<
  typeof CLEAR_EXISTING_SUGGESTIONS_MUTATION
>;
export type CreateMatchSuggestionsInput = VariablesOf<
  typeof CREATE_MATCH_SUGGESTIONS_MUTATION
>;
export type GetItemsByTypeInput = VariablesOf<typeof GET_ITEMS_BY_TYPE_QUERY>;

/**
 * Output types for menu item matching operations
 */
export type GetMenuItemOutput = ResultOf<
  typeof GET_MENU_ITEM_QUERY
>["place_menu_items_by_pk"];
export type GetUnmatchedMenuItemsOutput = ResultOf<
  typeof GET_UNMATCHED_MENU_ITEMS_QUERY
>["place_menu_items"];
export type ClearExistingSuggestionsOutput = ResultOf<
  typeof CLEAR_EXISTING_SUGGESTIONS_MUTATION
>["delete_item_match_suggestions"];
export type CreateMatchSuggestionsOutput = ResultOf<
  typeof CREATE_MATCH_SUGGESTIONS_MUTATION
>["insert_item_match_suggestions"];
export type GetItemsByTypeOutput = ResultOf<typeof GET_ITEMS_BY_TYPE_QUERY>;

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
 * Database item structure
 */
export interface DatabaseItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Items grouped by type response
 */
export interface ItemsByTypeResponse {
  wines?: DatabaseItem[];
  beers?: DatabaseItem[];
  spirits?: DatabaseItem[];
  coffees?: DatabaseItem[];
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
