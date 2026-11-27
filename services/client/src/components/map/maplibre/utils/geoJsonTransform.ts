import type * as GeoJSON from "geojson";
import { MAP_CONFIG } from "../../config/constants";
import { placeKind } from "../../core/map-places";
import { reviewPinLabel } from "../../places/place-review";
import type {
  ItemType,
  MapFilters,
  PlaceCluster,
  PlaceResult,
} from "../../types";
import { pinImageName as pinName } from "./iconLoader";

// ============================================================================
// Icon name mapping
// ============================================================================

const CATEGORY_ICON_MAP: Record<string, string> = {
  winery: "poi-wine",
  wine_bar: "poi-wine",
  wine_tasting_room: "poi-wine",
  vineyard: "poi-wine",
  wine_shop: "poi-wine",
  wine_wholesaler: "poi-wine",
  brewery: "poi-beer",
  beer_bar: "poi-beer",
  beer_garden: "poi-beer",
  taproom: "poi-beer",
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
  coffee_roaster: "poi-coffee",
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
  izakaya: "poi-restaurant",
  tea_house: "poi-coffee",
  tea_shop: "poi-coffee",
  bubble_tea: "poi-coffee",
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

/** X27: a rejected place is the creator's alone and not "on the map". */
export const REJECTED_PIN_OPACITY = 0.55;

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
  relevance: number;
  opacity: number;
  sortKey: number;
  isCluster: false;
  /** X08: on the viewer's Want to try list — the badged pin, drawn first. */
  wantToTry: boolean;
  rating: number | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  /**
   * X27: the pin's second label line for the creator's own place under
   * review ("Under review" / "Not approved"); null for every shared pin.
   */
  reviewLabel: string | null;
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

/** How far a want-to-go pin's sort key outranks any relevance (0–100). */
export const WANT_TO_TRY_SORT_BOOST = 1000;

/**
 * Main entry point: takes the mixed MapDataItem[] array and splits
 * it into places & clusters before building GeoJSON. `wantToGo` is the
 * viewer's want-to-try place ids (X08): those pins get the bookmark badge
 * and placement priority over their neighbours.
 */
export function transformToGeoJSON(
  items: Array<PlaceResult | PlaceCluster>,
  filters?: MapFilters,
  wantToGo: ReadonlySet<string> = new Set(),
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
  return placesToGeoJSON(places, clusters, filters, wantToGo);
}

function placesToGeoJSON(
  places: PlaceResult[],
  clusters: PlaceCluster[],
  filters: MapFilters | undefined,
  wantToGo: ReadonlySet<string>,
): GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties> {
  const hasFilters =
    !!filters &&
    (filters.selectedItemTypes.length > 0 ||
      filters.searchQuery.length > 0 ||
      (filters.minRating ?? 0) > 0);

  const poiFeatures: GeoJSON.Feature<GeoJSON.Point, POIFeatureProperties>[] =
    places.map((place) => {
      // X27: a creator's own place under review is always drawn at full
      // relevance — it is the one pin they are most likely looking for, and
      // the filters that dim a shared pin say nothing about it — except a
      // rejected one, which is dimmed to read as "not on the map".
      const reviewLabel = reviewPinLabel(place.review_status);
      const relevance =
        reviewLabel === null ? (place.overallRelevance ?? 50) : 100;
      // Map board: a pin takes its place kind's hue (`palette.ts`).
      const colorKey = placeKind(place);
      const iconName = categoryToIcon(place.primary_category);
      const wantToTry = wantToGo.has(place.id);
      const pinImageName = pinName(colorKey, iconName, wantToTry);

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
          relevance,
          // A pin you saved stays fully drawn even when a filter dims its
          // neighbours: it is the one you came to the map to find. A rejected
          // place (X27, creator-only) stays faded whatever else is true.
          opacity:
            place.review_status === "REJECTED"
              ? REJECTED_PIN_OPACITY
              : wantToTry
                ? 1
                : computeOpacity(relevance, hasFilters),
          sortKey: wantToTry ? relevance + WANT_TO_TRY_SORT_BOOST : relevance,
          isCluster: false as const,
          wantToTry,
          rating: place.rating ?? null,
          address: address || null,
          phone: place.phone ?? null,
          website: place.website ?? null,
          reviewLabel,
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
