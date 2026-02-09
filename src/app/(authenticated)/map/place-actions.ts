"use server";

import { graphql } from "@cellar-assistant/shared/gql";
import { revalidatePath } from "next/cache";
import { getCachedReverseGeocode } from "@/lib/cache";
import { adminQuery, serverMutation, serverQuery } from "@/lib/urql/server";
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
        ?.filter((d): d is typeof d & { id: string; name: string; similarity: number; distance_m: number } =>
          d.id != null && d.name != null && d.similarity != null && d.distance_m != null
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
    if (loc && typeof loc === "object" && "coordinates" in loc && Array.isArray(loc.coordinates)) {
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
    return { success: false, error: "Place name must be between 2 and 200 characters." };
  }
  if (input.description && input.description.length > 1000) {
    return { success: false, error: "Description must be under 1000 characters." };
  }
  if (input.categories.length === 0) {
    return { success: false, error: "At least one category is required." };
  }

  // Normalize website URL
  let website = input.website?.trim() || null;
  if (website && !/^https?:\/\//i.test(website)) {
    website = `https://${website}`;
  }

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
        error: "You can add up to 25 places per day. Please try again tomorrow.",
      };
    }
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Allow creation if rate limit check fails
  }

  // 2. Server-side duplicate re-check (stricter than client-side)
  try {
    const { duplicates } = await checkDuplicatePlacesAction(
      input.name,
      input.latitude,
      input.longitude,
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
  let description = input.description;
  const aiReview = await callAIReview(input);

  if (aiReview) {
    if (!aiReview.approved) {
      return {
        success: false,
        error:
          aiReview.rejection_reason ??
          "This place submission was not approved. Please check the details and try again.",
      };
    }
    confidence = Math.max(0.1, Math.min(0.9, 0.5 + aiReview.confidence_adjustment));
    if (aiReview.enriched_description && !description) {
      description = aiReview.enriched_description;
    }
  }

  // 4. Insert place
  try {
    const location = {
      type: "Point" as const,
      coordinates: [input.longitude, input.latitude],
    };

    const result = await serverMutation(INSERT_PLACE, {
      object: {
        name: trimmedName,
        categories: input.categories,
        location,
        street_address: input.street_address?.trim() || null,
        locality: input.locality?.trim() || null,
        region: input.region?.trim() || null,
        postcode: input.postcode?.trim() || null,
        country_code: input.country_code?.trim() || null,
        phone: input.phone?.trim() || null,
        website,
        description: description?.trim() || null,
        confidence,
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
