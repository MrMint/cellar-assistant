import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { adminQuery, serverQuery } from "@/lib/urql/server";
import { CacheTags } from "./tags";

export { CacheTags } from "./tags";

/**
 * Cached search vector generation.
 *
 * Search vectors (embeddings) are user-agnostic - the same search text
 * produces the same embedding for all users. This is expensive to compute
 * (requires API call to embedding service) so we cache it for 24 hours.
 *
 * Uses adminQuery instead of serverQuery because:
 * 1. unstable_cache cannot use cookies() (which serverQuery uses for auth)
 * 2. Search vectors don't require user-specific permissions
 * 3. The underlying action only validates the webhook secret, not user auth
 *
 * Requires HASURA_ADMIN_SECRET environment variable.
 *
 * @param searchText - The search query text
 * @returns JSON stringified vector or undefined if empty/invalid
 */
export const getCachedSearchVector = unstable_cache(
  async (searchText: string): Promise<string | undefined> => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      return undefined;
    }

    const vectorData = await adminQuery(getSearchVectorQuery, {
      text: trimmed,
    });

    if (!vectorData?.create_search_vector) {
      return undefined;
    }

    return JSON.stringify(vectorData.create_search_vector);
  },
  ["search-vector"],
  {
    revalidate: 86400, // 24 hours - embeddings don't change
    tags: [CacheTags.searchVectors],
  },
);

/**
 * Photon geocoder response feature shape.
 */
interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lng, lat]
    type: string;
  };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
    type?: string; // "house", "street", "city", etc.
    osm_type?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

/**
 * Cached geocoding via Photon (komoot's OSM geocoder).
 *
 * Addresses are stable — a 7-day TTL avoids redundant network calls.
 * Like getCachedSearchVector, this is user-agnostic so all users share
 * the same cache entry for a given query string.
 *
 * Returns coordinates + display name for high-confidence address matches,
 * or null if the query doesn't resolve to a specific location.
 */
export const getCachedGeocode = unstable_cache(
  async (
    query: string,
  ): Promise<{
    latitude: number;
    longitude: number;
    displayName: string;
  } | null> => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "CellarAssistant/1.0" },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return null;

      const data: PhotonResponse = await response.json();
      const feature = data.features?.[0];
      if (!feature) return null;

      // Only accept specific-enough results (house, street, or locality)
      const resultType = feature.properties.type;
      const specificTypes = [
        "house",
        "street",
        "locality",
        "district",
        "postcode",
      ];
      if (resultType && !specificTypes.includes(resultType)) return null;

      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties;

      // Build a readable display name
      const parts: string[] = [];
      if (props.housenumber && props.street) {
        parts.push(`${props.housenumber} ${props.street}`);
      } else if (props.street) {
        parts.push(props.street);
      } else if (props.name) {
        parts.push(props.name);
      }
      if (props.city) parts.push(props.city);
      if (props.state) parts.push(props.state);

      return {
        latitude: lat,
        longitude: lng,
        displayName: parts.join(", ") || trimmed,
      };
    } catch {
      return null;
    }
  },
  ["geocode"],
  {
    revalidate: 604800, // 7 days — addresses are stable
    tags: [CacheTags.geocode],
  },
);

/**
 * Reverse geocode address components from coordinates.
 */
interface ReverseGeocodeResult {
  street_address?: string;
  locality?: string;
  region?: string;
  postcode?: string;
  country_code?: string;
}

/**
 * Cached reverse geocoding via Photon (komoot's OSM geocoder).
 *
 * Converts coordinates to address components. Like getCachedGeocode, this
 * is user-agnostic so all users share the same cache entry for a given
 * coordinate pair (rounded to ~11m precision).
 *
 * Uses a 7-day TTL since addresses at a given coordinate are stable.
 */
export const getCachedReverseGeocode = unstable_cache(
  async (
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult | null> => {
    try {
      const url = `https://photon.komoot.io/reverse?lon=${longitude}&lat=${latitude}&limit=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "CellarAssistant/1.0" },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return null;

      const data: PhotonResponse = await response.json();
      const feature = data.features?.[0];
      if (!feature) return null;

      const props = feature.properties;
      return {
        street_address:
          [props.housenumber, props.street].filter(Boolean).join(" ") ||
          undefined,
        locality: props.city ?? undefined,
        region: props.state ?? undefined,
        postcode: props.postcode ?? undefined,
        country_code: props.countrycode?.toUpperCase() ?? undefined,
      };
    } catch {
      return null;
    }
  },
  ["reverse-geocode"],
  {
    revalidate: 604800, // 7 days — addresses are stable
    tags: [CacheTags.reverseGeocode],
  },
);

/**
 * Request-scoped memoization for serverQuery.
 *
 * React's cache() deduplicates function calls within a single render pass.
 * This prevents duplicate GraphQL requests when the same query is called
 * multiple times during a single page render.
 *
 * Note: This only works within a single request - it does NOT persist
 * across requests like unstable_cache does.
 */
export const memoizedServerQuery = cache(serverQuery);
