/**
 * The new API's shapes → the props the restored `82450ad1` map components
 * take. Pure, so `adapter.test.ts` pins every rule without a network.
 *
 * Inputs are typed structurally (what each function reads) rather than as
 * `ResultOf<…>` chains through result unions, so widening a selection in
 * `queries.ts` moves nothing here.
 */

import {
  calculateItemTypeMatches,
  calculateOverallQuality,
  calculateOverallRelevance,
} from "./config/scoring";
import type {
  GeocodedLocation,
  ItemType,
  MapDataItem,
  MapSearchParams,
  PlaceCluster,
  PlaceResult,
  SemanticPlaceResult,
  VisitStatus,
} from "./types";
import type { PlaceEnrichment, PlaceGooglePhoto } from "./types/places";

type LngLat = { readonly lng: number; readonly lat: number };

// ---------------------------------------------------------------------------
// Map features
// ---------------------------------------------------------------------------

/** What a marker-shaped node may carry (`MapPlace`, `Place`, a search hit). */
export type MarkerNode = {
  readonly id: string;
  readonly name: string;
  readonly categories: readonly string[];
  readonly primaryCategory?: string | null;
  readonly rating?: number | null;
  readonly priceLevel?: number | null;
  readonly confidence?: number | null;
  readonly isVerified?: boolean | null;
  readonly location?: LngLat | null;
  readonly streetAddress?: string | null;
  readonly locality?: string | null;
  readonly region?: string | null;
  readonly postcode?: string | null;
  readonly countryCode?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly hours?: unknown;
};

const orUndefined = <T>(value: T | null | undefined): T | undefined =>
  value ?? undefined;

/**
 * The old `transformPlaceResult`: snake_case, `[lng, lat]` coordinates, and
 * the client-side quality / item-type / relevance scores when the search
 * parameters are known (they size and colour the markers).
 */
export function placeResultFromNode(
  node: MarkerNode,
  searchParams?: MapSearchParams,
): PlaceResult {
  const primary = node.primaryCategory ?? node.categories[0] ?? "unknown";
  const base: PlaceResult = {
    id: node.id,
    name: node.name === "" ? "Unknown Place" : node.name,
    primary_category: primary,
    categories: node.categories.length > 0 ? [...node.categories] : [primary],
    location: {
      coordinates: node.location
        ? [node.location.lng, node.location.lat]
        : [0, 0],
    },
    rating: orUndefined(node.rating),
    price_level: orUndefined(node.priceLevel),
    street_address: orUndefined(node.streetAddress),
    locality: orUndefined(node.locality),
    region: orUndefined(node.region),
    postcode: orUndefined(node.postcode),
    country_code: orUndefined(node.countryCode),
    phone: orUndefined(node.phone),
    website: orUndefined(node.website),
    email: orUndefined(node.email),
    hours: node.hours ?? undefined,
    confidence: orUndefined(node.confidence),
    is_verified: orUndefined(node.isVerified),
  };
  if (!searchParams) return base;
  const overallQuality = calculateOverallQuality(base);
  const itemTypeScores = calculateItemTypeMatches(base);
  const overallRelevance = calculateOverallRelevance(
    searchParams,
    itemTypeScores,
  );
  return { ...base, overallQuality, itemTypeScores, overallRelevance };
}

/** A `mapBrowse` node: `MapPlace` or `MapCluster`, by `__typename`. */
export type MapEntryNode = {
  readonly __typename?: string;
  readonly id?: string;
  readonly name?: string;
  readonly categories?: readonly string[];
  readonly primaryCategory?: string | null;
  readonly rating?: number | null;
  readonly confidence?: number | null;
  readonly isVerified?: boolean | null;
  readonly location?: LngLat | null;
  readonly clusterId?: number;
  readonly count?: number;
  readonly center?: LngLat | null;
};

/**
 * The old `performStandardSearch` mapping. A cluster with no `center` is
 * dropped rather than drawn at the origin; a marker with no location too.
 */
export function mapItemsFromBrowse(
  nodes: readonly MapEntryNode[],
  searchParams: MapSearchParams,
): MapDataItem[] {
  const items: MapDataItem[] = [];
  for (const node of nodes) {
    if (
      node.__typename === "MapPlace" &&
      typeof node.id === "string" &&
      node.location
    ) {
      items.push(
        placeResultFromNode(
          {
            id: node.id,
            name: node.name ?? "",
            categories: node.categories ?? [],
            primaryCategory: node.primaryCategory,
            rating: node.rating,
            confidence: node.confidence,
            isVerified: node.isVerified,
            location: node.location,
          },
          searchParams,
        ),
      );
    } else if (
      node.__typename === "MapCluster" &&
      typeof node.clusterId === "number" &&
      node.center
    ) {
      items.push({
        is_cluster: true,
        cluster_id: node.clusterId,
        cluster_count: node.count ?? 0,
        cluster_center: { coordinates: [node.center.lng, node.center.lat] },
      } satisfies PlaceCluster);
    }
  }
  return items;
}

export type SearchHitNode = MarkerNode & {
  readonly combinedScore?: number | null;
};

/** The old adaptive threshold: weak matches relative to the strongest go. */
const RELATIVE_CUTOFF = 0.33;
const ABSOLUTE_MINIMUM = 5;

/**
 * The old `performSemanticSearch` post-processing, unchanged: confidence from
 * `combined_score`, the adaptive cut-off, the item-type filter, and relevance
 * normalised so the best hit renders at full size.
 */
export function semanticResultsFrom(
  nodes: readonly SearchHitNode[],
  searchParams: MapSearchParams,
): SemanticPlaceResult[] {
  const itemTypes = searchParams.itemTypes ?? [];
  let results: SemanticPlaceResult[] = nodes
    .filter((node) => node.location)
    .map((node) => {
      const combinedScore = node.combinedScore ?? 0;
      const confidenceScore = Math.max(0, Math.min(100, combinedScore * 100));
      return {
        ...placeResultFromNode(node, searchParams),
        overallRelevance: confidenceScore,
        distance: Math.max(0, 2 * (1 - combinedScore)),
        matchReason: "semantic_match" as const,
        confidenceScore,
      };
    });

  const topScore = Math.max(...results.map((r) => r.confidenceScore), 0);
  const threshold = Math.max(topScore * RELATIVE_CUTOFF, ABSOLUTE_MINIMUM);
  results = results.filter((r) => r.confidenceScore >= threshold);

  if (itemTypes.length > 0) {
    results = results.filter((place) =>
      itemTypes.some(
        (itemType: ItemType) => (place.itemTypeScores?.[itemType] ?? 0) > 0,
      ),
    );
  }

  const maxConfidence = Math.max(...results.map((r) => r.confidenceScore), 0);
  if (maxConfidence > 0) {
    results = results.map((place) => ({
      ...place,
      overallRelevance: (place.confidenceScore / maxConfidence) * 100,
    }));
  }
  return results;
}

/**
 * The old `visitStatuses` → `visit_status_filter`. One status only, and
 * "favorites" never reached SQL in the old app (§7) — `VisitStatusFilter` has
 * no FAVORITE (G34), so it filters nothing here either, and the filter UI
 * says so.
 */
export function visitStatusFilterFor(
  statuses: readonly VisitStatus[],
): "VISITED" | "UNVISITED" | null {
  if (statuses.length !== 1) return null;
  if (statuses[0] === "visited") return "VISITED";
  if (statuses[0] === "unvisited") return "UNVISITED";
  return null;
}

/**
 * The old `looksLikeAddress` heuristic: a query that reads like a street
 * address is geocoded before it is searched by meaning.
 */
export function looksLikeAddress(query: string): boolean {
  if (/^\d+\s/.test(query)) return true;
  if (/\b\d{5}(-\d{4})?\b/.test(query)) return true;
  if (/,\s*[A-Za-z]/.test(query) && /\d/.test(query)) return true;
  return false;
}

export function geocodedLocationFrom(
  geocode:
    | {
        readonly latitude: number;
        readonly longitude: number;
        readonly displayName: string;
      }
    | null
    | undefined,
): GeocodedLocation | null {
  if (!geocode) return null;
  return {
    latitude: geocode.latitude,
    longitude: geocode.longitude,
    displayName: geocode.displayName,
  };
}

// ---------------------------------------------------------------------------
// One place
// ---------------------------------------------------------------------------

export type EnrichmentNode = {
  readonly googlePlaceId: string;
  readonly googleName?: string | null;
  readonly googleFormattedAddress?: string | null;
  readonly googleRating?: number | null;
  readonly googleUserRatingsTotal?: number | null;
  readonly googlePriceLevel?: number | null;
  readonly googleWebsite?: string | null;
  readonly googlePhone?: string | null;
  readonly googleOpeningHours?: unknown;
  readonly googleTypes?: readonly string[] | null;
  readonly googleBusinessStatus?: string | null;
  readonly googleEditorialSummary?: string | null;
  readonly attributions?: unknown;
};

/** The old `transformDbEnrichment`. */
export function enrichmentFrom(
  node: EnrichmentNode | null | undefined,
): PlaceEnrichment | null {
  if (!node) return null;
  return {
    googlePlaceId: node.googlePlaceId,
    name: node.googleName ?? "",
    formattedAddress: node.googleFormattedAddress ?? null,
    rating: node.googleRating ?? null,
    userRatingsTotal: node.googleUserRatingsTotal ?? null,
    priceLevel: node.googlePriceLevel ?? null,
    website: node.googleWebsite ?? null,
    phone: node.googlePhone ?? null,
    openingHours: node.googleOpeningHours ?? null,
    types: [...(node.googleTypes ?? [])],
    businessStatus: node.googleBusinessStatus ?? null,
    editorialSummary: node.googleEditorialSummary ?? null,
    attributions: Array.isArray(node.attributions) ? node.attributions : [],
  };
}

export type PhotoNode = {
  readonly id: string;
  readonly displayOrder: number;
  readonly attributions?: unknown;
  readonly file?: { readonly url: string } | null;
};

/** The old `transformDbPhotos`, ordered by `display_order` as before. */
export function photosFrom(nodes: readonly PhotoNode[]): PlaceGooglePhoto[] {
  return [...nodes]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((photo) => ({
      id: photo.id,
      url: photo.file?.url ?? null,
      displayOrder: photo.displayOrder,
      attributions: Array.isArray(photo.attributions) ? photo.attributions : [],
    }));
}

/**
 * Google's attribution blocks as display lines. `attributions` is `JSON` on
 * both `PlaceEnrichment` and `PlacePhoto`: an array of strings, or of objects
 * (`{ displayName, uri }` for a photo author, `{ provider, … }` otherwise).
 * Anything else is skipped rather than set as HTML.
 */
export function attributionLines(attributions: unknown): string[] {
  if (!Array.isArray(attributions)) return [];
  const lines: string[] = [];
  for (const entry of attributions) {
    if (typeof entry === "string") {
      const text = entry.replace(/<[^>]*>/g, "").trim();
      if (text !== "") lines.push(text);
      continue;
    }
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const value =
        record.displayName ?? record.provider ?? record.name ?? record.text;
      if (typeof value === "string" && value.trim() !== "") {
        lines.push(value.trim());
      }
    }
  }
  return Array.from(new Set(lines));
}

export type InteractionNode = {
  readonly id: string;
  readonly isFavorite: boolean;
  readonly isVisited: boolean;
  readonly wantToVisit?: boolean;
  readonly rating?: number | null;
  readonly notes?: string | null;
  readonly tags?: readonly string[];
  readonly visitCount: number;
  readonly lastVisitedAt?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
};

/** The old `user_place_interactions[0]` row. */
export type UserPlaceInteraction = {
  id: string;
  is_favorite: boolean;
  is_visited: boolean;
  want_to_visit: boolean;
  rating: number | null;
  notes: string | null;
  tags: string[];
  last_visited_at: string | null;
  visit_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export function interactionFrom(
  node: InteractionNode | null | undefined,
): UserPlaceInteraction | undefined {
  if (!node) return undefined;
  return {
    id: node.id,
    is_favorite: node.isFavorite,
    is_visited: node.isVisited,
    want_to_visit: node.wantToVisit ?? false,
    rating: node.rating ?? null,
    notes: node.notes ?? null,
    tags: [...(node.tags ?? [])],
    last_visited_at: node.lastVisitedAt ?? null,
    visit_count: node.visitCount,
    created_at: node.createdAt ?? null,
    updated_at: node.updatedAt ?? null,
  };
}

export type MenuLineNode = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly price?: number | null;
  readonly menuCategory?: string | null;
  readonly detectedItemType?: string | null;
  readonly confidenceScore?: number | null;
  readonly isAvailable?: boolean | null;
  readonly createdAt?: string | null;
  readonly extractedAttributes?: unknown;
  readonly matchedItem?: {
    readonly id: string;
    readonly type: string;
    readonly item?: { readonly id: string; readonly name: string } | null;
  } | null;
};

/**
 * The old unmasked `PlaceMenuItem`. The four `wine`/`beer`/`spirit`/`coffee`
 * relations (sake and tea lines could never show a match) collapse into one
 * `matched_item` (G18), with its type for the item link.
 */
export type MenuItemView = {
  id: string;
  menu_item_name: string;
  menu_item_description: string | null;
  menu_item_price: number | null;
  menu_category: string | null;
  detected_item_type: string | null;
  confidence_score: number | null;
  is_available: boolean | null;
  created_at: string | null;
  extracted_attributes: Record<string, unknown> | null;
  matched_item: { id: string; name: string; type: string } | null;
};

/**
 * `extracted_attributes` as the old cards printed it. `search_name` is the
 * pipeline's own matching key (it was always stored there), not a menu fact.
 */
const extractedAttributesFrom = (
  value: unknown,
): Record<string, unknown> | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, v]) => key !== "search_name" && v !== null && v !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

export function menuItemFrom(node: MenuLineNode): MenuItemView {
  const matched = node.matchedItem;
  return {
    id: node.id,
    menu_item_name: node.name,
    menu_item_description: node.description ?? null,
    menu_item_price: node.price ?? null,
    menu_category: node.menuCategory ?? null,
    detected_item_type: node.detectedItemType ?? null,
    confidence_score: node.confidenceScore ?? null,
    is_available: node.isAvailable ?? null,
    created_at: node.createdAt ?? null,
    extracted_attributes: extractedAttributesFrom(node.extractedAttributes),
    matched_item:
      matched?.item != null
        ? {
            id: matched.item.id,
            name: matched.item.name,
            type: matched.type.toLowerCase(),
          }
        : null,
  };
}

/**
 * Where a matched line links. Menu types are lower-case and include
 * `cocktail`/`unknown`, which have no item page.
 */
export function matchedItemHref(item: {
  id: string;
  type: string;
}): string | null {
  const known = ["wine", "beer", "spirit", "coffee", "sake", "tea"];
  return known.includes(item.type) ? `/${item.type}s/${item.id}` : null;
}

export type TierListEntryNode = {
  readonly id: string;
  readonly band: number;
  readonly tierList?: { readonly id: string; readonly name: string } | null;
};

/** `Place.tierListEntries` (G8) → `ItemTierLists`' entries. */
export function tierListEntriesFrom(nodes: readonly TierListEntryNode[]): {
  id: string;
  band: number;
  tier_list: { id: string; name: string } | null;
}[] {
  return nodes.map((node) => ({
    id: node.id,
    band: node.band,
    tier_list: node.tierList
      ? { id: node.tierList.id, name: node.tierList.name }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Create place
// ---------------------------------------------------------------------------

export type DuplicateNode = {
  readonly placeId: string;
  readonly name: string;
  readonly distanceMeters: number;
  readonly similarity: number;
  readonly place?: {
    readonly primaryCategory?: string | null;
    readonly streetAddress?: string | null;
    readonly locality?: string | null;
  } | null;
};

/** The old `DuplicatePlace`. */
export type DuplicatePlace = {
  id: string;
  name: string;
  primary_category: string | null;
  street_address: string | null;
  locality: string | null;
  similarity: number;
  distance_m: number;
};

export function duplicateFrom(node: DuplicateNode): DuplicatePlace {
  return {
    id: node.placeId,
    name: node.name,
    primary_category: node.place?.primaryCategory ?? null,
    street_address: node.place?.streetAddress ?? null,
    locality: node.place?.locality ?? null,
    similarity: node.similarity,
    distance_m: node.distanceMeters,
  };
}

// ---------------------------------------------------------------------------
// Menu scans
// ---------------------------------------------------------------------------

export type ScanStatus = "pending" | "processing" | "completed" | "failed";

/** The old `MenuScanStatus`. */
export type MenuScanStatusView = {
  id: string;
  processing_status: ScanStatus;
  items_detected: number | null;
  items_matched: number | null;
  confidence_score: number | null;
  processing_error: string | null;
  place_id: string | null;
};

export function scanStatusFrom(node: {
  readonly id: string;
  readonly processingStatus: ScanStatus;
  readonly itemsDetected?: number | null;
  readonly itemsMatched?: number | null;
  readonly confidenceScore?: number | null;
  readonly processingError?: string | null;
  readonly placeId?: string | null;
}): MenuScanStatusView {
  return {
    id: node.id,
    processing_status: node.processingStatus,
    items_detected: node.itemsDetected ?? null,
    items_matched: node.itemsMatched ?? null,
    confidence_score: node.confidenceScore ?? null,
    processing_error: node.processingError ?? null,
    place_id: node.placeId ?? null,
  };
}

/** The old `MenuScanSummary`. */
export type MenuScanSummary = {
  id: string;
  processing_status: string;
  processing_error: string | null;
  items_detected: number | null;
  confidence_score: number | null;
  scanned_at: string | null;
  processed_at: string | null;
  place: { id: string; name: string } | null;
};

export function scanSummaryFrom(node: {
  readonly id: string;
  readonly processingStatus: string;
  readonly processingError?: string | null;
  readonly itemsDetected?: number | null;
  readonly confidenceScore?: number | null;
  readonly scannedAt?: string | null;
  readonly processedAt?: string | null;
  readonly place?: { readonly id: string; readonly name: string } | null;
}): MenuScanSummary {
  return {
    id: node.id,
    processing_status: node.processingStatus,
    processing_error: node.processingError ?? null,
    items_detected: node.itemsDetected ?? null,
    confidence_score: node.confidenceScore ?? null,
    scanned_at: node.scannedAt ?? null,
    processed_at: node.processedAt ?? null,
    place: node.place ? { id: node.place.id, name: node.place.name } : null,
  };
}

export type SuggestionNode = {
  readonly id: string;
  readonly menuScanId?: string | null;
  readonly placeMenuItemId: string;
  readonly menuItemName: string;
  readonly confidenceScore: number;
  readonly matchReasoning?: string | null;
  readonly accepted?: boolean | null;
  readonly rejected?: boolean | null;
  readonly createdAt?: string | null;
  readonly suggestedItem?: {
    readonly id: string;
    readonly type: string;
    readonly name: string;
  } | null;
  readonly suggestedRecipe?: {
    readonly id: string;
    readonly name: string;
  } | null;
};

/** A suggestion as the restored cards read it. */
export type SuggestionView = {
  id: string;
  menu_scan_id: string | null;
  place_menu_item_id: string;
  menu_item_name: string;
  confidence_score: number;
  match_reasoning: string | null;
  created_at: string | null;
  pending: boolean;
  /** The suggested item or recipe, with where it lives. */
  suggested: { id: string; name: string; href: string | null } | null;
};

export function suggestionFrom(node: SuggestionNode): SuggestionView {
  const item = node.suggestedItem;
  const recipe = node.suggestedRecipe;
  return {
    id: node.id,
    menu_scan_id: node.menuScanId ?? null,
    place_menu_item_id: node.placeMenuItemId,
    menu_item_name: node.menuItemName,
    confidence_score: node.confidenceScore,
    match_reasoning: node.matchReasoning ?? null,
    created_at: node.createdAt ?? null,
    pending: node.accepted == null && node.rejected == null,
    suggested: item
      ? {
          id: item.id,
          name: item.name,
          href: matchedItemHref({ id: item.id, type: item.type.toLowerCase() }),
        }
      : recipe
        ? { id: recipe.id, name: recipe.name, href: `/recipes/${recipe.id}` }
        : null,
  };
}

/**
 * G21 — the form values a Google listing's details pre-fill, as the old
 * `prefillFromGoogle` set them: name, phone, website, and the editorial summary
 * as the description. An absent field is left out, so it does not clear what
 * the user (or the suggestion) already put there. A phone the form's E.164
 * input would reject is left out too — the old form put Google's national
 * format there, which its own validator then refused.
 */
export function googlePrefillFields(
  details: {
    name: string | null;
    phone: string | null;
    website: string | null;
    editorialSummary: string | null;
  },
  isValidPhone: (phone: string) => boolean,
): { name?: string; phone?: string; website?: string; description?: string } {
  return {
    ...(details.name ? { name: details.name } : {}),
    ...(details.phone && isValidPhone(details.phone)
      ? { phone: details.phone }
      : {}),
    ...(details.website ? { website: details.website } : {}),
    ...(details.editorialSummary
      ? { description: details.editorialSummary }
      : {}),
  };
}
