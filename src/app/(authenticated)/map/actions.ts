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
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

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
        userId,
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
async function performSemanticSearch(
  query: string,
  bounds: MapBounds,
  itemTypes: ItemType[],
  minRating: number | undefined,
  visitStatuses: VisitStatus[],
  userId: string,
  limit: number,
): Promise<MapSearchResults> {
  try {
    // Generate query vector via Next.js cache (24h TTL, shared across users)
    const cachedVector = await getCachedSearchVector(query.trim());
    const queryVector = cachedVector ? JSON.parse(cachedVector) : undefined;

    // Call hybrid search Nhost function with pre-computed vector
    const nhostFunctionUrl =
      process.env.NHOST_FUNCTION_URL || "https://local.functions.nhost.run";

    const response = await fetch(`${nhostFunctionUrl}/v1/hybridPlaceSearch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "nhost-webhook-secret": process.env.NHOST_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify({
        input: {
          query: query.trim(),
          queryVector,
          bounds,
          limit,
          itemTypes,
          minRating,
        },
        session_variables: {
          "x-hasura-user-id": userId,
        },
      }),
    });

    if (!response.ok) {
      console.error(
        `Hybrid search failed: ${response.status} ${response.statusText}`,
      );
      throw new Error(`Hybrid search failed: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      console.warn("Hybrid search returned unsuccessful result");
      throw new Error("Hybrid search unsuccessful");
    }

    // Create search parameters for relevance calculation and filtering
    const searchParams: MapSearchParams = {
      bounds,
      itemTypes,
      minRating,
      visitStatuses,
      semanticQuery: query,
    };

    // Transform and apply search parameters for relevance scoring
    let semanticResults: SemanticPlaceResult[] = result.places.map(
      (place: any) => {
        const transformed = transformPlaceResult(place, searchParams);
        const confidenceScore = place.confidenceScore ?? 0;
        return {
          ...transformed,
          overallRelevance: confidenceScore, // Hybrid score drives marker sizing
          distance: place.distance ?? 0,
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
        totalResults: result.places.length,
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
