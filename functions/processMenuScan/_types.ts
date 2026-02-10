/**
 * Function-specific types for processMenuScan.
 *
 * Single-pass vision extraction: image → AI structured output → JSON items.
 */

import type { ItemTypeValue } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// Request Types
// =============================================================================

/**
 * Request interface for processMenuScan function
 */
export interface MenuScanRequest {
  scanId: string;
  userId: string;
}

// =============================================================================
// Extraction Types
// =============================================================================

/**
 * Valid item types for extracted menu items.
 * Lowercase for consistency with the schema enum in _prompts.ts.
 */
export type ExtractedItemType =
  | Lowercase<ItemTypeValue>
  | "cocktail"
  | "unknown";

/**
 * Extracted menu item structure — matches the JSON schema in _prompts.ts.
 */
export interface ExtractedMenuItem {
  name: string;
  search_name: string;
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

    // Cocktail attributes
    base_spirit?: string;
    ingredients?: string;
    cocktail_style?: string;

    // Common
    country?: string;
    producer?: string;
  };
}
