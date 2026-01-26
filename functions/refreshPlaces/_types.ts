/**
 * Type definitions for refreshPlaces function
 *
 * This function performs a full refresh of places data from external sources.
 * It clears existing places and inserts fresh data for all configured categories.
 */

import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Mutation to clear all existing places
 */
export const CLEAR_PLACES_MUTATION = graphql(`
  mutation ClearPlaces {
    delete_places(where: {}) {
      affected_rows
    }
  }
`);

/**
 * Mutation to insert new places in batch
 */
export const INSERT_PLACES_MUTATION = graphql(`
  mutation InsertPlaces($places: [places_insert_input!]!) {
    insert_places(objects: $places) {
      affected_rows
    }
  }
`);

// =============================================================================
// Input Types
// =============================================================================

/**
 * Place data structure for insertion
 */
export interface PlaceInsertData {
  overture_id: string;
  name: string;
  display_name: string;
  categories: string[];
  confidence: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  street_address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country_code: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  is_active: boolean;
  is_verified: boolean;
  access_count: number;
  first_cached_reason: string;
}

/**
 * Configuration for place refresh operation
 */
export interface RefreshConfig {
  batchSize: number;
  categories: string[];
}

// =============================================================================
// Output Types
// =============================================================================

/**
 * Result from clear places mutation
 */
export type ClearPlacesResult = ResultOf<typeof CLEAR_PLACES_MUTATION>;

/**
 * Result from insert places mutation
 */
export type InsertPlacesResult = ResultOf<typeof INSERT_PLACES_MUTATION>;

/**
 * Response from successful refresh operation
 */
export interface RefreshSuccessResponse {
  success: true;
  places_refreshed: number;
  duration_ms: number;
  categories_included: number;
  data_source: string;
  timestamp: string;
}

/**
 * Response from failed refresh operation
 */
export interface RefreshErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

/**
 * Union type for all possible refresh responses
 */
export type RefreshPlacesResponse =
  | RefreshSuccessResponse
  | RefreshErrorResponse;

// =============================================================================
// Constants
// =============================================================================

/**
 * All categories included in place refresh (40 total)
 */
export const ALL_CATEGORIES = [
  // Tier 1: Essential venues
  "restaurant",
  "bar",
  "cafe",
  "coffee_shop",
  "liquor_store",
  "winery",
  "brewery",
  "cocktail_bar",
  "wine_bar",
  "distillery",

  // Tier 2: Specialized venues
  "pub",
  "beer_bar",
  "sports_bar",
  "lounge",
  "gastropub",
  "tapas_bar",
  "sake_bar",
  "whiskey_bar",
  "beer_garden",
  "wine_tasting_room",
  "coffee_roastery",

  // Tier 3: Restaurant types
  "steakhouse",
  "italian_restaurant",
  "french_restaurant",
  "japanese_restaurant",
  "sushi_restaurant",
  "mexican_restaurant",
  "thai_restaurant",
  "chinese_restaurant",

  // Tier 4: Retail venues
  "grocery_store",
  "supermarket",
  "specialty_grocery_store",
  "organic_grocery_store",
  "beer_wine_and_spirits",
  "wine_wholesaler",
  "beverage_store",

  // Tier 5: Hotels/Entertainment
  "hotel",
  "resort",
  "casino",
  "music_venue",
] as const;

/**
 * Default batch size for place insertions
 */
export const DEFAULT_BATCH_SIZE = 1000;

// =============================================================================
// Type Guards and Validation
// =============================================================================

/**
 * Type guard to validate place category
 */
export function isValidCategory(
  category: string,
): category is (typeof ALL_CATEGORIES)[number] {
  return (ALL_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Validates an array of categories
 */
export function validateCategories(categories: string[]): void {
  const invalidCategories = categories.filter((cat) => !isValidCategory(cat));
  if (invalidCategories.length > 0) {
    throw new Error(`Invalid categories: ${invalidCategories.join(", ")}`);
  }
}

/**
 * Type guard to validate place insert data
 */
export function isValidPlaceInsertData(
  value: unknown,
): value is PlaceInsertData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const place = value as Record<string, unknown>;

  return (
    typeof place.overture_id === "string" &&
    typeof place.name === "string" &&
    typeof place.display_name === "string" &&
    Array.isArray(place.categories) &&
    place.categories.every((cat) => typeof cat === "string") &&
    typeof place.confidence === "number" &&
    typeof place.location === "object" &&
    place.location !== null &&
    typeof place.is_active === "boolean" &&
    typeof place.is_verified === "boolean" &&
    typeof place.access_count === "number" &&
    typeof place.first_cached_reason === "string"
  );
}
