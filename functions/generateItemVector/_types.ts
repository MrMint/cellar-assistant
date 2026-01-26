/**
 * Function-specific types for generateItemVector
 *
 * This module defines all types related to item vector generation using gql.tada
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
  validateObjectInput,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definitions
// =============================================================================

/**
 * GraphQL operations for item vector management
 */
const INSERT_ITEM_VECTOR_MUTATION = graphql(`
  mutation InsertItemVector(
    $beer_id: String,
    $wine_id: String,
    $spirit_id: String,
    $coffee_id: String,
    $vector: vector,
    $embedding_text: String
  ) {
    insert_item_vectors_one(object: {
      beer_id: $beer_id,
      wine_id: $wine_id,
      spirit_id: $spirit_id,
      coffee_id: $coffee_id,
      vector: $vector,
      embedding_text: $embedding_text
    }) {
      id
      beer_id
      wine_id
      spirit_id
      coffee_id
      vector
      embedding_text
      created_at
      updated_at
    }
  }
`);

const DELETE_ITEM_VECTORS_MUTATION = graphql(`
  mutation DeleteItemVectors($where: item_vectors_bool_exp!) {
    delete_item_vectors(where: $where) {
      affected_rows
    }
  }
`);

const GET_BEER_QUERY = graphql(`
  query GetBeer($id: String!) {
    beers_by_pk(id: $id) {
      id
      name
      description
      alcohol_content_percentage
      vintage
      style
      country
      region
      producer_name
      producer_region
      producer_country
      created_at
      updated_at
    }
  }
`);

const GET_WINE_QUERY = graphql(`
  query GetWine($id: String!) {
    wines_by_pk(id: $id) {
      id
      name
      description
      alcohol_content_percentage
      vintage
      style
      variety
      country
      region
      producer_name
      producer_region
      producer_country
      created_at
      updated_at
    }
  }
`);

const GET_SPIRIT_QUERY = graphql(`
  query GetSpirit($id: String!) {
    spirits_by_pk(id: $id) {
      id
      name
      description
      alcohol_content_percentage
      vintage
      style
      type
      country
      region
      producer_name
      producer_region
      producer_country
      created_at
      updated_at
    }
  }
`);

const GET_COFFEE_QUERY = graphql(`
  query GetCoffee($id: String!) {
    coffees_by_pk(id: $id) {
      id
      name
      description
      country
      region
      producer_name
      producer_region
      producer_country
      roast_level
      species
      cultivar
      process
      created_at
      updated_at
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for item vector operations
 */
export type InsertItemVectorInput = VariablesOf<
  typeof INSERT_ITEM_VECTOR_MUTATION
>;
export type DeleteItemVectorsInput = VariablesOf<
  typeof DELETE_ITEM_VECTORS_MUTATION
>;

/**
 * Output types for item vector operations
 */
export type InsertItemVectorOutput = ResultOf<
  typeof INSERT_ITEM_VECTOR_MUTATION
>["insert_item_vectors_one"];
export type DeleteItemVectorsOutput = ResultOf<
  typeof DELETE_ITEM_VECTORS_MUTATION
>["delete_item_vectors"];

/**
 * Item types extracted from GraphQL queries
 */
export type BeerItem = ResultOf<typeof GET_BEER_QUERY>["beers_by_pk"];
export type WineItem = ResultOf<typeof GET_WINE_QUERY>["wines_by_pk"];
export type SpiritItem = ResultOf<typeof GET_SPIRIT_QUERY>["spirits_by_pk"];
export type CoffeeItem = ResultOf<typeof GET_COFFEE_QUERY>["coffees_by_pk"];

/**
 * Union type for all item types
 */
export type ItemType = BeerItem | WineItem | SpiritItem | CoffeeItem;

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Valid table names for item vector generation
 */
export type TableName = "beers" | "wines" | "spirits" | "coffees";

/**
 * Webhook input structure for item vector generation
 */
export interface GenerateVectorInput {
  table: { name: TableName };
  event: { data: { new: ItemType } };
}

/**
 * Item vector boolean expression for deletions
 */
export interface ItemVectorsBoolExp {
  id?: { _neq?: number };
  beer_id?: { _eq?: string };
  wine_id?: { _eq?: string };
  spirit_id?: { _eq?: string };
  coffee_id?: { _eq?: string };
}

/**
 * Vector generation context
 */
export interface VectorGenerationContext {
  itemId: string;
  tableName: TableName;
  item: ItemType;
  embeddingText: string;
  vector: number[];
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value is a valid table name
 */
export function isValidTableName(value: unknown): value is TableName {
  return (
    typeof value === "string" &&
    ["beers", "wines", "spirits", "coffees"].includes(value)
  );
}

/**
 * Type guard to check if a value matches GenerateVectorInput
 */
export function isGenerateVectorInput(
  value: unknown,
): value is GenerateVectorInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  // Check table structure
  if (typeof input.table !== "object" || input.table === null) return false;
  const table = input.table as Record<string, unknown>;
  if (!isValidTableName(table.name)) return false;

  // Check event structure
  if (typeof input.event !== "object" || input.event === null) return false;
  const event = input.event as Record<string, unknown>;
  if (typeof event.data !== "object" || event.data === null) return false;
  const eventData = event.data as Record<string, unknown>;
  if (typeof eventData.new !== "object" || eventData.new === null) return false;

  return true;
}

/**
 * Enhanced validation for GenerateVectorInput with detailed error messages
 */
export function validateGenerateVectorInput(
  value: unknown,
): GenerateVectorInput {
  const input = validateObjectInput(value, "generateItemVector");

  // Validate table
  const table = validateRequiredField(
    input,
    "table",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateItemVector",
  );

  const tableName = validateRequiredField(
    table,
    "name",
    isValidTableName,
    "generateItemVector",
  );

  // Validate event
  const event = validateRequiredField(
    input,
    "event",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateItemVector",
  );

  const eventData = validateRequiredField(
    event,
    "data",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateItemVector",
  );

  const newItem = validateRequiredField(
    eventData,
    "new",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateItemVector",
  );

  // Validate item has required id field
  const _itemId = validateRequiredField(
    newItem,
    "id",
    isNonEmptyString,
    "generateItemVector",
  );

  return {
    table: { name: tableName },
    event: { data: { new: newItem as ItemType } },
  };
}

/**
 * Creates item vector boolean expression for deletions
 */
export function createDeleteVectorWhereClause(
  type: TableName,
  newId: number,
  itemId: string,
): ItemVectorsBoolExp {
  const where: ItemVectorsBoolExp = {
    id: { _neq: newId },
  };

  switch (type) {
    case "beers":
      return { ...where, beer_id: { _eq: itemId } };
    case "wines":
      return { ...where, wine_id: { _eq: itemId } };
    case "spirits":
      return { ...where, spirit_id: { _eq: itemId } };
    case "coffees":
      return { ...where, coffee_id: { _eq: itemId } };
    default:
      throw new FunctionValidationError(
        "generateItemVector",
        "tableName",
        "must be one of: beers, wines, spirits, coffees",
        type,
      );
  }
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
