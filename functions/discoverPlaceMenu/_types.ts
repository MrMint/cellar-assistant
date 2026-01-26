/**
 * Function-specific types for discoverPlaceMenu
 *
 * This module defines all types related to place menu discovery using gql.tada
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
 * GraphQL operations for place menu discovery
 */
const GET_PLACE_FOR_MENU_DISCOVERY_QUERY = graphql(`
  query GetPlaceForMenuDiscovery($id: uuid!) {
    places_by_pk(id: $id) {
      id
      name
      website
      categories
      primary_category
      phone
    }
  }
`);

const CREATE_PLACE_MENU_MUTATION = graphql(`
  mutation CreatePlaceMenu($menu: place_menus_insert_input!) {
    insert_place_menus_one(
      object: $menu
      on_conflict: {
        constraint: idx_place_menus_current_unique
        update_columns: [
          menu_data,
          confidence_score,
          discovered_at,
          updated_at,
          version
        ]
      }
    ) {
      id
      version
      place_id
      menu_type
      source
      confidence_score
      created_at
    }
  }
`);

const CREATE_MENU_ITEMS_MUTATION = graphql(`
  mutation CreateMenuItems($items: [place_menu_items_insert_input!]!) {
    insert_place_menu_items(objects: $items) {
      affected_rows
      returning {
        id
        menu_item_name
        detected_item_type
        confidence_score
        place_id
        menu_category
      }
    }
  }
`);

const UPDATE_PLACE_ACCESS_MUTATION = graphql(`
  mutation UpdatePlaceAccess($placeId: uuid!) {
    update_places_by_pk(
      pk_columns: { id: $placeId }
      _inc: { access_count: 1 }
      _set: {
        last_accessed_at: "now()"
        first_cached_reason: "menu_discovery"
      }
    ) {
      id
      access_count
      last_accessed_at
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for menu discovery operations
 */
export type GetPlaceForMenuDiscoveryInput = VariablesOf<
  typeof GET_PLACE_FOR_MENU_DISCOVERY_QUERY
>;
export type CreatePlaceMenuInput = VariablesOf<
  typeof CREATE_PLACE_MENU_MUTATION
>;
export type CreateMenuItemsInput = VariablesOf<
  typeof CREATE_MENU_ITEMS_MUTATION
>;
export type UpdatePlaceAccessInput = VariablesOf<
  typeof UPDATE_PLACE_ACCESS_MUTATION
>;

/**
 * Output types for menu discovery operations
 */
export type GetPlaceForMenuDiscoveryOutput = ResultOf<
  typeof GET_PLACE_FOR_MENU_DISCOVERY_QUERY
>["places_by_pk"];
export type CreatePlaceMenuOutput = ResultOf<
  typeof CREATE_PLACE_MENU_MUTATION
>["insert_place_menus_one"];
export type CreateMenuItemsOutput = ResultOf<
  typeof CREATE_MENU_ITEMS_MUTATION
>["insert_place_menu_items"];
export type UpdatePlaceAccessOutput = ResultOf<
  typeof UPDATE_PLACE_ACCESS_MUTATION
>["update_places_by_pk"];

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Request interface for discoverPlaceMenu function
 */
export interface MenuDiscoveryRequest {
  placeId: string;
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
 * Menu discovery context
 */
export interface MenuDiscoveryContext {
  placeId: string;
  userId: string;
  placeName?: string;
  placeWebsite?: string;
  placeCategories?: string[];
  [key: string]: unknown;
}

/**
 * Website fetch result
 */
export interface WebsiteFetchResult {
  content: string;
  contentLength: number;
  fetchedAt: Date;
  url: string;
}

/**
 * AI extraction result for menu discovery
 */
export interface AIMenuExtractionResult {
  items: ExtractedMenuItem[];
  totalItemsFound: number;
  averageConfidence: number;
  processingNotes?: string;
}

/**
 * Menu data structure for database storage
 */
export interface MenuData {
  items: ExtractedMenuItem[];
  extractedAt: string;
  totalItems: number;
  source: string;
  categories: string[];
}

/**
 * Menu discovery result
 */
export interface MenuDiscoveryResult {
  success: boolean;
  menuId?: string;
  itemsFound: number;
  itemsCreated: number;
  confidenceScore: number;
  categories: string[];
  itemTypes: Record<string, number>;
  error?: string;
}

/**
 * Menu type determination result
 */
export type MenuType = "coffee" | "drinks" | "beer" | "wine" | "food";

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches MenuDiscoveryRequest
 */
export function isMenuDiscoveryRequest(
  value: unknown,
): value is MenuDiscoveryRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;

  return (
    typeof input.placeId === "string" &&
    input.placeId.length > 0 &&
    typeof input.userId === "string" &&
    input.userId.length > 0
  );
}

/**
 * Enhanced validation for MenuDiscoveryRequest with detailed error messages
 */
export function validateMenuDiscoveryRequest(
  value: unknown,
): MenuDiscoveryRequest {
  const input = validateObjectInput(value, "discoverPlaceMenu");

  // Validate required placeId
  const placeId = validateRequiredField(
    input,
    "placeId",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "discoverPlaceMenu",
  );

  // Validate required userId
  const userId = validateRequiredField(
    input,
    "userId",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "discoverPlaceMenu",
  );

  return {
    placeId,
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
 * Creates a discovery context from request and place data
 */
export function createMenuDiscoveryContext(
  request: MenuDiscoveryRequest,
  placeData?: GetPlaceForMenuDiscoveryOutput | null,
): MenuDiscoveryContext {
  return {
    placeId: request.placeId,
    userId: request.userId,
    placeName: placeData?.name ? String(placeData.name) : undefined,
    placeWebsite: placeData?.website ? String(placeData.website) : undefined,
    placeCategories: Array.isArray(placeData?.categories)
      ? placeData.categories.map(String)
      : undefined,
  };
}

/**
 * Validates website fetch result
 */
export function validateWebsiteFetchResult(value: unknown): WebsiteFetchResult {
  const input = validateObjectInput(value, "websiteFetchResult");

  const content = validateRequiredField(
    input,
    "content",
    isNonEmptyString,
    "websiteFetchResult",
  );
  const url = validateRequiredField(
    input,
    "url",
    isNonEmptyString,
    "websiteFetchResult",
  );

  return {
    content,
    contentLength: content.length,
    fetchedAt: new Date(),
    url,
  };
}

/**
 * Validates AI menu extraction result
 */
export function validateAIMenuExtractionResult(
  value: unknown,
): AIMenuExtractionResult {
  const input = validateObjectInput(value, "aiMenuExtractionResult");

  const items = validateRequiredField(
    input,
    "items",
    (value: unknown): value is unknown[] => Array.isArray(value),
    "aiMenuExtractionResult",
  );

  const validatedItems = items.map(validateExtractedMenuItem);

  return {
    items: validatedItems,
    totalItemsFound: validatedItems.length,
    averageConfidence:
      validatedItems.length > 0
        ? validatedItems.reduce((sum, item) => sum + item.confidence, 0) /
          validatedItems.length
        : 0,
  };
}

/**
 * Determines menu type based on place categories
 */
export function determineMenuType(categories: string[] = []): MenuType {
  if (categories.includes("coffee_shop") || categories.includes("cafe"))
    return "coffee";
  if (categories.includes("bar") || categories.includes("pub")) return "drinks";
  if (categories.includes("brewery")) return "beer";
  if (categories.includes("winery")) return "wine";
  return "food";
}

/**
 * Parses price string to numeric value
 */
export function parsePrice(priceString: string): number | null {
  // Extract numeric price from string like "$12.50", "€15", "£8.99", etc.
  const match = priceString.match(/[\d,]+\.?\d*/);
  if (match) {
    const numericPrice = parseFloat(match[0].replace(",", ""));
    return Number.isNaN(numericPrice) ? null : numericPrice;
  }
  return null;
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
