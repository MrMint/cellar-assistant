import { MAP_CONFIG } from "../../config/constants";
import { ITEM_TYPE_COLORS } from "../../constants/colors";
import type {
  ItemType,
  MapFilters,
  PlaceCluster,
  PlaceResult,
} from "../../types";

// ============================================================================
// Icon name mapping
// ============================================================================

const CATEGORY_ICON_MAP: Record<string, string> = {
  winery: "poi-wine",
  wine_bar: "poi-wine",
  wine_tasting_room: "poi-wine",
  wine_wholesaler: "poi-wine",
  brewery: "poi-beer",
  beer_bar: "poi-beer",
  beer_garden: "poi-beer",
  pub: "poi-beer",
  sports_bar: "poi-beer",
  cocktail_bar: "poi-cocktail",
  bar: "poi-cocktail",
  lounge: "poi-cocktail",
  whiskey_bar: "poi-spirit",
  distillery: "poi-spirit",
  liquor_store: "poi-spirit",
  beer_wine_and_spirits: "poi-spirit",
  cafe: "poi-coffee",
  coffee_shop: "poi-coffee",
  coffee_roastery: "poi-coffee",
  restaurant: "poi-restaurant",
  steakhouse: "poi-restaurant",
  italian_restaurant: "poi-restaurant",
  french_restaurant: "poi-restaurant",
  japanese_restaurant: "poi-restaurant",
  sushi_restaurant: "poi-restaurant",
  mexican_restaurant: "poi-restaurant",
  thai_restaurant: "poi-restaurant",
  chinese_restaurant: "poi-restaurant",
  gastropub: "poi-restaurant",
  tapas_bar: "poi-restaurant",
  grocery_store: "poi-grocery",
  supermarket: "poi-grocery",
  specialty_grocery_store: "poi-grocery",
  organic_grocery_store: "poi-grocery",
  beverage_store: "poi-grocery",
  specialty_store: "poi-grocery",
  hotel: "poi-hotel",
  resort: "poi-hotel",
  casino: "poi-hotel",
  music_venue: "poi-hotel",
  sake_bar: "poi-wine",
};

export function categoryToIcon(primaryCategory: string): string {
  return CATEGORY_ICON_MAP[primaryCategory] ?? "poi-default";
}

// ============================================================================
// Dominant item type
// ============================================================================

export function getDominantItemType(
  itemTypeScores?: Record<ItemType, number>,
): ItemType | undefined {
  if (!itemTypeScores) return undefined;

  let best: ItemType | undefined;
  let bestScore = -1;

  for (const [type, score] of Object.entries(itemTypeScores)) {
    if (score > bestScore) {
      bestScore = score;
      best = type as ItemType;
    }
  }

  return best;
}

// ============================================================================
// Visual property calculations
// ============================================================================

function computeOpacity(relevance: number, hasFilters: boolean): number {
  if (!hasFilters) return 1.0;

  const { MIN_SIZE_PERCENT, MAX_SIZE_PERCENT } = MAP_CONFIG.MARKER;
  const sizePercent =
    MIN_SIZE_PERCENT +
    (relevance / 100) * (MAX_SIZE_PERCENT - MIN_SIZE_PERCENT);

  const { MIN, MAX } = MAP_CONFIG.OPACITY;
  const sizeRange = MAX_SIZE_PERCENT - MIN_SIZE_PERCENT;
  return MIN + ((sizePercent - MIN_SIZE_PERCENT) / sizeRange) * (MAX - MIN);
}

// ============================================================================
// Feature property types
// ============================================================================

export interface POIFeatureProperties {
  id: string;
  name: string;
  primaryCategory: string;
  iconName: string;
  pinImageName: string;
  itemTypeColor: string;
  relevance: number;
  opacity: number;
  sortKey: number;
  isCluster: false;
  rating: number | null;
  address: string | null;
  phone: string | null;
  website: string | null;
}

export interface ClusterFeatureProperties {
  id: string;
  isCluster: true;
  clusterId: number;
  pointCount: number;
  displayCount: string;
  radius: number;
  sortKey: number;
}

export type MapFeatureProperties =
  | POIFeatureProperties
  | ClusterFeatureProperties;

// ============================================================================
// Cluster display count formatting
// ============================================================================

function formatClusterCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

function clusterRadius(count: number): number {
  const base = 12;
  const scale = Math.min(Math.log2(count + 1) * 3, 20);
  return base + scale;
}

// ============================================================================
// GeoJSON transform
// ============================================================================

/**
 * Main entry point: takes the mixed MapDataItem[] array and splits
 * it into places & clusters before building GeoJSON.
 */
export function transformToGeoJSON(
  items: Array<PlaceResult | PlaceCluster>,
  filters?: MapFilters,
): GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties> {
  const places: PlaceResult[] = [];
  const clusters: PlaceCluster[] = [];
  for (const item of items) {
    if ("is_cluster" in item && item.is_cluster) {
      clusters.push(item);
    } else {
      places.push(item as PlaceResult);
    }
  }
  return placesToGeoJSON(places, clusters, filters);
}

function placesToGeoJSON(
  places: PlaceResult[],
  clusters: PlaceCluster[],
  filters?: MapFilters,
): GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties> {
  const hasFilters =
    !!filters &&
    (filters.selectedItemTypes.length > 0 ||
      filters.searchQuery.length > 0 ||
      (filters.minRating ?? 0) > 0);

  const poiFeatures: GeoJSON.Feature<GeoJSON.Point, POIFeatureProperties>[] =
    places.map((place) => {
      const relevance = place.overallRelevance ?? place.relevanceScore ?? 50;
      const dominant = getDominantItemType(place.itemTypeScores);
      const color = dominant
        ? ITEM_TYPE_COLORS[dominant]
        : (ITEM_TYPE_COLORS.wine as string);
      const colorKey = dominant ?? "default";
      const iconName = categoryToIcon(place.primary_category);
      const pinImageName = `pin-${colorKey}-${iconName}`;

      const address = [place.street_address, place.locality, place.region]
        .filter(Boolean)
        .join(", ");

      return {
        type: "Feature" as const,
        id: place.id,
        geometry: {
          type: "Point" as const,
          coordinates: place.location.coordinates,
        },
        properties: {
          id: place.id,
          name: place.name,
          primaryCategory: place.primary_category,
          iconName,
          pinImageName,
          itemTypeColor: color,
          relevance,
          opacity: computeOpacity(relevance, hasFilters),
          sortKey: relevance,
          isCluster: false as const,
          rating: place.rating ?? null,
          address: address || null,
          phone: place.phone ?? null,
          website: place.website ?? null,
        },
      };
    });

  const clusterFeatures: GeoJSON.Feature<
    GeoJSON.Point,
    ClusterFeatureProperties
  >[] = clusters.map((cluster) => ({
    type: "Feature" as const,
    id: `cluster-${cluster.cluster_id}`,
    geometry: {
      type: "Point" as const,
      coordinates: cluster.cluster_center.coordinates,
    },
    properties: {
      id: `cluster-${cluster.cluster_id}`,
      isCluster: true as const,
      clusterId: cluster.cluster_id,
      pointCount: cluster.cluster_count,
      displayCount: formatClusterCount(cluster.cluster_count),
      radius: clusterRadius(cluster.cluster_count),
      sortKey: 200,
    },
  }));

  return {
    type: "FeatureCollection" as const,
    features: [
      ...(poiFeatures as GeoJSON.Feature<
        GeoJSON.Point,
        MapFeatureProperties
      >[]),
      ...(clusterFeatures as GeoJSON.Feature<
        GeoJSON.Point,
        MapFeatureProperties
      >[]),
    ],
  };
}
