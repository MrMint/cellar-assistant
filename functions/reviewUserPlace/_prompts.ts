import {
  formatAllCategories,
  type UserPlaceCategory,
} from "@cellar-assistant/shared";
import type { JSONSchema7 } from "json-schema";

interface PlaceReviewInput {
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

export const PLACE_REVIEW_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    approved: {
      type: "boolean",
      description: "Whether this place submission should be created",
    },
    confidence_adjustment: {
      type: "number",
      description:
        "Adjustment to the base confidence score (-0.3 to +0.3). Positive for high-quality submissions, negative for suspicious ones.",
    },
    enriched_description: {
      type: "string",
      description:
        "A concise 1-2 sentence description of the place suitable for display. Generate one if the user did not provide a description.",
    },
    suggested_categories: {
      type: "array",
      items: { type: "string" },
      description:
        "Additional categories that seem appropriate but were not selected by the user. Empty array if categories look complete.",
    },
    rejection_reason: {
      type: ["string", "null"],
      description:
        "If not approved, a user-facing explanation of why. Null if approved.",
    },
    flags: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "Quality flags detected (e.g. spam, inappropriate, duplicate_suspected, low_quality, fictional). Empty array if no issues.",
    },
  },
  required: [
    "approved",
    "confidence_adjustment",
    "enriched_description",
    "suggested_categories",
    "flags",
  ],
};

export function PLACE_REVIEW_PROMPT(input: PlaceReviewInput): string {
  const addressParts = [
    input.street_address,
    input.locality,
    input.region,
    input.country_code,
  ].filter(Boolean);

  return `You are reviewing a user-submitted place for an app that helps people discover and track venues for wine, beer, spirits, coffee, and sake.

Evaluate this submission for quality, accuracy, and potential abuse.

## Place Details
- Name: ${input.name}
- Categories: ${input.categories.join(", ")}
- Coordinates: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}
- Address: ${addressParts.length > 0 ? addressParts.join(", ") : "Not provided"}
${input.phone ? `- Phone: ${input.phone}` : ""}
${input.website ? `- Website: ${input.website}` : ""}
${input.description ? `- User description: ${input.description}` : ""}

## Review Criteria
1. Does the name look like a real business name? (Not random text, profanity, or test data)
2. Do the categories make sense for the place? Valid categories are: ${formatAllCategories()}.
3. Is there any indication of spam, abuse, or fictional content?
4. Generate a brief, helpful description if the user didn't provide one, or improve theirs if it's low quality.
5. Suggest any additional relevant categories the user may have missed based on the place name and type.

## Guidelines
- APPROVE most submissions that look like genuine places, even if details are sparse.
- REJECT only clearly problematic submissions: spam, profanity, obviously fictional places, or places with no plausible connection to food or beverages (e.g. a hardware store, car dealership).
- Give a positive confidence adjustment (+0.1 to +0.3) for submissions with complete info (name, address, phone/website).
- Give a neutral or slightly negative adjustment (-0.1 to 0) for sparse submissions.
- Give a strongly negative adjustment (-0.2 to -0.3) for low-quality submissions that still pass.

Return your assessment as JSON matching this schema:

${JSON.stringify(PLACE_REVIEW_SCHEMA, null, 2)}`;
}
