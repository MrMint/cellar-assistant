"use server";

import { graphql } from "@cellar-assistant/shared/gql";
import {
  calculateItemTypeMatches,
  calculateOverallQuality,
  calculateOverallRelevance,
  calculatePlaceRelevance,
  mapItemTypesToCategories,
} from "@/components/map/config/scoring";
import type {
  ItemType,
  MapBounds,
  MapDataItem,
  MapSearchParams,
  MapSearchResults,
  PlaceCluster,
  PlaceResult,
  SemanticPlaceResult,
  VisitStatus,
} from "@/components/map/types";
import { getCachedSearchVector } from "@/lib/cache";
import { adminQuery, serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

// Label-type weights for category score aggregation (from seedCategoryVectors)
type LabelType = "category" | "alias" | "item_type" | "descriptor";
const LABEL_TYPE_WEIGHTS: Record<LabelType, number> = {
  category: 1.0,
  item_type: 0.95,
  alias: 0.9,
  descriptor: 0.8,
};

// Query category vectors for semantic matching via tracked Hasura function
const SearchCategoryVectorsQuery = graphql(`
  query SearchCategoryVectors(
    $queryVector: halfvec!
    $maxDistance: float8!
    $limit: Int!
  ) {
    searchCategoryVectors(
      args: {
        query_vector: $queryVector
        max_distance: $maxDistance
        result_limit: $limit
      }
    ) {
      id
      label
      label_type
      associated_categories
      metadata
      distance
    }
  }
`);

// Hybrid place search combining text + trigram + category + bounds
const HybridPlaceSearchQuery = graphql(`
  query HybridPlaceSearch(
    $searchQuery: String!
    $matchedCategories: _text
    $categoryScores: _float8
    $westBound: float8
    $southBound: float8
    $eastBound: float8
    $northBound: float8
    $minRating: float8
    $resultLimit: Int
  ) {
    searchPlacesHybrid(
      args: {
        search_query: $searchQuery
        matched_categories: $matchedCategories
        category_scores: $categoryScores
        west_bound: $westBound
        south_bound: $southBound
        east_bound: $eastBound
        north_bound: $northBound
        min_rating: $minRating
        result_limit: $resultLimit
      }
    ) {
      id
      name
      location
      primary_category
      categories
      confidence
      street_address
      locality
      region
      postcode
      country_code
      phone
      website
      email
      hours
      price_level
      rating
      review_count
      is_verified
      text_rank
      trigram_similarity
      category_score
      combined_score
    }
  }
`);

// Import the existing GraphQL query from the XState machine (legacy)
const SearchPlacesClusteredQuery = graphql(`
  query SearchPlacesClustered(
    $westBound: float8!
    $southBound: float8!  
    $eastBound: float8!
    $northBound: float8!
    $categoryFilter: _text
    $minRating: float8
    $visitStatusFilter: String
    $filterUserId: uuid
    $resultLimit: Int
  ) {
    searchPlacesAdaptiveCluster(
      args: {
        west_bound: $westBound
        south_bound: $southBound
        east_bound: $eastBound
        north_bound: $northBound
        category_filter: $categoryFilter
        min_rating: $minRating
        visit_status_filter: $visitStatusFilter
        filter_user_id: $filterUserId
        result_limit: $resultLimit
      }
    ) {
      is_cluster
      cluster_id
      cluster_count
      cluster_center
      cluster_bounds
      id
      name
      location
      primary_category
      categories
      confidence
      street_address
      locality
      region
      postcode
      country_code
      phone
      website
      email
      hours
      price_level
      rating
      review_count
      is_verified
      viewport_area_km2
      density_per_km2
      clustering_applied
    }
  }
`);

// Transform raw query results to our standard format with relevance calculation
function transformPlaceResult(
  item: any,
  searchParams?: MapSearchParams,
): PlaceResult {
  // Parse location coordinates from native PostGIS geometry object
  // NOTE: The searchPlacesAdaptiveCluster PostgreSQL function returns native PostGIS geometry types
  // instead of JSON strings, eliminating the need for client-side JSON parsing.
  // PostGIS geography/geometry types are returned by GraphQL as objects with coordinates property.
  let coordinates: [number, number] = [0, 0];
  if (item.location?.coordinates && Array.isArray(item.location.coordinates)) {
    // Native PostGIS geometry object with coordinates array
    coordinates = item.location.coordinates;
  } else if (typeof item.location === "string") {
    try {
      // Fallback: parse JSON string for backward compatibility (legacy function)
      const locationData = JSON.parse(item.location);
      if (locationData.coordinates && Array.isArray(locationData.coordinates)) {
        coordinates = locationData.coordinates;
      }
    } catch (error) {
      console.error(
        `Failed to parse location for ${item.name}:`,
        item.location,
        error,
      );
      // Fallback: try to parse as POINT string format
      const match = item.location.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(" ").map(Number);
        coordinates = [lng, lat];
      }
    }
  }

  return {
    id: item.id,
    name: item.name || "Unknown Place",
    primary_category: item.primary_category || "unknown",
    categories: Array.isArray(item.categories)
      ? item.categories
      : [item.primary_category || "unknown"],
    location: { coordinates },
    rating: item.rating,
    price_level: item.price_level,
    street_address: item.street_address,
    locality: item.locality,
    region: item.region,
    postcode: item.postcode,
    country_code: item.country_code,
    phone: item.phone,
    website: item.website,
    email: item.email,
    hours: item.hours,
    confidence: item.confidence,
    is_verified: item.is_verified,
    viewport_area_km2: item.viewport_area_km2,
    density_per_km2: item.density_per_km2,
    clustering_applied: item.clustering_applied,
    // Add enhanced dual scoring system
    ...(searchParams
      ? (() => {
          // Always calculate overall quality
          const overallQuality = calculateOverallQuality(item);

          // Always calculate item type scores for all item types (for background color detection)
          const itemTypeScores = calculateItemTypeMatches(item);

          // Calculate overall relevance score based on all active filters
          const overallRelevance = calculateOverallRelevance(
            searchParams,
            itemTypeScores,
          );

          // Legacy support: calculate old relevance score for backward compatibility
          const { relevanceScore, matchedItemTypes } =
            searchParams.itemTypes && searchParams.itemTypes.length > 0
              ? calculatePlaceRelevance(item, searchParams)
              : { relevanceScore: undefined, matchedItemTypes: [] };

          return {
            overallQuality,
            itemTypeScores,
            overallRelevance, // New server-calculated overall relevance
            // Legacy fields for backward compatibility
            relevanceScore,
            matchedItemTypes,
          };
        })()
      : {}),
  };
}

function transformClusterResult(item: any): PlaceCluster {
  // Parse cluster center coordinates from native PostGIS geometry object
  // NOTE: The searchPlacesAdaptiveCluster function returns native PostGIS geometry types
  // instead of JSON strings, eliminating the need for client-side JSON parsing.
  let clusterCoordinates: [number, number] = [0, 0];

  if (
    item.cluster_center?.coordinates &&
    Array.isArray(item.cluster_center.coordinates)
  ) {
    // Native PostGIS geometry object with coordinates array
    clusterCoordinates = item.cluster_center.coordinates;
  } else if (typeof item.cluster_center === "string") {
    try {
      // Fallback: parse JSON string for backward compatibility (legacy function)
      const locationData = JSON.parse(item.cluster_center);
      if (locationData.coordinates && Array.isArray(locationData.coordinates)) {
        clusterCoordinates = locationData.coordinates;
      }
    } catch (error) {
      console.error(
        `Failed to parse cluster_center for cluster ${item.cluster_id}:`,
        item.cluster_center,
        error,
      );
      // Fallback: try to parse as POINT string format
      const match = item.cluster_center.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(" ").map(Number);
        clusterCoordinates = [lng, lat];
      }
    }
  }

  return {
    is_cluster: true,
    cluster_id: item.cluster_id,
    cluster_count: item.cluster_count,
    cluster_center: { coordinates: clusterCoordinates },
    cluster_bounds: item.cluster_bounds,
    viewport_area_km2: item.viewport_area_km2,
    density_per_km2: item.density_per_km2,
    clustering_applied: item.clustering_applied,
  };
}

/**
 * Unified server action for all map search operations
 * Handles both standard filtering and semantic search
 */
export async function searchMapPlaces(
  params: MapSearchParams,
): Promise<MapSearchResults> {
  // Ensure user is authenticated
  const userId = await getServerUserId();

  const {
    bounds,
    itemTypes = [],
    minRating,
    visitStatuses = [],
    semanticQuery,
    limit = 500,
  } = params;

  try {
    // Handle semantic search with optional filters (Option C)
    // Cap semantic search at 50 results — hybrid ranked results are already
    // sorted by combined_score so pulling more adds noise, not signal.
    if (semanticQuery && semanticQuery.trim().length > 0) {
      return await performSemanticSearch(
        semanticQuery,
        bounds,
        itemTypes,
        minRating,
        visitStatuses,
        Math.min(limit, 50),
      );
    }

    // Handle standard filtering search
    return await performStandardSearch(
      bounds,
      itemTypes,
      minRating,
      visitStatuses,
      userId,
      limit,
    );
  } catch (error) {
    console.error("❌ [Server Action] Map search error:", error);

    // Return empty results on error instead of throwing
    return {
      places: [],
      mapItems: [],
      isSemanticSearch: !!semanticQuery,
      searchMetadata: {
        itemTypes: itemTypes || [],
        totalResults: 0,
        hasMore: false,
      },
    };
  }
}

// Perform hybrid search using text + trigram + category semantic matching
// Calls Hasura directly instead of routing through a Nhost function
async function performSemanticSearch(
  query: string,
  bounds: MapBounds,
  itemTypes: ItemType[],
  minRating: number | undefined,
  visitStatuses: VisitStatus[],
  limit: number,
): Promise<MapSearchResults> {
  try {
    // Step 1: Generate query vector via Next.js cache (24h TTL, shared across users)
    const cachedVector = await getCachedSearchVector(query.trim());
    const queryVector: number[] | undefined = cachedVector
      ? JSON.parse(cachedVector)
      : undefined;

    if (!queryVector || queryVector.length === 0) {
      throw new Error("Failed to generate query vector");
    }

    const queryVectorString = `[${queryVector.join(",")}]`;

    // Step 2: Find matching category vectors via Hasura
    const categoryResult = await adminQuery(SearchCategoryVectorsQuery, {
      queryVector: queryVectorString,
      maxDistance: 0.6,
      limit: 15,
    });

    const categoryMatches = categoryResult?.searchCategoryVectors ?? [];

    // Score categories: label-type weighting + quadratic decay
    const categoryScoreMap = new Map<string, number>();
    for (const match of categoryMatches) {
      const distance =
        typeof match.distance === "number"
          ? match.distance
          : Number(match.distance) || 1.0;
      const rawSimilarity = Math.max(0, 1 - distance / 2);
      const labelType = (match.label_type ?? "descriptor") as LabelType;
      const typeWeight = LABEL_TYPE_WEIGHTS[labelType] ?? 0.8;
      const weightedSimilarity = rawSimilarity * rawSimilarity * typeWeight;

      const categories = match.associated_categories ?? [];
      for (const cat of categories) {
        const existing = categoryScoreMap.get(cat) ?? 0;
        categoryScoreMap.set(cat, Math.max(existing, weightedSimilarity));
      }
    }

    const matchedCategories = Array.from(categoryScoreMap.keys());
    const categoryScores = matchedCategories.map(
      (cat) => categoryScoreMap.get(cat) ?? 0,
    );

    // Step 3: Execute hybrid search (text + trigram + category + bounds) via Hasura
    const hybridResult = await adminQuery(HybridPlaceSearchQuery, {
      searchQuery: query.trim(),
      matchedCategories:
        matchedCategories.length > 0
          ? `{${matchedCategories.join(",")}}`
          : null,
      categoryScores:
        categoryScores.length > 0 ? `{${categoryScores.join(",")}}` : null,
      westBound: bounds.west,
      southBound: bounds.south,
      eastBound: bounds.east,
      northBound: bounds.north,
      minRating: minRating ?? null,
      resultLimit: limit,
    });

    const rawResults = hybridResult?.searchPlacesHybrid ?? [];

    // Step 4: Transform results
    const searchParams: MapSearchParams = {
      bounds,
      itemTypes,
      minRating,
      visitStatuses,
      semanticQuery: query,
    };

    let semanticResults: SemanticPlaceResult[] = rawResults.map(
      (place: any) => {
        const combinedScore =
          typeof place.combined_score === "number"
            ? place.combined_score
            : Number(place.combined_score) || 0;
        const confidenceScore = Math.max(0, Math.min(100, combinedScore * 100));
        const distance = Math.max(0, 2 * (1 - combinedScore));

        const transformed = transformPlaceResult(place, searchParams);
        return {
          ...transformed,
          overallRelevance: confidenceScore,
          distance,
          matchReason: "semantic_match" as const,
          confidenceScore,
        };
      },
    );

    // Adaptive threshold: filter weak matches relative to the strongest result
    const RELATIVE_CUTOFF = 0.33;
    const ABSOLUTE_MINIMUM = 5; // combined_score > 0.05
    const topScore = Math.max(
      ...semanticResults.map((r) => r.confidenceScore),
      0,
    );
    const threshold = Math.max(topScore * RELATIVE_CUTOFF, ABSOLUTE_MINIMUM);
    semanticResults = semanticResults.filter(
      (place) => place.confidenceScore >= threshold,
    );

    // Apply filters to hybrid results
    if (itemTypes.length > 0) {
      semanticResults = semanticResults.filter((place) => {
        const hasItemTypeMatch =
          place.itemTypeScores &&
          itemTypes.some(
            (itemType) => (place.itemTypeScores?.[itemType] ?? 0) > 0,
          );
        return hasItemTypeMatch;
      });
    }

    // Normalize overallRelevance so the best result renders at full size/opacity
    if (semanticResults.length > 0) {
      const maxConfidence = Math.max(
        ...semanticResults.map((r) => r.confidenceScore),
      );
      if (maxConfidence > 0) {
        semanticResults = semanticResults.map((place) => ({
          ...place,
          overallRelevance: (place.confidenceScore / maxConfidence) * 100,
        }));
      }
    }

    return {
      places: semanticResults,
      mapItems: semanticResults,
      semanticResults,
      isSemanticSearch: true,
      searchMetadata: {
        itemTypes,
        totalResults: rawResults.length,
        hasMore: false,
      },
    };
  } catch (error) {
    console.error("❌ [Server Action] Hybrid search error:", error);
    throw error;
  }
}

// Perform standard GraphQL clustering search
async function performStandardSearch(
  bounds: MapBounds,
  itemTypes: ItemType[],
  minRating: number | undefined,
  visitStatuses: VisitStatus[],
  userId: string,
  limit: number,
): Promise<MapSearchResults> {
  // Perform item type to category mapping on server
  const categories = mapItemTypesToCategories(itemTypes);

  // Convert visit statuses to backend format
  let visitStatusFilter: string | null = null;
  if (visitStatuses.length === 1) {
    if (visitStatuses[0] === "visited") {
      visitStatusFilter = "visited";
    } else if (visitStatuses[0] === "unvisited") {
      visitStatusFilter = "unvisited";
    }
  }

  const searchResult = await serverQuery(SearchPlacesClusteredQuery, {
    westBound: bounds.west,
    southBound: bounds.south,
    eastBound: bounds.east,
    northBound: bounds.north,
    categoryFilter:
      categories && categories.length > 0 ? `{${categories.join(",")}}` : null,
    minRating: minRating || null,
    visitStatusFilter,
    filterUserId: userId,
    resultLimit: limit,
  });

  if (!searchResult?.searchPlacesAdaptiveCluster) {
    throw new Error("No clustering data returned");
  }

  const clusteringResults = searchResult.searchPlacesAdaptiveCluster;

  // Create search parameters for relevance calculation
  const searchParams: MapSearchParams = {
    bounds,
    itemTypes,
    minRating,
    visitStatuses,
  };

  // Transform results with relevance calculation
  const mapItems: MapDataItem[] = clusteringResults.map((item: any) => {
    if (item.is_cluster) {
      return transformClusterResult(item);
    } else {
      return transformPlaceResult(item, searchParams); // Include searchParams for relevance calculation
    }
  });

  // Extract just the places (non-cluster items) - already transformed with relevance
  const places: PlaceResult[] = mapItems.filter(
    (item): item is PlaceResult => !("is_cluster" in item),
  );

  const clusters = mapItems.filter(
    (item): item is PlaceCluster => "is_cluster" in item,
  );
  return {
    places,
    mapItems,
    isSemanticSearch: false,
    searchMetadata: {
      itemTypes,
      totalResults: places.length + clusters.length,
      hasMore: places.length + clusters.length >= limit,
    },
  };
}
