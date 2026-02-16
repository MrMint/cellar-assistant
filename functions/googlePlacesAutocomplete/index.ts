import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { autocomplete } from "../_utils/google-places";

interface AutocompleteBody {
  input: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  triggeredBy?: string;
}

export default async (req: Request, res: Response) => {
  if (!validateAuth(req)) {
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  try {
    const { input, latitude, longitude, radiusMeters, triggeredBy } =
      req.body as AutocompleteBody;

    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input is required" });
    }

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res
        .status(400)
        .json({ error: "latitude and longitude are required numbers" });
    }

    const results = await autocomplete(input, latitude, longitude, {
      radiusMeters,
      triggeredBy,
    });

    return res.json({
      success: true,
      suggestions: results ?? [],
      budgetExhausted: results === null,
    });
  } catch (error) {
    console.error("[googlePlacesAutocomplete] Error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
