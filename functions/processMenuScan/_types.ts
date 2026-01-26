/**
 * Function-specific types for processMenuScan
 *
 * This module defines all types related to menu scan processing using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import {
  graphql,
  type ItemTypeValue,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
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
 * GraphQL operations for menu scan processing
 */
const UPDATE_SCAN_STATUS_MUTATION = graphql(`
  mutation UpdateScanStatus($scanId: uuid!, $status: String!) {
    update_menu_scans_by_pk(
      pk_columns: { id: $scanId }
      _set: { status: $status }
    ) {
      id
      status
      updated_at
    }
  }
`);

const GET_MENU_SCAN_QUERY = graphql(`
  query GetMenuScan($scanId: uuid!) {
    menu_scans_by_pk(id: $scanId) {
      id
      user_id
      place_id
      image_url
      status
      extracted_text
      created_at
      updated_at
      place {
        id
        name
        primary_category
      }
    }
  }
`);

const SAVE_EXTRACTED_TEXT_MUTATION = graphql(`
  mutation SaveExtractedText($scanId: uuid!, $text: String!) {
    update_menu_scans_by_pk(
      pk_columns: { id: $scanId }
      _set: { extracted_text: $text }
    ) {
      id
      extracted_text
      updated_at
    }
  }
`);

const CREATE_SCANNED_MENU_ITEMS_MUTATION = graphql(`
  mutation CreateScannedMenuItems($items: [place_menu_items_insert_input!]!) {
    insert_place_menu_items(objects: $items) {
      affected_rows
      returning {
        id
        menu_item_name
        menu_item_description
        price
        category
        detected_item_type
        confidence_score
        extracted_attributes
        place_id
        created_at
      }
    }
  }
`);

const COMPLETE_SCAN_MUTATION = graphql(`
  mutation CompleteScan($scanId: uuid!) {
    update_menu_scans_by_pk(
      pk_columns: { id: $scanId }
      _set: { status: "completed" }
    ) {
      id
      status
      updated_at
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for menu scan operations
 */
export type UpdateScanStatusInput = VariablesOf<
  typeof UPDATE_SCAN_STATUS_MUTATION
>;
export type GetMenuScanInput = VariablesOf<typeof GET_MENU_SCAN_QUERY>;
export type SaveExtractedTextInput = VariablesOf<
  typeof SAVE_EXTRACTED_TEXT_MUTATION
>;
export type CreateScannedMenuItemsInput = VariablesOf<
  typeof CREATE_SCANNED_MENU_ITEMS_MUTATION
>;
export type CompleteScanInput = VariablesOf<typeof COMPLETE_SCAN_MUTATION>;

/**
 * Output types for menu scan operations
 */
export type UpdateScanStatusOutput = ResultOf<
  typeof UPDATE_SCAN_STATUS_MUTATION
>["update_menu_scans_by_pk"];
export type GetMenuScanOutput = ResultOf<
  typeof GET_MENU_SCAN_QUERY
>["menu_scans_by_pk"];
export type SaveExtractedTextOutput = ResultOf<
  typeof SAVE_EXTRACTED_TEXT_MUTATION
>["update_menu_scans_by_pk"];
export type CreateScannedMenuItemsOutput = ResultOf<
  typeof CREATE_SCANNED_MENU_ITEMS_MUTATION
>["insert_place_menu_items"];
export type CompleteScanOutput = ResultOf<
  typeof COMPLETE_SCAN_MUTATION
>["update_menu_scans_by_pk"];

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Request interface for processMenuScan function
 */
export interface MenuScanRequest {
  scanId: string;
  userId: string;
}

/**
 * Valid item types for extracted menu items
 * Using lowercase for legacy schema compatibility
 */
export type ExtractedItemType = Lowercase<ItemTypeValue> | "unknown";

/**
 * Extracted menu item structure
 */
export interface ExtractedMenuItem {
  name: string;
  description?: string;
  price?: string;
  category: string;
  itemType: ExtractedItemType;
  confidence: number;
  attributes: {
    // Wine attributes
    vintage?: number;
    variety?: string;
    region?: string;
    winery?: string;

    // Beer attributes
    brewery?: string;
    style?: string;
    abv?: number;
    ibu?: number;

    // Spirit attributes
    distillery?: string;
    type?: string;
    age?: number;
    proof?: number;

    // Coffee attributes
    roaster?: string;
    origin?: string;
    roastLevel?: string;
    processingMethod?: string;
  };
}

/**
 * Menu scan processing context
 */
export interface ScanProcessingContext {
  scanId: string;
  userId: string;
  placeId?: string;
  imageUrl?: string;
  placeName?: string;
  placeCategory?: string;
}

/**
 * OCR result structure
 */
export interface OCRResult {
  text: string;
  confidence: number;
  blocks?: Array<{
    text: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

/**
 * AI extraction result
 */
export interface AIExtractionResult {
  items: ExtractedMenuItem[];
  totalItemsFound: number;
  averageConfidence: number;
  processingNotes?: string;
}

/**
 * Scan processing result
 */
export interface ScanProcessingResult {
  success: boolean;
  scanId: string;
  itemsCreated: number;
  extractedText?: string;
  extractedItems?: ExtractedMenuItem[];
  error?: string;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches MenuScanRequest
 */
export function isMenuScanRequest(value: unknown): value is MenuScanRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.scanId === "string" &&
    input.scanId.length > 0 &&
    typeof input.userId === "string" &&
    input.userId.length > 0
  );
}

/**
 * Enhanced validation for MenuScanRequest with detailed error messages
 */
export function validateMenuScanRequest(value: unknown): MenuScanRequest {
  const input = validateObjectInput(value, "processMenuScan");

  // Validate required scanId
  const scanId = validateRequiredField(
    input,
    "scanId",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "processMenuScan",
  );

  // Validate required userId
  const userId = validateRequiredField(
    input,
    "userId",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "processMenuScan",
  );

  return {
    scanId,
    userId,
  };
}

/**
 * Type guard to check if a value is a valid extracted item type
 */
export function isValidExtractedItemType(
  value: unknown,
): value is ExtractedItemType {
  return (
    typeof value === "string" &&
    ["wine", "beer", "spirit", "coffee", "sake", "unknown"].includes(value)
  );
}

/**
 * Validates extracted menu item structure
 */
export function validateExtractedMenuItem(value: unknown): ExtractedMenuItem {
  const input = validateObjectInput(value, "extractedMenuItem");

  const name = validateRequiredField(
    input,
    "name",
    isNonEmptyString,
    "extractedMenuItem",
  );
  const category = validateRequiredField(
    input,
    "category",
    isNonEmptyString,
    "extractedMenuItem",
  );
  const itemType = validateRequiredField(
    input,
    "itemType",
    isValidExtractedItemType,
    "extractedMenuItem",
  );
  const confidence = validateRequiredField(
    input,
    "confidence",
    (value: unknown): value is number =>
      typeof value === "number" && value >= 0 && value <= 1,
    "extractedMenuItem",
  );

  const description = validateOptionalField(
    input,
    "description",
    isOptionalString,
    "extractedMenuItem",
  );
  const price = validateOptionalField(
    input,
    "price",
    isOptionalString,
    "extractedMenuItem",
  );

  const attributes =
    validateOptionalField(
      input,
      "attributes",
      (value: unknown): value is Record<string, unknown> | undefined => {
        return (
          value === undefined || (typeof value === "object" && value !== null)
        );
      },
      "extractedMenuItem",
    ) ?? {};

  return {
    name,
    description,
    price,
    category,
    itemType,
    confidence,
    attributes: attributes as ExtractedMenuItem["attributes"],
  };
}

/**
 * Creates a processing context from scan data
 */
export function createScanProcessingContext(
  request: MenuScanRequest,
  scanData?: GetMenuScanOutput | null,
): ScanProcessingContext {
  return {
    scanId: request.scanId,
    userId: request.userId,
    placeId: scanData?.place_id ? String(scanData.place_id) : undefined,
    imageUrl: scanData?.image_url ? String(scanData.image_url) : undefined,
    placeName:
      scanData?.place &&
      typeof scanData.place === "object" &&
      scanData.place !== null &&
      "name" in scanData.place
        ? String(scanData.place.name)
        : undefined,
    placeCategory:
      scanData?.place &&
      typeof scanData.place === "object" &&
      scanData.place !== null &&
      "primary_category" in scanData.place
        ? String(scanData.place.primary_category)
        : undefined,
  };
}

/**
 * Validates AI extraction result
 */
export function validateAIExtractionResult(value: unknown): AIExtractionResult {
  const input = validateObjectInput(value, "aiExtractionResult");

  const items = validateRequiredField(
    input,
    "items",
    (value: unknown): value is unknown[] => Array.isArray(value),
    "aiExtractionResult",
  );

  const validatedItems = items.map(validateExtractedMenuItem);

  const totalItemsFound = validateRequiredField(
    input,
    "totalItemsFound",
    (value: unknown): value is number =>
      typeof value === "number" && value >= 0,
    "aiExtractionResult",
  );

  const averageConfidence = validateRequiredField(
    input,
    "averageConfidence",
    (value: unknown): value is number =>
      typeof value === "number" && value >= 0 && value <= 1,
    "aiExtractionResult",
  );

  const processingNotes = validateOptionalField(
    input,
    "processingNotes",
    isOptionalString,
    "aiExtractionResult",
  );

  return {
    items: validatedItems,
    totalItemsFound,
    averageConfidence,
    processingNotes,
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
