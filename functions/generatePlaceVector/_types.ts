/**
 * Function-specific types for generatePlaceVector
 *
 * This module defines all types related to place vector generation using gql.tada
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
 * GraphQL operations for place vector generation
 */
const UPDATE_PLACE_VECTOR_MUTATION = graphql(`
  mutation UpdatePlaceVector($id: uuid!, $vector: String!) {
    update_places_by_pk(
      pk_columns: { id: $id }
      _set: { search_vector: $vector }
    ) {
      id
      name
      search_vector
      updated_at
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for place vector operations
 */
export type UpdatePlaceVectorInput = VariablesOf<
  typeof UPDATE_PLACE_VECTOR_MUTATION
>;

/**
 * Output types for place vector operations
 */
export type UpdatePlaceVectorOutput = ResultOf<
  typeof UPDATE_PLACE_VECTOR_MUTATION
>["update_places_by_pk"];

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Valid item types for menu items
 */
export type ItemType = "wine" | "beer" | "spirit" | "coffee" | "sake";

/**
 * Menu item structure for place embedding
 */
export interface PlaceMenuItem {
  itemName: string;
  itemType: ItemType;
  confidenceScore: number;
  matchedItem?: {
    name: string;
    variety?: string;
    style?: string;
    type?: string;
  };
}

/**
 * Place embedding data structure
 */
export interface PlaceEmbeddingData {
  id: string;
  name: string;
  description?: string;
  primary_category: string;
  categories: string[];
  menuItems?: PlaceMenuItem[];
  priceLevel?: number;
  rating?: number;
  area?: string;
}

/**
 * Place vector webhook input structure
 */
export interface PlaceVectorInput {
  table: { name: "places" };
  event: { data: { new: PlaceEmbeddingData } };
}

/**
 * Place vector generation context
 */
export interface PlaceVectorContext {
  placeId: string;
  placeName: string;
  primaryCategory?: string;
  [key: string]: unknown;
}

/**
 * Category-to-item type likelihood mapping
 */
export interface CategoryItemLikelihood {
  wine: number;
  beer: number;
  spirit: number;
  coffee: number;
  sake: number;
}

/**
 * Place vector generation result
 */
export interface PlaceVectorResult {
  success: boolean;
  vectorId?: string;
  dimensions?: number;
  embeddingText?: string;
}

/**
 * Embedding generation result for places
 */
export interface PlaceEmbeddingResult {
  embeddings: number[];
  dimensions: number;
  text: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Category-to-item type likelihood mapping for enhanced embeddings
 */
export const CATEGORY_ITEM_LIKELIHOOD: Record<string, CategoryItemLikelihood> =
  {
    // High specificity categories
    wine_bar: { wine: 0.95, spirit: 0.7, beer: 0.4, coffee: 0.1, sake: 0.3 },
    brewery: { beer: 0.98, wine: 0.2, spirit: 0.3, coffee: 0.1, sake: 0.05 },
    coffee_shop: {
      coffee: 0.95,
      wine: 0.05,
      beer: 0.1,
      spirit: 0.05,
      sake: 0.05,
    },
    distillery: { spirit: 0.95, wine: 0.1, beer: 0.1, coffee: 0.1, sake: 0.05 },
    winery: { wine: 0.98, beer: 0.1, spirit: 0.2, coffee: 0.05, sake: 0.1 },

    // Medium specificity
    restaurant: { wine: 0.7, beer: 0.6, spirit: 0.5, coffee: 0.3, sake: 0.4 },
    bar: { spirit: 0.8, beer: 0.8, wine: 0.6, coffee: 0.2, sake: 0.4 },
    cafe: { coffee: 0.9, wine: 0.1, beer: 0.2, spirit: 0.1, sake: 0.05 },

    // Cuisine-specific restaurants
    steakhouse: { wine: 0.9, spirit: 0.7, beer: 0.5, coffee: 0.3, sake: 0.2 },
    italian_restaurant: {
      wine: 0.85,
      spirit: 0.4,
      beer: 0.4,
      coffee: 0.8,
      sake: 0.1,
    },
    french_restaurant: {
      wine: 0.9,
      spirit: 0.6,
      beer: 0.3,
      coffee: 0.8,
      sake: 0.1,
    },
    japanese_restaurant: {
      beer: 0.6,
      wine: 0.5,
      spirit: 0.7,
      coffee: 0.2,
      sake: 0.95,
    },
    german_restaurant: {
      beer: 0.9,
      wine: 0.6,
      spirit: 0.5,
      coffee: 0.3,
      sake: 0.05,
    },
    american_restaurant: {
      beer: 0.8,
      wine: 0.6,
      spirit: 0.6,
      coffee: 0.4,
      sake: 0.3,
    },

    // Default fallback
    default: { wine: 0.3, beer: 0.3, spirit: 0.3, coffee: 0.3, sake: 0.3 },
  };

/**
 * Price level descriptions
 */
export const PRICE_LEVEL_DESCRIPTIONS = [
  "Budget",
  "Affordable",
  "Moderate",
  "Expensive",
  "Very Expensive",
];

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value is a valid item type
 */
export function isValidItemType(value: unknown): value is ItemType {
  return (
    typeof value === "string" &&
    ["wine", "beer", "spirit", "coffee", "sake"].includes(value)
  );
}

/**
 * Type guard to check if a value matches PlaceVectorInput
 */
export function isPlaceVectorInput(value: unknown): value is PlaceVectorInput {
  if (typeof value !== "object" || value === null) return false;

  const input = value as Record<string, unknown>;

  return (
    input.table !== undefined &&
    typeof input.table === "object" &&
    input.table !== null &&
    "name" in input.table &&
    input.table.name === "places" &&
    input.event !== undefined &&
    typeof input.event === "object" &&
    input.event !== null &&
    "data" in input.event &&
    typeof input.event.data === "object" &&
    input.event.data !== null &&
    "new" in input.event.data
  );
}

/**
 * Enhanced validation for PlaceVectorInput with detailed error messages
 */
export function validatePlaceVectorInput(value: unknown): PlaceVectorInput {
  const input = validateObjectInput(value, "generatePlaceVector");

  // Validate table structure
  const table = validateRequiredField(
    input,
    "table",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generatePlaceVector",
  );

  const _tableName = validateRequiredField(
    table,
    "name",
    (value: unknown): value is "places" => {
      return value === "places";
    },
    "generatePlaceVector",
  );

  // Validate event structure
  const event = validateRequiredField(
    input,
    "event",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generatePlaceVector",
  );

  // Validate event.data
  const data = validateRequiredField(
    event,
    "data",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generatePlaceVector",
  );

  // Validate event.data.new
  const newPlace = validateRequiredField(
    data,
    "new",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generatePlaceVector",
  );

  // Validate required fields in the new place
  const _id = validateRequiredField(
    newPlace,
    "id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "generatePlaceVector",
  );

  const _name = validateRequiredField(
    newPlace,
    "name",
    isNonEmptyString,
    "generatePlaceVector",
  );

  const _primary_category = validateRequiredField(
    newPlace,
    "primary_category",
    isNonEmptyString,
    "generatePlaceVector",
  );

  return value as PlaceVectorInput;
}

/**
 * Validates place embedding data
 */
export function validatePlaceEmbeddingData(value: unknown): PlaceEmbeddingData {
  const input = validateObjectInput(value, "placeEmbeddingData");

  const id = validateRequiredField(
    input,
    "id",
    isNonEmptyString,
    "placeEmbeddingData",
  );
  const name = validateRequiredField(
    input,
    "name",
    isNonEmptyString,
    "placeEmbeddingData",
  );
  const primary_category = validateRequiredField(
    input,
    "primary_category",
    isNonEmptyString,
    "placeEmbeddingData",
  );

  const description = validateOptionalField(
    input,
    "description",
    isOptionalString,
    "placeEmbeddingData",
  );

  const categories =
    validateOptionalField(
      input,
      "categories",
      (value: unknown): value is string[] | undefined => {
        if (value === undefined) return true;
        return (
          Array.isArray(value) &&
          value.every((item) => typeof item === "string")
        );
      },
      "placeEmbeddingData",
    ) ?? [];

  const menuItems = validateOptionalField(
    input,
    "menuItems",
    (value: unknown): value is PlaceMenuItem[] | undefined => {
      if (value === undefined) return true;
      return Array.isArray(value);
    },
    "placeEmbeddingData",
  );

  const priceLevel = validateOptionalField(
    input,
    "priceLevel",
    (value: unknown): value is number | undefined => {
      return (
        value === undefined ||
        (typeof value === "number" && value >= 1 && value <= 5)
      );
    },
    "placeEmbeddingData",
  );

  const rating = validateOptionalField(
    input,
    "rating",
    (value: unknown): value is number | undefined => {
      return (
        value === undefined ||
        (typeof value === "number" && value >= 0 && value <= 5)
      );
    },
    "placeEmbeddingData",
  );

  const area = validateOptionalField(
    input,
    "area",
    isOptionalString,
    "placeEmbeddingData",
  );

  return {
    id,
    name,
    description,
    primary_category,
    categories,
    menuItems,
    priceLevel,
    rating,
    area,
  };
}

/**
 * Validates place menu item
 */
export function validatePlaceMenuItem(value: unknown): PlaceMenuItem {
  const input = validateObjectInput(value, "placeMenuItem");

  const itemName = validateRequiredField(
    input,
    "itemName",
    isNonEmptyString,
    "placeMenuItem",
  );
  const itemType = validateRequiredField(
    input,
    "itemType",
    isValidItemType,
    "placeMenuItem",
  );
  const confidenceScore = validateRequiredField(
    input,
    "confidenceScore",
    (value: unknown): value is number =>
      typeof value === "number" && value >= 0 && value <= 1,
    "placeMenuItem",
  );

  const matchedItem = validateOptionalField(
    input,
    "matchedItem",
    (value: unknown): value is Record<string, unknown> | undefined => {
      return (
        value === undefined || (typeof value === "object" && value !== null)
      );
    },
    "placeMenuItem",
  );

  return {
    itemName,
    itemType,
    confidenceScore,
    matchedItem: matchedItem as PlaceMenuItem["matchedItem"],
  };
}

/**
 * Creates place vector context from input data
 */
export function createPlaceVectorContext(
  input: PlaceVectorInput,
): PlaceVectorContext {
  return {
    placeId: input.event.data.new.id,
    placeName: input.event.data.new.name,
    primaryCategory: input.event.data.new.primary_category,
  };
}

/**
 * Generates descriptive text for place embedding
 */
export function generatePlaceEmbeddingText(place: PlaceEmbeddingData): string {
  const parts: string[] = [];

  // Add basic place information
  parts.push(`Place: ${place.name}`);

  if (place.description) {
    parts.push(`Description: ${place.description}`);
  }

  // Add primary category
  parts.push(`Primary category: ${place.primary_category}`);

  // Add all categories
  if (place.categories.length > 0) {
    parts.push(`Categories: ${place.categories.join(", ")}`);
  }

  // Add menu items if available
  if (place.menuItems && place.menuItems.length > 0) {
    const menuItemTexts = place.menuItems.map((item) => {
      let itemText = `${item.itemType}: ${item.itemName}`;
      if (item.matchedItem) {
        const details = [
          item.matchedItem.name,
          item.matchedItem.variety,
          item.matchedItem.style,
          item.matchedItem.type,
        ]
          .filter(Boolean)
          .join(" ");
        if (details) {
          itemText += ` (${details})`;
        }
      }
      return itemText;
    });
    parts.push(`Menu items: ${menuItemTexts.join(", ")}`);
  }

  // Add category-based item type predictions
  const itemTypePredictions: string[] = [];
  for (const category of [place.primary_category, ...place.categories]) {
    const likelihood =
      CATEGORY_ITEM_LIKELIHOOD[category] || CATEGORY_ITEM_LIKELIHOOD.default;

    Object.entries(likelihood).forEach(([itemType, score]) => {
      if (score > 0.5) {
        // Only include high-confidence predictions
        itemTypePredictions.push(
          `likely serves ${itemType} (${Math.round(score * 100)}% confidence)`,
        );
      }
    });
  }

  if (itemTypePredictions.length > 0) {
    parts.push(`Predictions: ${itemTypePredictions.join(", ")}`);
  }

  // Add context information
  if (place.priceLevel !== undefined) {
    parts.push(
      `Price level: ${PRICE_LEVEL_DESCRIPTIONS[place.priceLevel - 1] || "Unknown"}`,
    );
  }

  if (place.rating !== undefined) {
    parts.push(`Rating: ${place.rating}/5 stars`);
  }

  if (place.area) {
    parts.push(`Area: ${place.area}`);
  }

  return parts.join(". ");
}

/**
 * Validates place embedding result
 */
export function validatePlaceEmbeddingResult(
  embeddings: number[],
  text: string,
): PlaceEmbeddingResult {
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    throw new FunctionValidationError(
      "generatePlaceVector",
      "embeddings",
      "must be a non-empty array of numbers",
      embeddings,
    );
  }

  if (!embeddings.every((e) => typeof e === "number")) {
    throw new FunctionValidationError(
      "generatePlaceVector",
      "embeddings",
      "all elements must be numbers",
      embeddings,
    );
  }

  return {
    embeddings,
    dimensions: embeddings.length,
    text,
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
