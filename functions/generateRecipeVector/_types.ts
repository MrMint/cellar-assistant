/**
 * Function-specific types for generateRecipeVector
 *
 * This module defines all types related to recipe vector generation using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  FunctionValidationError,
  validateObjectInput,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definitions
// =============================================================================

/**
 * Query to fetch a recipe with all details needed for embedding generation
 */
export const GET_RECIPE_WITH_DETAILS_QUERY = graphql(`
  query GetRecipeWithDetails($id: uuid!) {
    recipes_by_pk(id: $id) {
      id
      name
      description
      type
      difficulty_level
      prep_time_minutes
      serving_size
      recipe_group {
        id
        name
        description
        category
        base_spirit
        tags
      }
      ingredients {
        id
        quantity
        unit
        is_optional
        wine {
          name
          variety
          style
        }
        beer {
          name
          style
        }
        spirit {
          name
          type
        }
        coffee {
          name
          roast_level
        }
        sake {
          name
          category
          type
        }
        generic_item {
          name
          category
        }
      }
      instructions {
        step_number
        instruction_text
        instruction_type
      }
    }
  }
`);

/**
 * Mutation to insert a new recipe vector
 */
export const INSERT_RECIPE_VECTOR_MUTATION = graphql(`
  mutation InsertRecipeVector(
    $recipe_id: uuid!
    $vector: halfvec!
    $embedding_text: String
  ) {
    insert_recipe_vectors_one(
      object: {
        recipe_id: $recipe_id
        vector: $vector
        embedding_text: $embedding_text
      }
    ) {
      id
      recipe_id
      created_at
    }
  }
`);

/**
 * Mutation to delete old recipe vectors (keeping the newest one)
 */
export const DELETE_OLD_RECIPE_VECTORS_MUTATION = graphql(`
  mutation DeleteOldRecipeVectors($recipe_id: uuid!, $exclude_id: Int!) {
    delete_recipe_vectors(
      where: { recipe_id: { _eq: $recipe_id }, id: { _neq: $exclude_id } }
    ) {
      affected_rows
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Recipe with all details needed for embedding generation
 */
export type RecipeWithDetails = NonNullable<
  ResultOf<typeof GET_RECIPE_WITH_DETAILS_QUERY>["recipes_by_pk"]
>;

/**
 * Recipe ingredient with polymorphic item reference
 */
export type RecipeIngredient = RecipeWithDetails["ingredients"][number];

/**
 * Recipe group data
 */
export type RecipeGroup = RecipeWithDetails["recipe_group"];

/**
 * Recipe instruction
 */
export type RecipeInstruction = RecipeWithDetails["instructions"][number];

/**
 * Input types for mutations
 */
export type InsertRecipeVectorInput = VariablesOf<
  typeof INSERT_RECIPE_VECTOR_MUTATION
>;
export type DeleteOldRecipeVectorsInput = VariablesOf<
  typeof DELETE_OLD_RECIPE_VECTORS_MUTATION
>;

/**
 * Output types for mutations
 */
export type InsertRecipeVectorOutput = ResultOf<
  typeof INSERT_RECIPE_VECTOR_MUTATION
>["insert_recipe_vectors_one"];
export type DeleteOldRecipeVectorsOutput = ResultOf<
  typeof DELETE_OLD_RECIPE_VECTORS_MUTATION
>["delete_recipe_vectors"];

// =============================================================================
// Function Input Types
// =============================================================================

/**
 * Webhook input structure for recipe vector generation (from Hasura event trigger)
 */
export interface GenerateRecipeVectorInput {
  table: { name: "recipes" };
  event: {
    data: {
      new: { id: string };
    };
  };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates the webhook input for recipe vector generation
 */
export function validateGenerateRecipeVectorInput(
  value: unknown,
): GenerateRecipeVectorInput {
  const input = validateObjectInput(value, "generateRecipeVector");

  // Validate table
  const table = validateRequiredField(
    input,
    "table",
    (v): v is { name: string } =>
      typeof v === "object" && v !== null && "name" in v,
    "generateRecipeVector",
  );

  if (table.name !== "recipes") {
    throw new FunctionValidationError(
      "generateRecipeVector",
      "table.name",
      "must be 'recipes'",
      table.name,
    );
  }

  // Validate event structure
  const event = validateRequiredField(
    input,
    "event",
    (v): v is { data: { new: { id: string } } } => {
      if (typeof v !== "object" || v === null) return false;
      const e = v as Record<string, unknown>;
      if (typeof e.data !== "object" || e.data === null) return false;
      const data = e.data as Record<string, unknown>;
      if (typeof data.new !== "object" || data.new === null) return false;
      const newData = data.new as Record<string, unknown>;
      return typeof newData.id === "string";
    },
    "generateRecipeVector",
  );

  return {
    table: { name: "recipes" },
    event: {
      data: {
        new: { id: (event.data.new as { id: string }).id },
      },
    },
  };
}
