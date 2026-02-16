import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { nearbySearch } from "../_utils/google-places";

interface NearbySearchBody {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  maxResults?: number;
  triggeredBy?: string;
}

export default async (req: Request, res: Response) => {
  if (!validateAuth(req)) {
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  try {
    const { latitude, longitude, radiusMeters, maxResults, triggeredBy } =
      req.body as NearbySearchBody;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res
        .status(400)
        .json({ error: "latitude and longitude are required numbers" });
    }

    const results = await nearbySearch(latitude, longitude, {
      radiusMeters,
      maxResults,
      triggeredBy,
    });

    // Flatten location for Hasura action response
    const places = (results ?? []).map((p) => ({
      googlePlaceId: p.googlePlaceId,
      name: p.name,
      address: p.address,
      types: p.types,
      latitude: p.location.latitude,
      longitude: p.location.longitude,
    }));

    return res.json({
      success: true,
      places,
      budgetExhausted: results === null,
    });
  } catch (error) {
    console.error("[googlePlacesNearbySearch] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
