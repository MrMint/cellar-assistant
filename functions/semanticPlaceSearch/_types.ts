/**
 * Type definitions for semanticPlaceSearch function
 *
 * This function performs semantic search for places within geographic bounds
 * using vector embeddings and similarity search.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Query for semantic place search within bounds
 */
export const SEMANTIC_PLACE_SEARCH_QUERY = graphql(`
  query SemanticPlaceSearch(
    $queryVector: halfvec!
    $maxDistance: float8!
    $limit: Int!
    $westBound: float8!
    $southBound: float8!
    $eastBound: float8!
    $northBound: float8!
  ) {
    place_vectors(
      where: {
        _and: [
          {
            place: {
              location: {
                _st_within: {
                  type: "Polygon"
                  coordinates: [[
                    [$westBound, $southBound],
                    [$eastBound, $southBound],
                    [$eastBound, $northBound],
                    [$westBound, $northBound],
                    [$westBound, $southBound]
                  ]]
                }
              }
            }
          },
          {
            calculate_place_vector_distance: {
              arguments: { query_vector: $queryVector }
              _lte: $maxDistance
            }
          }
        ]
      }
      order_by: [
        {
          calculate_place_vector_distance: {
            arguments: { query_vector: $queryVector }
            order: asc
          }
        }
      ]
      limit: $limit
    ) {
      id
      place_id
      distance: calculate_place_vector_distance(args: { query_vector: $queryVector })
      place {
        id
        name
        display_name
        primary_category
        categories
        location
        rating
        price_level
        street_address
        locality
        region
        postcode
        country_code
        phone
        website
        email
        hours
        confidence
        is_verified
      }
    }
  }
`);

// =============================================================================
// Input Types
// =============================================================================

/**
 * Geographic bounds for place search
 */
export interface PlaceSearchBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Input for semantic place search
 */
export interface SemanticPlaceSearchInput {
  query: string;
  bounds: PlaceSearchBounds;
  maxDistance?: number;
  limit?: number;
}

/**
 * Payload structure for semantic place search function
 */
export interface SemanticPlaceSearchPayload {
  input: SemanticPlaceSearchInput;
  session_variables: {
    "x-hasura-user-id": string;
  };
}

/**
 * Variables for GraphQL query
 */
export type SemanticPlaceSearchVariables = VariablesOf<
  typeof SEMANTIC_PLACE_SEARCH_QUERY
>;

// =============================================================================
// Output Types
// =============================================================================

/**
 * Result from GraphQL query
 */
export type SemanticPlaceSearchQueryResult = ResultOf<
  typeof SEMANTIC_PLACE_SEARCH_QUERY
>;

/**
 * Individual place vector result
 */
export type PlaceVectorResult =
  SemanticPlaceSearchQueryResult["place_vectors"][number];

/**
 * Processed place result with confidence score
 */
export interface ProcessedPlaceResult {
  id: string;
  name: string;
  display_name?: string;
  primary_category?: string;
  categories?: string[];
  location?: any;
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
  hours?: any;
  confidence?: number;
  is_verified?: boolean;
  distance: number;
  confidenceScore: number;
}

/**
 * Metadata for search results
 */
export interface SearchMetadata {
  query: string;
  maxDistance: number;
  limit: number;
  bounds: PlaceSearchBounds;
  totalResults: number;
  queryVectorDimensions: number;
}

/**
 * Response from semantic place search function
 */
export interface SemanticPlaceSearchOutput {
  success: boolean;
  places: ProcessedPlaceResult[];
  metadata: SearchMetadata;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate PlaceSearchBounds
 */
export function isPlaceSearchBounds(
  value: unknown,
): value is PlaceSearchBounds {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const bounds = value as Record<string, unknown>;

  return (
    typeof bounds.north === "number" &&
    typeof bounds.south === "number" &&
    typeof bounds.east === "number" &&
    typeof bounds.west === "number"
  );
}

/**
 * Type guard to validate SemanticPlaceSearchInput
 */
export function isSemanticPlaceSearchInput(
  value: unknown,
): value is SemanticPlaceSearchInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const input = value as Record<string, unknown>;

  return (
    typeof input.query === "string" &&
    input.query.trim().length > 0 &&
    isPlaceSearchBounds(input.bounds) &&
    (input.maxDistance === undefined ||
      typeof input.maxDistance === "number") &&
    (input.limit === undefined || typeof input.limit === "number")
  );
}

/**
 * Type guard to validate SemanticPlaceSearchPayload
 */
export function isSemanticPlaceSearchPayload(
  value: unknown,
): value is SemanticPlaceSearchPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  if (!isSemanticPlaceSearchInput(payload.input)) {
    return false;
  }

  if (
    typeof payload.session_variables !== "object" ||
    payload.session_variables === null
  ) {
    return false;
  }

  const sessionVars = payload.session_variables as Record<string, unknown>;

  return typeof sessionVars["x-hasura-user-id"] === "string";
}

/**
 * Validates bounds are reasonable geographic coordinates
 */
export function validateBounds(bounds: PlaceSearchBounds): void {
  const { north, south, east, west } = bounds;

  if (south >= north) {
    throw new Error("Invalid bounds: south must be less than north");
  }

  if (west >= east) {
    throw new Error("Invalid bounds: west must be less than east");
  }

  // Check for reasonable coordinate ranges
  if (north > 90 || south < -90 || north < -90 || south > 90) {
    throw new Error("Invalid bounds: latitude must be between -90 and 90");
  }

  if (east > 180 || west < -180 || east < -180 || west > 180) {
    throw new Error("Invalid bounds: longitude must be between -180 and 180");
  }
}

/**
 * Validates SemanticPlaceSearchPayload and throws descriptive errors
 */
export function validateSemanticPlaceSearchInput(
  value: unknown,
): SemanticPlaceSearchPayload {
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

  // Validate input fields
  if (!input.query) {
    throw new Error("Missing query field");
  }

  if (!input.bounds) {
    throw new Error("Missing bounds field");
  }

  if (typeof input.query !== "string" || !input.query.trim()) {
    throw new Error("Query must be a non-empty string");
  }

  // Validate bounds
  const bounds = input.bounds as Record<string, unknown>;

  if (!bounds.north || !bounds.south || !bounds.east || !bounds.west) {
    throw new Error(
      "Missing required bounds fields (north, south, east, west)",
    );
  }

  for (const coord of ["north", "south", "east", "west"]) {
    if (typeof bounds[coord] !== "number") {
      throw new Error(`Bounds.${coord} must be a number`);
    }
  }

  // Validate session variables
  if (typeof sessionVars["x-hasura-user-id"] !== "string") {
    throw new Error("Missing or invalid user ID in session variables");
  }

  const validatedPayload: SemanticPlaceSearchPayload = {
    input: {
      query: input.query as string,
      bounds: {
        north: bounds.north as number,
        south: bounds.south as number,
        east: bounds.east as number,
        west: bounds.west as number,
      },
      maxDistance:
        typeof input.maxDistance === "number" ? input.maxDistance : 0.8,
      limit: typeof input.limit === "number" ? input.limit : 50,
    },
    session_variables: {
      "x-hasura-user-id": sessionVars["x-hasura-user-id"] as string,
    },
  };

  // Validate bounds are reasonable
  validateBounds(validatedPayload.input.bounds);

  return validatedPayload;
}
