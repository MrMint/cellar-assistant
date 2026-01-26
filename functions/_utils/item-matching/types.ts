/**
 * Type definitions for the item matching system
 */

import type { ItemTypeValue, ResultOf } from "@cellar-assistant/shared";
import type {
  SEARCH_WINES_TEXT_QUERY,
  SEARCH_BEERS_TEXT_QUERY,
  SEARCH_SPIRITS_TEXT_QUERY,
  SEARCH_COFFEES_TEXT_QUERY,
  SEARCH_SAKES_TEXT_QUERY,
} from "../search-queries";

export interface ItemMatchRequest {
  name: string;
  brand_name?: string;
  product_name?: string;
  generic_name?: string;
  category?: string;
  subcategory?: string;
  country?: string;
  item_type: ItemTypeValue | "generic";

  // Additional context for better matching
  alcohol_content?: number;
  vintage?: string;
  region?: string;

  // Optional fields for enhanced matching
  description?: string;
  style?: string;
  variety?: string;
}

export interface ItemMatchResult {
  type: "specific" | "generic";
  itemId: string;
  itemType: ItemTypeValue | "generic";
  confidence: number;
  matchReason:
    | "exact_brand"
    | "brand_similarity"
    | "category_match"
    | "semantic_similarity"
    | "exact_name";
  item: ItemRecord; // The actual item data from database
}

export interface SearchResult {
  id: string;
  name: string;
  brand_name?: string | null;
  category?: string | null;
  country?: string | null;
  vintage?: string | number | null;
  alcohol_content_percentage?: number | null;
  similarity_score?: number;
  // Additional fields will be added based on item type
  [key: string]: unknown;
}

export interface SearchOptions {
  confidenceThreshold?: number;
  includeGeneric?: boolean;
  maxResults?: number;
}

export interface SpecificItemSearchParams {
  itemType: ItemTypeValue;
  searchTerms: string;
  filters: {
    category?: string;
    country?: string;
    alcohol_content?: number;
    vintage?: string;
    style?: string;
    variety?: string;
  };
  limit: number;
  similarityThreshold: number;
}

export interface GenericItemSearchParams {
  searchTerms: string;
  category?: string;
  itemType: string;
  limit: number;
  similarityThreshold: number;
}

// =============================================================================
// Derived Types from GraphQL Queries
// =============================================================================

// Extract individual item types from text search queries
type WineItem = NonNullable<
  ResultOf<typeof SEARCH_WINES_TEXT_QUERY>["wines"]
>[number];
type BeerItem = NonNullable<
  ResultOf<typeof SEARCH_BEERS_TEXT_QUERY>["beers"]
>[number];
type SpiritItem = NonNullable<
  ResultOf<typeof SEARCH_SPIRITS_TEXT_QUERY>["spirits"]
>[number];
type CoffeeItem = NonNullable<
  ResultOf<typeof SEARCH_COFFEES_TEXT_QUERY>["coffees"]
>[number];
type SakeItem = NonNullable<
  ResultOf<typeof SEARCH_SAKES_TEXT_QUERY>["sakes"]
>[number];

/**
 * Vector search result with distance and optional item types
 * Uses interface to allow property access without narrowing
 */
export interface VectorSearchResult {
  distance: number;
  wine?: WineItem;
  beer?: BeerItem;
  spirit?: SpiritItem;
  coffee?: CoffeeItem;
  sake?: SakeItem;
}

/**
 * Common base type for all item records
 * Includes all possible fields across item types as optional
 */
export interface ItemRecord {
  id: string;
  name: string;
  country?: string | null;
  // Vintage can be string (wine/beer) or number (sake)
  vintage?: string | number | null;
  alcohol_content_percentage?: number | null;
  // Style/type fields vary by item type
  style?: string | null;
  variety?: string | null;
  type?: string | null;
  category?: string | null;
  region?: string | null;
  roast_level?: string | null;
  process?: string | null;
  species?: string | null;
  polish_grade?: number | null;
  rice_variety?: string | null;
  serving_temperature?: string | null;
  wine_style?: string | null;
  wine_variety?: string | null;
  beer_style?: string | null;
  spirit_type?: string | null;
  coffee_style?: string | null;
  sake_style?: string | null;
  sake_type?: string | null;
  // Brand name fields (vary by item type)
  brand_name?: string | null;
  producer_name?: string | null;
  brewery_name?: string | null;
  distillery_name?: string | null;
  farm_name?: string | null;
  // Brand relationships
  brands?: Array<{ brand: { name: string } | null }> | null;
  // Allow additional properties for flexibility
  itemType?: string;
  [key: string]: unknown;
}
