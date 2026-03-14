/**
 * Function-specific types for getItemDefaults
 *
 * This module defines all types related to getting item defaults using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import type { AIProvider, JSONSchema7 } from "../_utils/ai-providers/types";
import {
  type FunctionRequest,
  FunctionValidationError,
  isNonEmptyString,
  isOptionalString,
  isValidItemType,
  isValidUUID,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "../_utils/function-types";
import type {
  AIPerformanceMetrics,
  PerformanceTracker,
} from "../_utils/performance";
import type { AIDefaults, EnumValues } from "./_utils";

// =============================================================================
// GraphQL Operation Definitions
// =============================================================================

/**
 * GraphQL queries for getting item defaults for each item type
 */
const BEER_DEFAULTS_QUERY = graphql(`
  query BeerDefaults($hint: item_defaults_hint!) {
    beer_defaults(hint: $hint) {
      alcohol_content_percentage
      description
      barcode_code
      barcode_type
      name
      item_onboarding_id
      vintage
      style
      country
      region
      producer_name
      producer_region
      producer_country
    }
  }
`);

const WINE_DEFAULTS_QUERY = graphql(`
  query WineDefaults($hint: item_defaults_hint!) {
    wine_defaults(hint: $hint) {
      alcohol_content_percentage
      description
      barcode_code
      barcode_type
      name
      item_onboarding_id
      vintage
      style
      country
      region
      producer_name
      producer_region
      producer_country
      variety
    }
  }
`);

const SPIRIT_DEFAULTS_QUERY = graphql(`
  query SpiritDefaults($hint: item_defaults_hint!) {
    spirit_defaults(hint: $hint) {
      alcohol_content_percentage
      description
      barcode_code
      barcode_type
      name
      item_onboarding_id
      vintage
      style
      country
      region
      producer_name
      producer_region
      producer_country
      type
    }
  }
`);

const COFFEE_DEFAULTS_QUERY = graphql(`
  query CoffeeDefaults($hint: item_defaults_hint!) {
    coffee_defaults(hint: $hint) {
      description
      barcode_code
      barcode_type
      name
      item_onboarding_id
      country
      region
      producer_name
      producer_region
      producer_country
      roast_level
      species
      cultivar
      process
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input type for item defaults functions (beer_defaults, wine_defaults, etc.)
 * Extracted from the item defaults query variables
 */
export type ItemDefaultsHint = VariablesOf<typeof BEER_DEFAULTS_QUERY>["hint"];

/**
 * Output types for item defaults functions
 */
export type BeerDefaultsOutput = ResultOf<
  typeof BEER_DEFAULTS_QUERY
>["beer_defaults"];
export type WineDefaultsOutput = ResultOf<
  typeof WINE_DEFAULTS_QUERY
>["wine_defaults"];
export type SpiritDefaultsOutput = ResultOf<
  typeof SPIRIT_DEFAULTS_QUERY
>["spirit_defaults"];
export type CoffeeDefaultsOutput = ResultOf<
  typeof COFFEE_DEFAULTS_QUERY
>["coffee_defaults"];

/**
 * Union type for all item defaults outputs
 */
export type ItemDefaultsOutput =
  | BeerDefaultsOutput
  | WineDefaultsOutput
  | SpiritDefaultsOutput
  | CoffeeDefaultsOutput;

/**
 * Union type matching the function's return type
 */
export type GetItemDefaultsResult = ItemDefaultsOutput;

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Valid item types for defaults
 */
export type ValidItemType = "BEER" | "WINE" | "SPIRIT" | "COFFEE" | "SAKE";

/**
 * Processing context for the function
 */
export interface ProcessingContext extends Record<string, unknown> {
  userId: string;
  itemType: ValidItemType;
  frontLabelFileId?: string;
  backLabelFileId?: string;
  barcode?: string;
  barcodeType?: string;
}

/**
 * Function request body interface
 */
export interface GetItemDefaultsRequest extends FunctionRequest {
  itemType: ValidItemType;
  hint: ItemDefaultsHint;
}

/**
 * Analyze images parameters
 */
export interface AnalyzeImagesParams {
  aiProvider: AIProvider;
  images: Buffer[];
  itemType: string;
  schema: JSONSchema7;
  performanceTracker: PerformanceTracker<AIPerformanceMetrics>;
  enumValues?: EnumValues;
}

/**
 * Finalize results parameters
 */
export interface FinalizeResultsParams {
  aiDefaults: AIDefaults;
  modelUsed?: string;
  itemType: string;
  enumValues: EnumValues;
  schema: JSONSchema7;
  barcode?: string;
  barcodeType?: string;
  context: ProcessingContext;
  performanceTracker: PerformanceTracker<AIPerformanceMetrics>;
}

/**
 * Save onboarding parameters
 */
export interface SaveOnboardingParams {
  context: ProcessingContext;
  aiDefaults: AIDefaults;
  results: GetItemDefaultsResult;
  aiModel?: string;
  confidence: number;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches ItemDefaultsHint
 */
export function isItemDefaultsHint(value: unknown): value is ItemDefaultsHint {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    (input.barcode === undefined ||
      input.barcode === null ||
      typeof input.barcode === "string") &&
    (input.barcodeType === undefined ||
      input.barcodeType === null ||
      typeof input.barcodeType === "string") &&
    (input.frontLabelFileId === undefined ||
      input.frontLabelFileId === null ||
      typeof input.frontLabelFileId === "string") &&
    (input.backLabelFileId === undefined ||
      input.backLabelFileId === null ||
      typeof input.backLabelFileId === "string")
  );
}

/**
 * Enhanced validation for ItemDefaultsHint with detailed error messages
 */
export function validateItemDefaultsHint(value: unknown): ItemDefaultsHint {
  const input = validateObjectInput(value, "itemDefaults");

  // All fields are optional, but if provided must be valid
  const barcode = validateOptionalField(
    input,
    "barcode",
    isOptionalString,
    "itemDefaults",
  );

  const barcodeType = validateOptionalField(
    input,
    "barcodeType",
    isOptionalString,
    "itemDefaults",
  );

  const frontLabelFileId = validateOptionalField(
    input,
    "frontLabelFileId",
    (value: unknown): value is string | undefined => {
      if (value === undefined) return true;
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "itemDefaults",
  );

  const backLabelFileId = validateOptionalField(
    input,
    "backLabelFileId",
    (value: unknown): value is string | undefined => {
      if (value === undefined) return true;
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "itemDefaults",
  );

  return {
    barcode,
    barcodeType,
    frontLabelFileId,
    backLabelFileId,
  };
}

/**
 * Enhanced validation for GetItemDefaultsRequest
 */
export function validateGetItemDefaultsRequest(
  value: unknown,
): GetItemDefaultsRequest {
  const input = validateObjectInput(value, "getItemDefaults");

  // Validate item type
  const itemType = validateRequiredField(
    input,
    "itemType",
    (value: unknown): value is ValidItemType => {
      return isNonEmptyString(value) && isValidItemType(value);
    },
    "getItemDefaults",
  );

  // Validate hint
  const hint = validateRequiredField(
    input,
    "hint",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "getItemDefaults",
  );

  const validatedHint = validateItemDefaultsHint(hint);

  // Validate session variables (optional)
  const session_variables = validateOptionalField(
    input,
    "session_variables",
    (value: unknown): value is Record<string, string | undefined> => {
      return typeof value === "object" && value !== null;
    },
    "getItemDefaults",
  );

  return {
    itemType: itemType as ValidItemType,
    hint: validatedHint,
    session_variables,
  };
}

/**
 * Validates processing context
 */
export function validateProcessingContext(
  userId: string,
  itemType: string,
  hint: ItemDefaultsHint,
): ProcessingContext {
  if (!isNonEmptyString(userId)) {
    throw new FunctionValidationError(
      "getItemDefaults",
      "userId",
      "must be a non-empty string",
      userId,
    );
  }

  if (!isValidItemType(itemType)) {
    throw new FunctionValidationError(
      "getItemDefaults",
      "itemType",
      "must be one of: BEER, WINE, SPIRIT, COFFEE",
      itemType,
    );
  }

  // Validate file IDs if provided
  if (hint.frontLabelFileId && !isValidUUID(hint.frontLabelFileId)) {
    throw new FunctionValidationError(
      "getItemDefaults",
      "frontLabelFileId",
      "must be a valid UUID",
      hint.frontLabelFileId,
    );
  }

  if (hint.backLabelFileId && !isValidUUID(hint.backLabelFileId)) {
    throw new FunctionValidationError(
      "getItemDefaults",
      "backLabelFileId",
      "must be a valid UUID",
      hint.backLabelFileId,
    );
  }

  // Validate at least one image is provided
  if (!hint.frontLabelFileId && !hint.backLabelFileId) {
    throw new FunctionValidationError(
      "getItemDefaults",
      "hint",
      "at least one label image (frontLabelFileId or backLabelFileId) is required",
      hint,
    );
  }

  return {
    userId,
    itemType: itemType as ValidItemType,
    frontLabelFileId: hint.frontLabelFileId,
    backLabelFileId: hint.backLabelFileId,
    barcode: hint.barcode,
    barcodeType: hint.barcodeType,
  };
}

// =============================================================================
// Re-exports for Convenience
// =============================================================================

// Type-only re-exports
export type {
  FunctionRequest,
  FunctionResponse,
  FunctionValidationError,
} from "../_utils/function-types";
// Re-export common utilities for easy access
export {
  createFunctionResponse,
  validateFunctionInput,
} from "../_utils/function-types";
