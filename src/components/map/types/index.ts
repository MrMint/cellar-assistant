/**
 * Shared type definitions for map components
 * Centralized to avoid duplication across marker components
 *
 * This is the SINGLE SOURCE OF TRUTH for all map-related types
 */

import type { UserPlaceCategory } from "@cellar-assistant/shared";

// ============================================================================
// Core Types
// ============================================================================

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// ============================================================================
// Category & Filter Types
// ============================================================================

// User-selectable categories come from shared; Overture Maps data adds more.
export type PlaceCategory =
  | UserPlaceCategory
  // Overture-only: Restaurant Types
  | "steakhouse"
  | "italian_restaurant"
  | "french_restaurant"
  | "japanese_restaurant"
  | "sushi_restaurant"
  | "mexican_restaurant"
  | "thai_restaurant"
  | "chinese_restaurant"
  // Overture-only: Retail
  | "grocery_store"
  | "supermarket"
  | "specialty_grocery_store"
  | "organic_grocery_store"
  | "wine_wholesaler"
  // Overture-only: Hotels/Entertainment
  | "hotel"
  | "resort"
  | "casino"
  | "music_venue";

export type ItemType = "wine" | "beer" | "spirit" | "coffee" | "sake";
export type VisitStatus = "visited" | "unvisited" | "favorites";

// Identity-based category mapping: single score per category-item-type pair
// identityScore answers: "How central is [item type] to this category's identity?"
export interface CategoryIdentity {
  category: PlaceCategory;
  identityScore: number; // 0.0-1.0, where 1.0 = this IS a [type] place
}

// ============================================================================
// Place Types
// ============================================================================

// Standard place result from clustering query
export interface PlaceResult {
  id: string;
  name: string;
  primary_category: string;
  categories: string[];
  location: {
    coordinates: [number, number];
  };
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
  viewport_area_km2?: number;
  density_per_km2?: number;
  clustering_applied?: boolean;
  // User interaction data (from GraphQL joins)
  user_place_interactions?: Array<{
    is_favorite: boolean;
    is_visited: boolean;
  }>;
  // Enhanced dual scoring system
  overallQuality?: number; // 0-100 overall place quality score
  itemTypeScores?: Record<ItemType, number>; // 0-100 score for each item type
  overallRelevance?: number; // 0-100 overall relevance based on active filters
}

// Alias for backward compatibility
export type Place = PlaceResult;

// Cluster result
export interface PlaceCluster {
  is_cluster: true;
  cluster_id: number;
  cluster_count: number;
  cluster_center: {
    type?: string;
    coordinates: [number, number];
  };
  cluster_bounds?: unknown;
  viewport_area_km2?: number;
  density_per_km2?: number;
  clustering_applied?: boolean;
}

// Union type for map items (either individual place or cluster)
export type MapDataItem = PlaceResult | PlaceCluster;

// Enhanced semantic search result
export interface SemanticPlaceResult extends PlaceResult {
  distance: number;
  matchReason: "semantic_match";
  confidenceScore: number;
  relevance_score?: number; // Alternative field name for compatibility
}

// ============================================================================
// Geocoding Types
// ============================================================================

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  displayName: string;
}

// ============================================================================
// Search Types
// ============================================================================

// Unified search parameters
export interface MapSearchParams {
  bounds: MapBounds;

  // Filter options
  itemTypes?: ItemType[];
  minRating?: number;
  visitStatuses?: VisitStatus[];
  tierListIds?: string[];
  // Semantic search
  semanticQuery?: string;
  /** When true, semantic search ignores viewport bounds (searches globally). Default true. */
  globalSearch?: boolean;

  // General options
  limit?: number;
}

// Unified search results - simplified, server-calculated relevance
export interface MapSearchResults {
  places: PlaceResult[];
  mapItems: MapDataItem[];
  semanticResults?: SemanticPlaceResult[];
  isSemanticSearch: boolean;
  geocodeResult?: GeocodedLocation;
  searchMetadata: {
    itemTypes: ItemType[];
    totalResults: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Filter Types
// ============================================================================

export interface MapFilters {
  selectedItemTypes: string[];
  minRating?: number;
  searchQuery: string;
  visitStatuses: VisitStatus[];
}
