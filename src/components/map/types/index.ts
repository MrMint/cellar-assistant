/**
 * Shared type definitions for map components
 * Centralized to avoid duplication across marker components
 *
 * This is the SINGLE SOURCE OF TRUTH for all map-related types
 */

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

// Comprehensive PlaceCategory based on Overture Maps analysis
// All 44 high-priority categories from the research
export type PlaceCategory =
  // Tier 1: Essential Categories (10)
  | "restaurant"
  | "bar"
  | "cafe"
  | "coffee_shop"
  | "liquor_store"
  | "winery"
  | "brewery"
  | "cocktail_bar"
  | "wine_bar"
  | "distillery"
  // Tier 2: High Priority Categories (11)
  | "pub"
  | "beer_bar"
  | "sports_bar"
  | "lounge"
  | "gastropub"
  | "tapas_bar"
  | "sake_bar"
  | "whiskey_bar"
  | "beer_garden"
  | "wine_tasting_room"
  | "coffee_roastery"
  // Tier 3: Restaurant Types (8) - Strong beverage focus
  | "steakhouse"
  | "italian_restaurant"
  | "french_restaurant"
  | "japanese_restaurant"
  | "sushi_restaurant"
  | "mexican_restaurant"
  | "thai_restaurant"
  | "chinese_restaurant"
  // Tier 4: Retail Categories (7) - Beverage retail
  | "grocery_store"
  | "supermarket"
  | "specialty_grocery_store"
  | "organic_grocery_store"
  | "beer_wine_and_spirits"
  | "wine_wholesaler"
  | "beverage_store"
  // Tier 5: Hotels/Entertainment (4) - Massive venue counts
  | "hotel"
  | "resort"
  | "casino"
  | "music_venue"
  // Additional categories
  | "specialty_store";

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
  // Legacy fields (deprecated - use new scoring system)
  relevanceScore?: number; // 0-100 based on how well it matches the search criteria
  matchedItemTypes?: ItemType[]; // Which item types this place matches
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
// Search Types
// ============================================================================

// Unified search parameters
export interface MapSearchParams {
  bounds: MapBounds;

  // Filter options
  itemTypes?: ItemType[];
  minRating?: number;
  visitStatuses?: VisitStatus[];
  // Semantic search
  semanticQuery?: string;
  maxSemanticDistance?: number;

  // General options
  limit?: number;
}

// Unified search results - simplified, server-calculated relevance
export interface MapSearchResults {
  places: PlaceResult[];
  mapItems: MapDataItem[];
  semanticResults?: SemanticPlaceResult[];
  isSemanticSearch: boolean;
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

// ============================================================================
// Animation Types (Framer Motion compatible)
// ============================================================================

export interface AnimationVariants {
  hidden: { opacity: number; scale: number };
  visible: { opacity: number; scale: number };
  exit: { opacity: number; scale: number };
  [key: string]: { opacity: number; scale: number }; // Index signature for Framer Motion
}

export interface AnimationTransition {
  duration: number;
  ease: readonly [number, number, number, number];
}

// ============================================================================
// Component Prop Types
// ============================================================================

export interface BaseMarkerProps {
  animationVariants?: AnimationVariants;
  animationTransition?: AnimationTransition;
  isNewlyVisible?: boolean;
  isExiting?: boolean;
  disableAnimations?: boolean;
}

export interface PlaceMarkerProps extends BaseMarkerProps {
  place: Place;
  filters?: MapFilters;
  onPlaceClick?: (place: Place) => void;
  size?: number;
  showLabels?: boolean;
}

export interface ClusterMarkerProps extends BaseMarkerProps {
  position: [number, number];
  pointCount: number;
  clusterId: number;
  clusterCenter: [number, number];
  isDarkMode?: boolean;
  isDensityHigh?: boolean;
  onClusterClick?: (clusterId: number, center: [number, number]) => void;
}
