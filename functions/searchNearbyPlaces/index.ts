import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { functionQuery, getAdminAuthHeaders } from "../_utils/urql-client";
import { isSearchNearbyPlacesInput, validateFunctionInput } from "./_types";

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export default async (req: Request, res: Response) => {
  // Validate authentication
  if (!validateAuth(req)) {
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  // Declare variables at function scope for error handling
  let latitude = 0;
  let longitude = 0;
  let radius = 0;
  let categories: string[] = [];

  try {
    // Use centralized validation
    const input = validateFunctionInput(
      req.body,
      isSearchNearbyPlacesInput,
      "searchNearbyPlaces",
    );

    // Assign validated values
    latitude = input.latitude;
    longitude = input.longitude;
    radius = input.radius;
    categories = input.categories;
    const { limit } = input;

    // Build category filter - default to Tier 1 if none specified
    const searchCategories =
      categories?.length > 0
        ? categories
        : [
            "restaurant",
            "bar",
            "cafe",
            "coffee_shop",
            "liquor_store",
            "winery",
            "brewery",
            "cocktail_bar",
            "wine_bar",
            "distillery",
          ];

    // Use official Hasura PostGIS syntax from the documentation
    const userLocation = { type: "Point", coordinates: [longitude, latitude] };

    const SEARCH_PLACES = graphql(`
      query SearchPlaces($location: geography!, $distance: Float!, $categories: [String!]!, $limit: Int!) {
        places(
          where: {
            _and: [
              { location: { _st_d_within: { distance: $distance, from: $location } } }
              { primary_category: { _in: $categories } }
              { confidence: { _gte: 0.5 } }
              { is_active: { _eq: true } }
            ]
          }
          order_by: [
            { confidence: desc }
          ]
          limit: $limit
        ) {
          id
          overture_id
          name
          display_name
          primary_category
          categories
          confidence
          location
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
        }
      }
    `);

    const data = await functionQuery(
      SEARCH_PLACES,
      {
        location: userLocation,
        distance: radius,
        categories: searchCategories,
        limit,
      },
      { headers: getAdminAuthHeaders() },
    );

    const nearbyPlaces = data?.places || [];

    // Transform places to match frontend expectations
    const transformedPlaces = nearbyPlaces.map((place: any) => {
      // Parse location coordinates from PostGIS POINT format
      // Location is stored as POINT(lng, lat) in database
      let coordinates = [0, 0]; // Default fallback

      if (place.location && typeof place.location === "string") {
        // Parse "POINT(lng lat)" format
        const match = place.location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lng, lat] = match[1].split(" ").map(Number);
          coordinates = [lng, lat];
        }
      } else if (place.location?.coordinates) {
        coordinates = place.location.coordinates;
      }

      // Calculate distance from user location
      const [placeLng, placeLat] = coordinates;
      const distance_meters = calculateDistance(
        latitude,
        longitude,
        placeLat,
        placeLng,
      );

      return {
        ...place,
        location: {
          coordinates: coordinates,
        },
        distance_meters,
      };
    });

    return res.json({
      success: true,
      places: transformedPlaces,
      total: transformedPlaces.length,
      fromCache: 0,
      fromBigQuery: 0,
      queryInfo: {
        center: {
          lat: latitude,
          lng: longitude,
        },
        radius,
        categories: searchCategories,
      },
    });
  } catch (error) {
    console.error("[SearchPlaces] Error:", error);
    return res.status(500).json({
      success: false,
      places: [],
      total: 0,
      fromCache: 0,
      fromBigQuery: 0,
      queryInfo: {
        center: {
          lat: latitude || 0,
          lng: longitude || 0,
        },
        radius: radius || 0,
        categories: categories || [],
      },
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
