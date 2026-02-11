import type { UserPlaceCategory } from "@cellar-assistant/shared";
import Ajv from "ajv";
import type { Request, Response } from "express";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { AUTH_ERROR_RESPONSE, requireAuth } from "../_utils/auth-middleware";
import { PLACE_REVIEW_PROMPT, PLACE_REVIEW_SCHEMA } from "./_prompts";

interface ReviewPlaceRequest {
  name: string;
  categories: UserPlaceCategory[];
  latitude: number;
  longitude: number;
  street_address?: string;
  locality?: string;
  region?: string;
  country_code?: string;
  phone?: string;
  website?: string;
  description?: string;
}

interface ReviewResult {
  approved: boolean;
  confidence_adjustment: number;
  enriched_description?: string;
  suggested_categories?: string[];
  rejection_reason?: string;
  flags: string[];
}

const ajv = new Ajv({ allErrors: true });
const validateReviewResult = ajv.compile(PLACE_REVIEW_SCHEMA);

const FALLBACK_RESULT: ReviewResult = {
  approved: true,
  confidence_adjustment: 0,
  flags: [],
};

export default async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authResult = requireAuth(req);
  if (authResult.isAuthenticated === false) {
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  const input: ReviewPlaceRequest = req.body;

  if (
    !input.name ||
    !input.categories?.length ||
    input.latitude == null ||
    input.longitude == null
  ) {
    return res
      .status(400)
      .json({
        error: "Missing required fields: name, categories, latitude, longitude",
      });
  }

  try {
    const provider = await createAIProvider();
    const prompt = PLACE_REVIEW_PROMPT(input);

    const response = await provider.generateContent(
      { prompt, schema: PLACE_REVIEW_SCHEMA },
      "low",
    );

    const parsed = JSON.parse(response.content) as Record<string, unknown>;

    // Coerce null strings to empty strings before validation (AI sometimes
    // returns null for required string fields like enriched_description)
    if (parsed.enriched_description == null) {
      parsed.enriched_description = "";
    }

    // Validate AI response against the JSON schema
    if (!validateReviewResult(parsed)) {
      console.error(
        "[reviewUserPlace] AI response failed validation:",
        validateReviewResult.errors,
      );
      return res.status(200).json(FALLBACK_RESULT);
    }

    const result = parsed as unknown as ReviewResult;

    // Clamp confidence adjustment
    result.confidence_adjustment = Math.max(
      -0.3,
      Math.min(0.3, result.confidence_adjustment ?? 0),
    );

    // Ensure flags is always an array
    if (!Array.isArray(result.flags)) {
      result.flags = [];
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[reviewUserPlace] AI review failed:", error);
    // Graceful degradation: approve with no adjustment
    return res.status(200).json(FALLBACK_RESULT);
  }
};
