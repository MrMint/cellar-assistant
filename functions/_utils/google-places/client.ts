/**
 * Google Places API (New) client.
 * Uses GCP service account credentials for OAuth2 authentication
 * and the generic budget utility for cost tracking.
 */

import { GoogleAuth } from "google-auth-library";
import { getGCPCredentials } from "../gcp-credentials";
import { checkBudget, logApiUsage } from "../budget";
import type {
  AutocompleteResponse,
  AutocompletePlaceSuggestion,
  GooglePlaceDetails,
  NearbyPlaceSuggestion,
  NearbySearchResponse,
  PlaceEnrichmentData,
  TextSearchResponse,
} from "./types";
import { API_COSTS_CENTS } from "./types";

// =============================================================================
// Constants
// =============================================================================

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const SERVICE_NAME = "google_places";

/** Place types relevant to our app (food, drink, retail). */
const VENUE_TYPES = [
  "restaurant",
  "bar",
  "wine_bar",
  "pub",
  "cafe",
  "coffee_shop",
  "winery",
  "brewery",
  "brewpub",
  "liquor_store",
];

/** Field mask for Nearby Search — Pro tier (displayName is Pro). */
const NEARBY_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.location",
].join(",");

/** Field mask for Place Details — Enterprise+Atmosphere tier (editorialSummary). */
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "rating",
  "userRatingCount",
  "priceLevel",
  "websiteUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "regularOpeningHours",
  "businessStatus",
  "editorialSummary",
  "photos",
  "googleMapsUri",
].join(",");

/** Field mask for Text Search — Pro tier (displayName is Pro). */
const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.location",
].join(",");

// =============================================================================
// Auth
// =============================================================================

let cachedAuth: GoogleAuth | null = null;

async function getAccessToken(): Promise<string> {
  if (!cachedAuth) {
    const credentials = await getGCPCredentials();
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      projectId: credentials.project_id,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  const client = await cachedAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error("Failed to obtain GCP access token");
  }
  return token;
}

// =============================================================================
// Nearby Search
// =============================================================================

export async function nearbySearch(
  latitude: number,
  longitude: number,
  options?: {
    radiusMeters?: number;
    maxResults?: number;
    triggeredBy?: string;
  },
): Promise<NearbyPlaceSuggestion[] | null> {
  const budget = await checkBudget(
    SERVICE_NAME,
    "nearby_search",
    API_COSTS_CENTS.nearby_search,
  );
  if (!budget.allowed) {
    console.log("[GooglePlaces] Nearby search skipped: budget exceeded");
    return null;
  }

  try {
    const token = await getAccessToken();
    const response = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": NEARBY_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: VENUE_TYPES,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: options?.radiusMeters ?? 200,
          },
        },
        maxResultCount: options?.maxResults ?? 5,
        languageCode: "en",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GooglePlaces] Nearby search failed (${response.status}):`,
        errorText,
      );
      return null;
    }

    const data = (await response.json()) as NearbySearchResponse;

    await logApiUsage({
      service: SERVICE_NAME,
      endpoint: "nearby_search",
      costCents: budget.effectiveCostCents,
      triggeredBy: options?.triggeredBy,
      metadata: { latitude, longitude, resultCount: data.places?.length ?? 0 },
    });

    return (
      data.places?.map((place) => ({
        googlePlaceId: place.id,
        name: place.displayName?.text ?? "Unknown",
        address: place.formattedAddress ?? "",
        types: place.types ?? [],
        location: place.location ?? { latitude: 0, longitude: 0 },
      })) ?? []
    );
  } catch (error) {
    console.error("[GooglePlaces] Nearby search error:", error);
    return null;
  }
}

// =============================================================================
// Autocomplete
// =============================================================================

export async function autocomplete(
  input: string,
  latitude: number,
  longitude: number,
  options?: {
    radiusMeters?: number;
    triggeredBy?: string;
  },
): Promise<AutocompletePlaceSuggestion[] | null> {
  const budget = await checkBudget(
    SERVICE_NAME,
    "autocomplete",
    API_COSTS_CENTS.autocomplete,
  );
  if (!budget.allowed) {
    console.log("[GooglePlaces] Autocomplete skipped: budget exceeded");
    return null;
  }

  try {
    const token = await getAccessToken();
    const response = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: options?.radiusMeters ?? 500,
          },
        },
        includedPrimaryTypes: VENUE_TYPES,
        languageCode: "en",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GooglePlaces] Autocomplete failed (${response.status}):`,
        errorText,
      );
      return null;
    }

    const data = (await response.json()) as AutocompleteResponse;

    await logApiUsage({
      service: SERVICE_NAME,
      endpoint: "autocomplete",
      costCents: budget.effectiveCostCents,
      triggeredBy: options?.triggeredBy,
      metadata: { input, resultCount: data.suggestions?.length ?? 0 },
    });

    return (
      data.suggestions?.flatMap((s) => {
        const prediction = s.placePrediction;
        if (!prediction) return [];
        return [
          {
            googlePlaceId: prediction.placeId,
            name:
              prediction.structuredFormat?.mainText?.text ??
              prediction.text.text,
            secondaryText:
              prediction.structuredFormat?.secondaryText?.text ?? "",
            types: prediction.types ?? [],
          },
        ];
      }) ?? []
    );
  } catch (error) {
    console.error("[GooglePlaces] Autocomplete error:", error);
    return null;
  }
}

// =============================================================================
// Place Details
// =============================================================================

export async function getPlaceDetails(
  googlePlaceId: string,
  options?: {
    triggeredBy?: string;
    entityId?: string;
  },
): Promise<PlaceEnrichmentData | null> {
  const budget = await checkBudget(
    SERVICE_NAME,
    "place_details",
    API_COSTS_CENTS.place_details,
  );
  if (!budget.allowed) {
    console.log("[GooglePlaces] Place details skipped: budget exceeded");
    return null;
  }

  try {
    const token = await getAccessToken();
    const response = await fetch(`${PLACES_API_BASE}/places/${googlePlaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GooglePlaces] Place details failed (${response.status}):`,
        errorText,
      );
      return null;
    }

    const place = (await response.json()) as GooglePlaceDetails;

    await logApiUsage({
      service: SERVICE_NAME,
      endpoint: "place_details",
      costCents: budget.effectiveCostCents,
      entityId: options?.entityId,
      entityType: "place",
      triggeredBy: options?.triggeredBy,
      metadata: { googlePlaceId },
    });

    return mapPlaceToEnrichment(place);
  } catch (error) {
    console.error("[GooglePlaces] Place details error:", error);
    return null;
  }
}

// =============================================================================
// Text Search (for resolving existing places to Google Place IDs)
// =============================================================================

export async function textSearch(
  query: string,
  latitude: number,
  longitude: number,
  options?: {
    triggeredBy?: string;
    entityId?: string;
  },
): Promise<GooglePlaceDetails | null> {
  const budget = await checkBudget(
    SERVICE_NAME,
    "text_search",
    API_COSTS_CENTS.text_search,
  );
  if (!budget.allowed) {
    console.log("[GooglePlaces] Text search skipped: budget exceeded");
    return null;
  }

  try {
    const token = await getAccessToken();
    const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: 500,
          },
        },
        maxResultCount: 1,
        languageCode: "en",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GooglePlaces] Text search failed (${response.status}):`,
        errorText,
      );
      return null;
    }

    const data = (await response.json()) as TextSearchResponse;

    await logApiUsage({
      service: SERVICE_NAME,
      endpoint: "text_search",
      costCents: budget.effectiveCostCents,
      entityId: options?.entityId,
      entityType: "place",
      triggeredBy: options?.triggeredBy,
      metadata: { query, resultCount: data.places?.length ?? 0 },
    });

    return data.places?.[0] ?? null;
  } catch (error) {
    console.error("[GooglePlaces] Text search error:", error);
    return null;
  }
}

// =============================================================================
// Photo Download
// =============================================================================

export async function downloadPhoto(
  photoName: string,
  options?: {
    maxWidthPx?: number;
    maxHeightPx?: number;
    triggeredBy?: string;
    entityId?: string;
  },
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const budget = await checkBudget(
    SERVICE_NAME,
    "photo",
    API_COSTS_CENTS.photo,
  );
  if (!budget.allowed) {
    console.log("[GooglePlaces] Photo download skipped: budget exceeded");
    return null;
  }

  try {
    const token = await getAccessToken();
    const maxWidth = options?.maxWidthPx ?? 800;
    const maxHeight = options?.maxHeightPx ?? 600;
    const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${maxWidth}&maxHeightPx=${maxHeight}&skipHttpRedirect=true`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GooglePlaces] Photo download failed (${response.status}):`,
        errorText,
      );
      return null;
    }

    // When skipHttpRedirect=true, Google returns JSON with photoUri
    const data = (await response.json()) as { photoUri: string };
    const photoResponse = await fetch(data.photoUri);

    if (!photoResponse.ok) {
      console.error(
        `[GooglePlaces] Photo fetch failed (${photoResponse.status})`,
      );
      return null;
    }

    const buffer = Buffer.from(await photoResponse.arrayBuffer());
    const contentType =
      photoResponse.headers.get("content-type") ?? "image/jpeg";

    await logApiUsage({
      service: SERVICE_NAME,
      endpoint: "photo",
      costCents: budget.effectiveCostCents,
      entityId: options?.entityId,
      entityType: "place",
      triggeredBy: options?.triggeredBy,
      metadata: { photoName },
    });

    return { buffer, contentType };
  } catch (error) {
    console.error("[GooglePlaces] Photo download error:", error);
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function parsePriceLevel(priceLevel?: string): number | null {
  if (!priceLevel) return null;
  const mapping: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return mapping[priceLevel] ?? null;
}

function mapPlaceToEnrichment(place: GooglePlaceDetails): PlaceEnrichmentData {
  return {
    googlePlaceId: place.id,
    name: place.displayName?.text ?? "Unknown",
    formattedAddress: place.formattedAddress ?? null,
    rating: place.rating ?? null,
    userRatingsTotal: place.userRatingCount ?? null,
    priceLevel: parsePriceLevel(place.priceLevel),
    website: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    openingHours: place.regularOpeningHours ?? null,
    types: place.types ?? [],
    businessStatus: place.businessStatus ?? null,
    editorialSummary: place.editorialSummary?.text ?? null,
    photoReferences: place.photos ?? [],
    attributions: place.attributions ?? [],
  };
}
