"use server";

import { graphql } from "@cellar-assistant/shared/gql";
import {
  type CountryCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { revalidatePath } from "next/cache";
import { getCachedReverseGeocode } from "@/lib/cache";
import { adminQuery, serverMutation, serverQuery } from "@/lib/urql/server";
import type { PlaceEnrichment, PlaceGooglePhoto } from "@/types/places";
import { getServerUserId } from "@/utilities/auth-server";

// =============================================================================
// Types
// =============================================================================

export interface CreatePlaceInput {
  name: string;
  categories: string[];
  latitude: number;
  longitude: number;
  street_address?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country_code?: string;
  phone?: string;
  website?: string;
  description?: string;
  google_place_id?: string;
}

export interface GoogleNearbyPlace {
  googlePlaceId: string;
  name: string;
  address: string;
  types: string[];
  location: { latitude: number; longitude: number };
}

export interface GoogleAutocompleteSuggestion {
  googlePlaceId: string;
  name: string;
  secondaryText: string;
  types: string[];
}

export interface GoogleEnrichmentResult {
  success: boolean;
  enrichment: PlaceEnrichment | null;
  photos?: PlaceGooglePhoto[];
  cached?: boolean;
  reason?: string;
}

export interface CreatePlaceResult {
  success: boolean;
  placeId?: string;
  error?: string;
  duplicates?: DuplicatePlace[];
}

export interface DuplicatePlace {
  id: string;
  name: string;
  primary_category: string | null;
  street_address: string | null;
  locality: string | null;
  similarity: number;
  distance_m: number;
}

interface AIReviewResult {
  approved: boolean;
  confidence_adjustment: number;
  enriched_description?: string;
  suggested_categories?: string[];
  rejection_reason?: string;
  flags: string[];
}

// =============================================================================
// GraphQL Operations
// =============================================================================

const RATE_LIMIT_CHECK = graphql(`
  query RateLimitCheck($userId: uuid!, $since: timestamptz!) {
    places_aggregate(
      where: {
        created_by: { _eq: $userId }
        created_at: { _gte: $since }
      }
    ) {
      aggregate {
        count
      }
    }
  }
`);

const FIND_DUPLICATE_PLACES = graphql(`
  query FindDuplicatePlaces(
    $name: String!
    $lat: float8!
    $lng: float8!
    $radius: float8!
    $minSimilarity: float8!
    $limit: Int!
  ) {
    findDuplicatePlaces(
      args: {
        place_name: $name
        place_lat: $lat
        place_lng: $lng
        search_radius_m: $radius
        min_similarity: $minSimilarity
        result_limit: $limit
      }
    ) {
      id
      name
      primary_category
      street_address
      locality
      similarity
      distance_m
    }
  }
`);

const GET_PLACE_BY_ID = graphql(`
  query GetPlaceById($id: uuid!) {
    places_by_pk(id: $id) {
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
      is_verified
    }
  }
`);

const REVIEW_USER_PLACE = graphql(`
  mutation ReviewUserPlace($input: ReviewUserPlaceInput!) {
    reviewUserPlace(input: $input) {
      approved
      confidence_adjustment
      enriched_description
      suggested_categories
      rejection_reason
      flags
    }
  }
`);

const INSERT_PLACE = graphql(`
  mutation InsertPlace($object: places_insert_input!) {
    insert_places_one(object: $object) {
      id
      name
      primary_category
    }
  }
`);

const WEBSITE_PROTOCOL_RE = /^https?:\/\//i;
const WEBSITE_MAX_LENGTH = 2048;

function normalizeCountryCode(value?: string): CountryCode | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!normalized) return null;
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  if (!isSupportedCountry(normalized as CountryCode)) return null;
  return normalized as CountryCode;
}

function normalizeWebsite(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > WEBSITE_MAX_LENGTH) return null;

  const candidate = WEBSITE_PROTOCOL_RE.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname.includes(".")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Reverse geocode coordinates to address components.
 */
export async function reverseGeocodeAction(
  latitude: number,
  longitude: number,
) {
  await getServerUserId(); // Auth check
  return getCachedReverseGeocode(latitude, longitude);
}

/**
 * Check for duplicate places near a location with a similar name.
 * Called during form entry (debounced on name input).
 */
export async function checkDuplicatePlacesAction(
  name: string,
  latitude: number,
  longitude: number,
): Promise<{ duplicates: DuplicatePlace[] }> {
  await getServerUserId(); // Auth check

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { duplicates: [] };
  }

  try {
    const data = await adminQuery(FIND_DUPLICATE_PLACES, {
      name: trimmed,
      lat: latitude,
      lng: longitude,
      radius: 200,
      minSimilarity: 0.3,
      limit: 5,
    });

    const duplicates: DuplicatePlace[] =
      data.findDuplicatePlaces
        ?.filter(
          (
            d,
          ): d is typeof d & {
            id: string;
            name: string;
            similarity: number;
            distance_m: number;
          } =>
            d.id != null &&
            d.name != null &&
            d.similarity != null &&
            d.distance_m != null,
        )
        .map((d) => ({
          id: d.id,
          name: d.name,
          primary_category: d.primary_category ?? null,
          street_address: d.street_address ?? null,
          locality: d.locality ?? null,
          similarity: d.similarity,
          distance_m: d.distance_m,
        })) ?? [];

    return { duplicates };
  } catch (error) {
    console.error("Duplicate check failed:", error);
    return { duplicates: [] };
  }
}

/**
 * Call the AI review via Hasura action (type-safe GraphQL).
 * Returns null on failure (graceful degradation).
 */
async function callAIReview(
  input: CreatePlaceInput,
): Promise<AIReviewResult | null> {
  try {
    const data = await serverMutation(REVIEW_USER_PLACE, {
      input: {
        name: input.name,
        categories: input.categories,
        latitude: input.latitude,
        longitude: input.longitude,
        street_address: input.street_address,
        locality: input.locality,
        region: input.region,
        country_code: input.country_code,
        phone: input.phone,
        website: input.website,
        description: input.description,
      },
    });

    const review = data.reviewUserPlace;
    if (!review) return null;

    return {
      approved: review.approved,
      confidence_adjustment: review.confidence_adjustment,
      enriched_description: review.enriched_description ?? undefined,
      suggested_categories: review.suggested_categories ?? undefined,
      rejection_reason: review.rejection_reason ?? undefined,
      flags: review.flags ?? [],
    };
  } catch (error) {
    console.error("AI review failed:", error);
    return null;
  }
}

/**
 * Fetch a single place by ID for deep-linking (e.g. after creating a place).
 * Returns a PlaceResult-compatible object or null if not found.
 */
export async function fetchPlaceByIdAction(placeId: string) {
  await getServerUserId(); // Auth check

  try {
    const data = await serverQuery(GET_PLACE_BY_ID, { id: placeId });
    const place = data.places_by_pk;
    if (!place) return null;

    // Parse location coordinates
    let coordinates: [number, number] = [0, 0];
    const loc = place.location as
      | { coordinates: [number, number] }
      | string
      | null;
    if (
      loc &&
      typeof loc === "object" &&
      "coordinates" in loc &&
      Array.isArray(loc.coordinates)
    ) {
      coordinates = loc.coordinates;
    } else if (typeof loc === "string") {
      try {
        const parsed = JSON.parse(loc);
        if (parsed.coordinates && Array.isArray(parsed.coordinates)) {
          coordinates = parsed.coordinates;
        }
      } catch {
        // Ignore parse errors
      }
    }

    return {
      id: place.id,
      name: place.name,
      primary_category: place.primary_category ?? "unknown",
      categories: Array.isArray(place.categories)
        ? place.categories
        : [place.primary_category ?? "unknown"],
      location: { coordinates },
      rating: place.rating ?? undefined,
      price_level: place.price_level ?? undefined,
      street_address: place.street_address ?? undefined,
      locality: place.locality ?? undefined,
      region: place.region ?? undefined,
      postcode: place.postcode ?? undefined,
      country_code: (place.country_code as string) ?? undefined,
      phone: place.phone ?? undefined,
      website: place.website ?? undefined,
      email: place.email ?? undefined,
      hours: place.hours,
      confidence: place.confidence ?? undefined,
      is_verified: place.is_verified ?? undefined,
    };
  } catch (error) {
    console.error("Failed to fetch place:", error);
    return null;
  }
}

// =============================================================================
// Google Places GraphQL Mutations (Hasura Actions)
// =============================================================================

const GOOGLE_NEARBY_SEARCH = graphql(`
  mutation GoogleNearbySearch($input: GoogleNearbySearchInput!) {
    google_nearby_search(input: $input) {
      success
      budgetExhausted
      places {
        googlePlaceId
        name
        address
        types
        latitude
        longitude
      }
    }
  }
`);

const GOOGLE_AUTOCOMPLETE = graphql(`
  mutation GoogleAutocomplete($input: GoogleAutocompleteInput!) {
    google_autocomplete(input: $input) {
      success
      budgetExhausted
      suggestions {
        googlePlaceId
        name
        secondaryText
        types
      }
    }
  }
`);

const ENRICH_PLACE_FROM_GOOGLE = graphql(`
  mutation EnrichPlaceFromGoogle($input: EnrichPlaceFromGoogleInput!) {
    enrich_place_from_google(input: $input) {
      success
      cached
      reason
      enrichment {
        googlePlaceId
        name
        formattedAddress
        rating
        userRatingsTotal
        priceLevel
        website
        phone
        openingHours
        types
        businessStatus
        editorialSummary
        photoReferences
        attributions
      }
      photos {
        id
        storageFileId
        displayOrder
      }
    }
  }
`);

// =============================================================================
// Google Places Server Actions
// =============================================================================

/**
 * Search for nearby Google Places around coordinates.
 * Called on create-place page load (parallel with reverse geocode).
 */
export async function googleNearbySearchAction(
  latitude: number,
  longitude: number,
): Promise<{
  places: GoogleNearbyPlace[];
  budgetExhausted: boolean;
}> {
  await getServerUserId();

  try {
    const data = await serverMutation(GOOGLE_NEARBY_SEARCH, {
      input: { latitude, longitude },
    });

    const result = data.google_nearby_search;
    return {
      places:
        result?.places?.map((p) => ({
          googlePlaceId: p.googlePlaceId,
          name: p.name,
          address: p.address,
          types: [...p.types],
          location: { latitude: p.latitude, longitude: p.longitude },
        })) ?? [],
      budgetExhausted: result?.budgetExhausted ?? false,
    };
  } catch (error) {
    console.error("Google nearby search failed:", error);
    return { places: [], budgetExhausted: false };
  }
}

/**
 * Google Places Autocomplete. Called as user types in the name field (debounced).
 */
export async function googleAutocompleteAction(
  input: string,
  latitude: number,
  longitude: number,
): Promise<{
  suggestions: GoogleAutocompleteSuggestion[];
  budgetExhausted: boolean;
}> {
  await getServerUserId();

  try {
    const data = await serverMutation(GOOGLE_AUTOCOMPLETE, {
      input: { input, latitude, longitude },
    });

    const result = data.google_autocomplete;
    return {
      suggestions:
        result?.suggestions?.map((s) => ({
          googlePlaceId: s.googlePlaceId,
          name: s.name,
          secondaryText: s.secondaryText,
          types: [...s.types],
        })) ?? [],
      budgetExhausted: result?.budgetExhausted ?? false,
    };
  } catch (error) {
    console.error("Google autocomplete failed:", error);
    return { suggestions: [], budgetExhausted: false };
  }
}

/**
 * Enrich a place with Google Place Details.
 * Can be called with either a placeId (existing place) or googlePlaceId (new place).
 */
export async function enrichPlaceAction(params: {
  placeId?: string;
  googlePlaceId?: string;
}): Promise<GoogleEnrichmentResult> {
  await getServerUserId();

  try {
    const data = await serverMutation(ENRICH_PLACE_FROM_GOOGLE, {
      input: {
        placeId: params.placeId,
        googlePlaceId: params.googlePlaceId,
      },
    });

    const result = data.enrich_place_from_google;
    if (!result) {
      return { success: false, enrichment: null, reason: "No response" };
    }

    return {
      success: result.success,
      enrichment: result.enrichment
        ? {
            googlePlaceId: result.enrichment.googlePlaceId,
            name: result.enrichment.name,
            formattedAddress: result.enrichment.formattedAddress ?? null,
            rating: result.enrichment.rating ?? null,
            userRatingsTotal: result.enrichment.userRatingsTotal ?? null,
            priceLevel: result.enrichment.priceLevel ?? null,
            website: result.enrichment.website ?? null,
            phone: result.enrichment.phone ?? null,
            openingHours: result.enrichment.openingHours,
            types: [...(result.enrichment.types ?? [])],
            businessStatus: result.enrichment.businessStatus ?? null,
            editorialSummary: result.enrichment.editorialSummary ?? null,
            photoReferences: result.enrichment.photoReferences as unknown[],
            attributions: result.enrichment.attributions as unknown[],
          }
        : null,
      photos:
        result.photos?.map((p) => ({
          id: p.id,
          storageFileId: p.storageFileId,
          displayOrder: p.displayOrder,
        })) ?? [],
      cached: result.cached ?? undefined,
      reason: result.reason ?? undefined,
    };
  } catch (error) {
    console.error("Enrich place failed:", error);
    return { success: false, enrichment: null, reason: "Mutation failed" };
  }
}

/**
 * Create a user-submitted place with full data quality pipeline:
 * 1. Auth + rate limit check
 * 2. Server-side duplicate re-check
 * 3. AI review (optional, graceful degradation)
 * 4. Insert place
 * 5. Revalidate map cache
 */
export async function createUserPlaceAction(
  input: CreatePlaceInput,
): Promise<CreatePlaceResult> {
  const userId = await getServerUserId();

  // 0. Input validation
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 200) {
    return {
      success: false,
      error: "Place name must be between 2 and 200 characters.",
    };
  }
  if (input.description && input.description.length > 1000) {
    return {
      success: false,
      error: "Description must be under 1000 characters.",
    };
  }
  if (input.categories.length === 0) {
    return { success: false, error: "At least one category is required." };
  }

  const trimmedCountryCode = input.country_code?.trim() ?? "";
  const countryCode = normalizeCountryCode(input.country_code);
  if (trimmedCountryCode && !countryCode) {
    return {
      success: false,
      error: "Country code must be a valid 2-letter code.",
    };
  }

  const trimmedPhone = input.phone?.trim() ?? "";
  let phone: string | null = null;
  if (trimmedPhone) {
    const parsedPhone = parsePhoneNumberFromString(
      trimmedPhone,
      countryCode ?? undefined,
    );
    if (!parsedPhone || !parsedPhone.isValid()) {
      return { success: false, error: "Enter a valid phone number." };
    }
    phone = parsedPhone.number;
  }

  const trimmedWebsite = input.website?.trim() ?? "";
  const website = normalizeWebsite(input.website);
  if (trimmedWebsite && !website) {
    return { success: false, error: "Enter a valid website URL." };
  }

  const normalizedInput: CreatePlaceInput = {
    ...input,
    name: trimmedName,
    country_code: countryCode ?? undefined,
    phone: phone ?? undefined,
    website: website ?? undefined,
  };

  // 1. Rate limit: max 25 places per 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const rateLimitData = await serverQuery(RATE_LIMIT_CHECK, {
      userId,
      since,
    });
    const count = rateLimitData.places_aggregate?.aggregate?.count ?? 0;
    if (count >= 25) {
      return {
        success: false,
        error:
          "You can add up to 25 places per day. Please try again tomorrow.",
      };
    }
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Allow creation if rate limit check fails
  }

  // 2. Server-side duplicate re-check (stricter than client-side)
  try {
    const { duplicates } = await checkDuplicatePlacesAction(
      normalizedInput.name,
      normalizedInput.latitude,
      normalizedInput.longitude,
    );
    const highMatch = duplicates.find(
      (d) => d.similarity > 0.7 && d.distance_m < 50,
    );
    if (highMatch) {
      return {
        success: false,
        error: `A very similar place "${highMatch.name}" already exists nearby.`,
        duplicates,
      };
    }
  } catch (error) {
    console.error("Server-side duplicate check failed:", error);
    // Allow creation if duplicate check fails
  }

  // 3. AI review (optional, graceful degradation)
  let confidence = 0.5;
  let description = normalizedInput.description;
  const aiReview = await callAIReview(normalizedInput);

  if (aiReview) {
    if (!aiReview.approved) {
      return {
        success: false,
        error:
          aiReview.rejection_reason ??
          "This place submission was not approved. Please check the details and try again.",
      };
    }
    confidence = Math.max(
      0.1,
      Math.min(0.9, 0.5 + aiReview.confidence_adjustment),
    );
    if (aiReview.enriched_description && !description) {
      description = aiReview.enriched_description;
    }
  }

  // 4. Insert place
  try {
    const location = {
      type: "Point" as const,
      coordinates: [normalizedInput.longitude, normalizedInput.latitude],
    };

    const result = await serverMutation(INSERT_PLACE, {
      object: {
        name: trimmedName,
        categories: normalizedInput.categories,
        location,
        street_address: normalizedInput.street_address?.trim() || null,
        locality: normalizedInput.locality?.trim() || null,
        region: normalizedInput.region?.trim() || null,
        postcode: normalizedInput.postcode?.trim() || null,
        country_code: countryCode,
        phone,
        website,
        description: description?.trim() || null,
        confidence,
        google_place_id: normalizedInput.google_place_id ?? null,
      },
    });

    const placeId = result.insert_places_one?.id;
    if (!placeId) {
      return { success: false, error: "Failed to create place." };
    }

    // 5. Revalidate map data
    revalidatePath("/map");

    return { success: true, placeId };
  } catch (error) {
    console.error("Place insertion failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create place.",
    };
  }
}

// =============================================================================
// Batch Place Summaries (for Nearby Places cards)
// =============================================================================

const BATCH_PLACE_SUMMARIES = graphql(`
  query BatchPlaceSummaries($placeIds: [uuid!]!) {
    place_google_enrichments(where: { place_id: { _in: $placeIds } }) {
      place_id
      google_opening_hours
      google_price_level
      google_rating
      google_user_ratings_total
    }
    place_google_photos(
      where: { place_id: { _in: $placeIds }, storage_file_id: { _is_null: false } }
      order_by: [{ place_id: asc }, { display_order: asc }]
      distinct_on: place_id
    ) {
      place_id
      storage_file_id
    }
  }
`);

export interface PlaceSummary {
  photoFileId?: string;
  openingHours?: unknown;
  priceLevel?: number | null;
  rating?: number | null;
  userRatingsTotal?: number | null;
}

/**
 * Batch-fetch cached enrichment data and first photo for a set of place IDs.
 * Reads from the database only — no Google API calls.
 */
export async function getPlaceSummaries(
  placeIds: string[],
): Promise<Record<string, PlaceSummary>> {
  await getServerUserId();

  if (placeIds.length === 0) return {};

  try {
    const data = await serverQuery(BATCH_PLACE_SUMMARIES, { placeIds });

    const result: Record<string, PlaceSummary> = {};

    // Index enrichments by place_id
    for (const e of data.place_google_enrichments) {
      result[e.place_id] = {
        openingHours: e.google_opening_hours,
        priceLevel: e.google_price_level,
        rating: e.google_rating,
        userRatingsTotal: e.google_user_ratings_total,
      };
    }

    // Add first photo per place
    for (const p of data.place_google_photos) {
      if (!result[p.place_id]) result[p.place_id] = {};
      result[p.place_id].photoFileId = p.storage_file_id ?? undefined;
    }

    return result;
  } catch (error) {
    console.error("Batch place summaries failed:", error);
    return {};
  }
}
