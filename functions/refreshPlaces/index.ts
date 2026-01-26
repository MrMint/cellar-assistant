import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { functionMutation, getAdminAuthHeaders } from "../_utils/urql-client";
import type { PlaceData } from "./_services";
import { createPlaceDataService } from "./_services";
import {
  ALL_CATEGORIES,
  CLEAR_PLACES_MUTATION,
  DEFAULT_BATCH_SIZE,
  INSERT_PLACES_MUTATION,
  type PlaceInsertData,
  type RefreshPlacesResponse,
} from "./_types.js";

export default async (
  req: Request,
  res: Response,
): Promise<Response<RefreshPlacesResponse>> => {
  // Require authentication for this destructive operation
  if (!validateAuth(req)) {
    return res
      .status(401)
      .json(AUTH_ERROR_RESPONSE as unknown as RefreshPlacesResponse);
  }

  try {
    console.log("[PlaceRefresh] Starting weekly full refresh...");
    const startTime = Date.now();

    // Create the appropriate data service based on environment
    const placeDataService = createPlaceDataService();
    console.log(`[PlaceRefresh] Using ${placeDataService.getName()}`);

    // Fetch places data from the configured service
    // Spread ALL_CATEGORIES to convert from readonly array to mutable array
    const places = await placeDataService.fetchPlaces([...ALL_CATEGORIES]);

    // Clear existing data and insert new data
    console.log("[PlaceRefresh] Clearing existing places...");
    await functionMutation(
      CLEAR_PLACES_MUTATION,
      {},
      { headers: getAdminAuthHeaders() },
    );

    // Batch insert new data (split into chunks to avoid GraphQL limits)
    const BATCH_SIZE = DEFAULT_BATCH_SIZE;
    let totalInserted = 0;

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);

      // Prepare batch for insertion - match the consolidated schema
      // Note: primary_category is a GENERATED column, so we don't include it
      const insertData: PlaceInsertData[] = batch.map(
        (place: PlaceData): PlaceInsertData => ({
          overture_id: place.overture_id,
          name: place.name,
          display_name: place.name,
          categories: place.categories, // primary_category will be generated from categories[1]
          confidence: place.confidence,
          location: {
            type: "Point" as const,
            coordinates: [place.longitude, place.latitude],
          },
          // Optional fields from the consolidated schema
          street_address: null,
          locality: null,
          region: null,
          postcode: null,
          country_code: null,
          phone: place.phone ?? null,
          website: place.website ?? null,
          email: null,
          is_active: true,
          is_verified: false,
          access_count: 0,
          first_cached_reason: "bulk_refresh",
        }),
      );

      const data = await functionMutation(
        INSERT_PLACES_MUTATION,
        { places: insertData },
        { headers: getAdminAuthHeaders() },
      );

      totalInserted += data?.insert_places?.affected_rows || 0;
      console.log(
        `[PlaceRefresh] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(places.length / BATCH_SIZE)}`,
      );
    }

    const duration = Date.now() - startTime;
    console.log(
      `[PlaceRefresh] Complete! ${totalInserted} places refreshed in ${duration}ms`,
    );

    return res.json({
      success: true,
      places_refreshed: totalInserted,
      duration_ms: duration,
      categories_included: ALL_CATEGORIES.length,
      data_source: placeDataService.getName(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PlaceRefresh] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};
