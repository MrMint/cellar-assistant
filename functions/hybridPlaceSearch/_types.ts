/**
 * Type definitions for hybridPlaceSearch function.
 *
 * This function performs hybrid search combining:
 *   Layer 1: Full-text (tsvector) + trigram (pg_trgm) on places
 *   Layer 2: Semantic category vector matching (~200 pre-embedded labels)
 *   Layer 3: PostGIS geographic filtering
 */

import { graphql, type ResultOf } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Query category vectors for semantic matching via tracked function.
 * Uses searchCategoryVectors function which handles distance calculation,
 * filtering, and ordering internally.
 */
export const SEARCH_CATEGORY_VECTORS_QUERY = graphql(`
  query SearchCategoryVectors(
    $queryVector: halfvec!
    $maxDistance: float8!
    $limit: Int!
  ) {
    searchCategoryVectors(
      args: {
        query_vector: $queryVector
        max_distance: $maxDistance
        result_limit: $limit
      }
    ) {
      id
      label
      label_type
      associated_categories
      metadata
      distance
    }
  }
`);

/**
 * Call the hybrid search PostgreSQL function.
 */
export const HYBRID_PLACE_SEARCH_QUERY = graphql(`
  query HybridPlaceSearch(
    $searchQuery: String!
    $matchedCategories: _text
    $categoryScores: _float8
    $westBound: float8
    $southBound: float8
    $eastBound: float8
    $northBound: float8
    $minRating: float8
    $resultLimit: Int
  ) {
    searchPlacesHybrid(
      args: {
        search_query: $searchQuery
        matched_categories: $matchedCategories
        category_scores: $categoryScores
        west_bound: $westBound
        south_bound: $southBound
        east_bound: $eastBound
        north_bound: $northBound
        min_rating: $minRating
        result_limit: $resultLimit
      }
    ) {
      id
      name
      location
      primary_category
      categories
      confidence
      street_address
      locality
      region
      postcode
      country_code
      phone
      website
      email
      hours
      price_level
      rating
      review_count
      is_verified
      text_rank
      trigram_similarity
      category_score
      combined_score
    }
  }
`);

// =============================================================================
// Input Types
// =============================================================================

export interface PlaceSearchBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface HybridPlaceSearchInput {
  query: string;
  queryVector?: number[];
  bounds: PlaceSearchBounds;
  limit?: number;
  itemTypes?: string[];
  minRating?: number;
}

export interface HybridPlaceSearchPayload {
  input: HybridPlaceSearchInput;
  session_variables: {
    "x-hasura-user-id": string;
  };
}

// =============================================================================
// Output Types
// =============================================================================

export type HybridPlaceSearchQueryResult = ResultOf<
  typeof HYBRID_PLACE_SEARCH_QUERY
>;

export type CategoryVectorSearchResult = ResultOf<
  typeof SEARCH_CATEGORY_VECTORS_QUERY
>;

export type CategoryVectorMatch =
  CategoryVectorSearchResult["searchCategoryVectors"][number];

export type HybridPlaceSearchRow =
  HybridPlaceSearchQueryResult["searchPlacesHybrid"][number];

export interface ProcessedPlaceResult {
  id: string;
  name: string;
  primary_category?: string;
  categories?: string[];
  location?: unknown;
  rating?: number;
  price_level?: number;
  street_address?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country_code?: string;
  phone?: string;
  website?: string;
  email?: string;
  hours?: unknown;
  confidence?: number;
  is_verified?: boolean;
  review_count?: number;
  distance: number;
  confidenceScore: number;
  text_rank?: number;
  trigram_similarity?: number;
  category_score?: number;
  combined_score?: number;
}

export interface SearchMetadata {
  query: string;
  limit: number;
  bounds: PlaceSearchBounds;
  totalResults: number;
  matchedCategories: string[];
  searchLayers: string[];
}

// =============================================================================
// Validation Functions
// =============================================================================

export function validateBounds(bounds: PlaceSearchBounds): void {
  const { north, south, east, west } = bounds;

  if (south >= north) {
    throw new Error("Invalid bounds: south must be less than north");
  }
  // Note: This rejects bounds that cross the antimeridian (e.g. Pacific views).
  // Acceptable for current use cases; antimeridian support would need split-envelope logic.
  if (west >= east) {
    throw new Error("Invalid bounds: west must be less than east");
  }
  if (north > 90 || south < -90 || north < -90 || south > 90) {
    throw new Error("Invalid bounds: latitude must be between -90 and 90");
  }
  if (east > 180 || west < -180 || east < -180 || west > 180) {
    throw new Error("Invalid bounds: longitude must be between -180 and 180");
  }
}

export function validateHybridPlaceSearchInput(
  value: unknown,
): HybridPlaceSearchPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid request body format");
  }

  const data = value as Record<string, unknown>;

  if (!data.input) {
    throw new Error("Missing input field");
  }
  if (!data.session_variables) {
    throw new Error("Missing session_variables field");
  }

  const input = data.input as Record<string, unknown>;
  const sessionVars = data.session_variables as Record<string, unknown>;

  if (!input.query || typeof input.query !== "string" || !input.query.trim()) {
    throw new Error("Query must be a non-empty string");
  }

  if (!input.bounds) {
    throw new Error("Missing bounds field");
  }

  const bounds = input.bounds as Record<string, unknown>;
  for (const coord of ["north", "south", "east", "west"]) {
    if (typeof bounds[coord] !== "number") {
      throw new Error(`Bounds.${coord} must be a number`);
    }
  }

  if (typeof sessionVars["x-hasura-user-id"] !== "string") {
    throw new Error("Missing or invalid user ID in session variables");
  }

  // Validate queryVector if provided
  if (input.queryVector !== undefined) {
    if (
      !Array.isArray(input.queryVector) ||
      input.queryVector.length === 0 ||
      !input.queryVector.every((v: unknown) => typeof v === "number")
    ) {
      throw new Error(
        "queryVector must be a non-empty array of numbers when provided",
      );
    }
  }

  const validatedPayload: HybridPlaceSearchPayload = {
    input: {
      query: input.query as string,
      queryVector: Array.isArray(input.queryVector)
        ? (input.queryVector as number[])
        : undefined,
      bounds: {
        north: bounds.north as number,
        south: bounds.south as number,
        east: bounds.east as number,
        west: bounds.west as number,
      },
      limit: typeof input.limit === "number" ? input.limit : 50,
      itemTypes: Array.isArray(input.itemTypes) ? input.itemTypes : undefined,
      minRating:
        typeof input.minRating === "number" ? input.minRating : undefined,
    },
    session_variables: {
      "x-hasura-user-id": sessionVars["x-hasura-user-id"] as string,
    },
  };

  validateBounds(validatedPayload.input.bounds);

  return validatedPayload;
}
