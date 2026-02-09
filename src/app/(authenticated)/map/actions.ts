"use server";

import type { ResultOf } from "@cellar-assistant/shared";
import { graphql } from "@cellar-assistant/shared/gql";
import {
  calculateItemTypeMatches,
  calculateOverallQuality,
  calculateOverallRelevance,
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
import { getCachedGeocode, getCachedSearchVector } from "@/lib/cache";
import { adminQuery, serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

// UUID v4 regex for validating tier list IDs from URL params
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format a validated string array as a PostgreSQL array literal, or null. */
function toPgArray(
  values: string[] | undefined,
  validate?: RegExp,
): string | null {
  if (!values || values.length === 0) return null;
  const safe = validate ? values.filter((v) => validate.test(v)) : values;
  if (safe.length === 0) return null;
  return `{${safe.join(",")}}`;
}

/**
 * Heuristic: does the query look like a street address?
 * If true, we try geocoding before falling back to semantic search.
 */
function looksLikeAddress(query: string): boolean {
  // Starts with a number (e.g., "123 Main St", "2136 N High St")
  if (/^\d+\s/.test(query)) return true;
  // Contains a US zip code
  if (/\b\d{5}(-\d{4})?\b/.test(query)) return true;
  // Number + comma pattern (e.g., "Elm St 42, Berlin")
  if (/,\s*[A-Za-z]/.test(query) && /\d/.test(query)) return true;
  return false;
}

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
    $tierListIds: _uuid
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
        tier_list_ids: $tierListIds
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
    $tierListIds: _uuid
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
        tier_list_ids: $tierListIds
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

// Derived element types from the GraphQL queries (via gql.tada)
type ClusteredItem = NonNullable<
  ResultOf<typeof SearchPlacesClusteredQuery>["searchPlacesAdaptiveCluster"]
>[number];
type HybridItem = NonNullable<
  ResultOf<typeof HybridPlaceSearchQuery>["searchPlacesHybrid"]
>[number];

// Transform raw query results to our standard format with relevance calculation
function transformPlaceResult(
  item: ClusteredItem | HybridItem,
  searchParams?: MapSearchParams,
): PlaceResult {
  // Parse location coordinates from native PostGIS geometry object
  // NOTE: The searchPlacesAdaptiveCluster PostgreSQL function returns native PostGIS geometry types
  // instead of JSON strings, eliminating the need for client-side JSON parsing.
  // PostGIS geography/geometry types are returned by GraphQL as objects with coordinates property.
  let coordinates: [number, number] = [0, 0];
  const loc = item.location as
    | { coordinates: [number, number] }
    | string
    | null;
  if (loc && typeof loc === "object" && "coordinates" in loc && Array.isArray(loc.coordinates)) {
    // Native PostGIS geometry object with coordinates array
    coordinates = loc.coordinates;
  } else if (typeof loc === "string") {
    try {
      // Fallback: parse JSON string for backward compatibility (legacy function)
      const locationData = JSON.parse(loc);
      if (locationData.coordinates && Array.isArray(locationData.coordinates)) {
        coordinates = locationData.coordinates;
      }
    } catch (error) {
      console.error(
        `Failed to parse location for ${item.name}:`,
        loc,
        error,
      );
      // Fallback: try to parse as POINT string format
      const match = loc.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(" ").map(Number);
        coordinates = [lng, lat];
      }
    }
  }

  // Calculate scoring when search params are provided
  const scoring = searchParams
    ? (() => {
        const overallQuality = calculateOverallQuality(item);
        const itemTypeScores = calculateItemTypeMatches(item);
        const overallRelevance = calculateOverallRelevance(
          searchParams,
          itemTypeScores,
        );
        return { overallQuality, itemTypeScores, overallRelevance };
      })()
    : undefined;

  return {
    id: item.id ?? "",
    name: item.name ?? "Unknown Place",
    primary_category: item.primary_category ?? "unknown",
    categories: Array.isArray(item.categories)
      ? item.categories
      : [item.primary_category ?? "unknown"],
    location: { coordinates },
    rating: item.rating ?? undefined,
    price_level: item.price_level ?? undefined,
    street_address: item.street_address ?? undefined,
    locality: item.locality ?? undefined,
    region: item.region ?? undefined,
    postcode: item.postcode ?? undefined,
    country_code: (item.country_code as string) ?? undefined,
    phone: item.phone ?? undefined,
    website: item.website ?? undefined,
    email: item.email ?? undefined,
    hours: item.hours,
    confidence: item.confidence ?? undefined,
    is_verified: item.is_verified ?? undefined,
    viewport_area_km2: "viewport_area_km2" in item ? (item.viewport_area_km2 ?? undefined) : undefined,
    density_per_km2: "density_per_km2" in item ? (item.density_per_km2 ?? undefined) : undefined,
    clustering_applied: "clustering_applied" in item ? (item.clustering_applied ?? undefined) : undefined,
    ...scoring,
  };
}

function transformClusterResult(item: ClusteredItem): PlaceCluster {
  // Parse cluster center coordinates from native PostGIS geometry object
  let clusterCoordinates: [number, number] = [0, 0];
  const center = item.cluster_center as
    | { coordinates: [number, number] }
    | string
    | null;

  if (center && typeof center === "object" && "coordinates" in center && Array.isArray(center.coordinates)) {
    clusterCoordinates = center.coordinates;
  } else if (typeof center === "string") {
    try {
      const locationData = JSON.parse(center);
      if (locationData.coordinates && Array.isArray(locationData.coordinates)) {
        clusterCoordinates = locationData.coordinates;
      }
    } catch (error) {
      console.error(
        `Failed to parse cluster_center for cluster ${item.cluster_id}:`,
        center,
        error,
      );
      const match = center.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(" ").map(Number);
        clusterCoordinates = [lng, lat];
      }
    }
  }

  return {
    is_cluster: true,
    cluster_id: item.cluster_id ?? 0,
    cluster_count: item.cluster_count ?? 0,
    cluster_center: { coordinates: clusterCoordinates },
    cluster_bounds: item.cluster_bounds,
    viewport_area_km2: item.viewport_area_km2 ?? undefined,
    density_per_km2: item.density_per_km2 ?? undefined,
    clustering_applied: item.clustering_applied ?? undefined,
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
    tierListIds,
    semanticQuery,
    globalSearch = true,
    limit = 500,
  } = params;

  const trimmedQuery = semanticQuery?.trim();

  // Try geocoding first if the query looks like an address.
  // On success, return coordinates so the client can fly the map there
  // and let the standard bounded search fill in nearby places.
  // Wrapped in its own try/catch so geocode failures fall through gracefully.
  if (trimmedQuery && looksLikeAddress(trimmedQuery)) {
    try {
      const geocode = await getCachedGeocode(trimmedQuery);
      if (geocode) {
        return {
          places: [],
          mapItems: [],
          isSemanticSearch: false,
          geocodeResult: geocode,
          searchMetadata: {
            itemTypes,
            totalResults: 0,
            hasMore: false,
          },
        };
      }
    } catch (err) {
      console.warn("Geocode failed, falling through to semantic search:", err);
    }
  }

  // Handle semantic search with optional filters
  // Cap semantic search at 50 results — hybrid ranked results are already
  // sorted by combined_score so pulling more adds noise, not signal.
  if (trimmedQuery && trimmedQuery.length > 0) {
    return await performSemanticSearch(
      trimmedQuery,
      globalSearch ? undefined : bounds,
      itemTypes,
      minRating,
      visitStatuses,
      Math.min(limit, 50),
      tierListIds,
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
    tierListIds,
  );
}

// Perform hybrid search using text + trigram + category semantic matching
// Calls Hasura directly instead of routing through a Nhost function
async function performSemanticSearch(
  query: string,
  bounds: MapBounds | undefined,
  itemTypes: ItemType[],
  minRating: number | undefined,
  _visitStatuses: VisitStatus[],
  limit: number,
  tierListIds?: string[],
): Promise<MapSearchResults> {
  // Step 1: Generate query vector via Next.js cache (24h TTL, shared across users)
  const cachedVector = await getCachedSearchVector(query);
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
    searchQuery: query,
    matchedCategories:
      matchedCategories.length > 0
        ? `{${matchedCategories.join(",")}}`
        : null,
    categoryScores:
      categoryScores.length > 0 ? `{${categoryScores.join(",")}}` : null,
    westBound: bounds?.west ?? null,
    southBound: bounds?.south ?? null,
    eastBound: bounds?.east ?? null,
    northBound: bounds?.north ?? null,
    minRating: minRating ?? null,
    resultLimit: limit,
    tierListIds: toPgArray(tierListIds, UUID_RE),
  });

  const rawResults = hybridResult?.searchPlacesHybrid ?? [];

  // Step 4: Transform results
  const searchParams: MapSearchParams = {
    bounds: bounds ?? { north: 0, south: 0, east: 0, west: 0 },
    itemTypes,
    minRating,
    semanticQuery: query,
  };

  let semanticResults: SemanticPlaceResult[] = rawResults.map((place) => {
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
  });

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
}

// Perform standard GraphQL clustering search
async function performStandardSearch(
  bounds: MapBounds,
  itemTypes: ItemType[],
  minRating: number | undefined,
  visitStatuses: VisitStatus[],
  userId: string,
  limit: number,
  tierListIds?: string[],
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
    categoryFilter: toPgArray(categories),
    minRating: minRating ?? null,
    visitStatusFilter,
    filterUserId: userId,
    resultLimit: limit,
    tierListIds: toPgArray(tierListIds, UUID_RE),
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
  const mapItems: MapDataItem[] = clusteringResults.map((item) => {
    if (item.is_cluster) {
      return transformClusterResult(item);
    }
    return transformPlaceResult(item, searchParams);
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
