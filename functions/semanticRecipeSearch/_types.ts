/**
 * Type definitions for semanticRecipeSearch function
 *
 * This function performs semantic search for recipes using vector embeddings.
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
 * GraphQL query for semantic recipe search using vector distance
 */
export const SEMANTIC_RECIPE_SEARCH_QUERY = graphql(`
  query SemanticRecipeSearch(
    $queryVector: halfvec!
    $maxDistance: float8!
    $limit: Int!
  ) {
    recipe_vectors(
      where: {
        distance: {
          arguments: { query_vector: $queryVector }
          _lte: $maxDistance
        }
      }
      order_by: [
        {
          distance: {
            arguments: { query_vector: $queryVector }
            order: asc
          }
        }
      ]
      limit: $limit
    ) {
      id
      recipe_id
      distance(args: { query_vector: $queryVector })
      recipe {
        id
        name
        description
        type
        difficulty_level
        prep_time_minutes
        serving_size
        image_url
        recipe_group {
          id
          name
          category
          base_spirit
          tags
        }
      }
    }
  }
`);

/**
 * Types extracted from GraphQL operations
 */
export type SemanticRecipeSearchVariables = VariablesOf<
  typeof SEMANTIC_RECIPE_SEARCH_QUERY
>;
export type SemanticRecipeSearchQueryResult = ResultOf<
  typeof SEMANTIC_RECIPE_SEARCH_QUERY
>;
export type RecipeVectorResult =
  SemanticRecipeSearchQueryResult["recipe_vectors"][number];

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for semantic recipe search
 */
export interface SemanticRecipeSearchInput {
  query: string;
  maxDistance?: number;
  limit?: number;
}

/**
 * Payload structure for semantic recipe search function
 */
export interface SemanticRecipeSearchPayload {
  input: SemanticRecipeSearchInput;
  session_variables: {
    "x-hasura-user-id": string;
  };
}

// =============================================================================
// Output Types
// =============================================================================

/**
 * Recipe group info in search results
 */
export interface RecipeGroupInfo {
  id: string;
  name: string;
  category?: string | null;
  base_spirit?: string | null;
  tags?: string[] | null;
}

/**
 * Recipe result from semantic search
 * Contains essential recipe info plus search-specific fields
 */
export interface RecipeSearchResult {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  image_url?: string | null;
  recipe_group?: RecipeGroupInfo | null;
  /** Semantic similarity score from vector search (0-2, lower is closer) */
  distance?: number;
  /** Match confidence score (0-1, higher is better) */
  similarity?: number;
}

/**
 * Metadata for search results
 */
export interface RecipeSearchMetadata {
  query: string;
  maxDistance: number;
  limit: number;
  totalResults: number;
  queryVectorDimensions: number;
  vectorSearchImplemented: boolean;
}

/**
 * Response from semantic recipe search function
 */
export interface SemanticRecipeSearchOutput {
  success: boolean;
  recipes: RecipeSearchResult[];
  metadata?: RecipeSearchMetadata;
  error?: string;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate SemanticRecipeSearchInput
 */
export function isSemanticRecipeSearchInput(
  value: unknown,
): value is SemanticRecipeSearchInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const input = value as Record<string, unknown>;

  return (
    typeof input.query === "string" &&
    input.query.trim().length > 0 &&
    (input.maxDistance === undefined ||
      typeof input.maxDistance === "number") &&
    (input.limit === undefined || typeof input.limit === "number")
  );
}

/**
 * Type guard to validate SemanticRecipeSearchPayload
 */
export function isSemanticRecipeSearchPayload(
  value: unknown,
): value is SemanticRecipeSearchPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  if (!isSemanticRecipeSearchInput(payload.input)) {
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
 * Validates SemanticRecipeSearchPayload and throws descriptive errors
 */
export function validateSemanticRecipeSearchInput(
  value: unknown,
): SemanticRecipeSearchPayload {
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

  if (typeof input.query !== "string" || !input.query.trim()) {
    throw new Error("Query must be a non-empty string");
  }

  // Validate optional fields
  if (
    input.maxDistance !== undefined &&
    typeof input.maxDistance !== "number"
  ) {
    throw new Error("maxDistance must be a number");
  }

  if (input.limit !== undefined && typeof input.limit !== "number") {
    throw new Error("limit must be a number");
  }

  // Validate session variables
  if (typeof sessionVars["x-hasura-user-id"] !== "string") {
    throw new Error("Missing or invalid user ID in session variables");
  }

  return {
    input: {
      query: input.query as string,
      maxDistance:
        typeof input.maxDistance === "number" ? input.maxDistance : 0.8,
      limit: typeof input.limit === "number" ? input.limit : 50,
    },
    session_variables: {
      "x-hasura-user-id": sessionVars["x-hasura-user-id"] as string,
    },
  };
}
