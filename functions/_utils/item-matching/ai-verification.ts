/**
 * AI-powered match verification for ambiguous item matches.
 *
 * After vector search + algorithmic scoring returns candidates,
 * this module uses AI to verify and rerank ambiguous matches
 * (top confidence between 0.4–0.9) to improve matching quality.
 *
 * The prompt uses 1-based indices (not database IDs) to avoid
 * leaking internals and to save tokens. Responses are mapped
 * back to real IDs after parsing.
 */

import type { JSONSchema7 } from "json-schema";
import { createAIProvider } from "../ai-providers/factory";

// =============================================================================
// Constants
// =============================================================================

/** Skip AI verification if top match already this confident */
const VERIFICATION_HIGH_SKIP = 0.9;

/** Skip AI verification if no candidate reaches this threshold */
const VERIFICATION_LOW_SKIP = 0.4;

/** Maximum candidates to send to AI for verification */
const MAX_CANDIDATES = 5;

// =============================================================================
// Types
// =============================================================================

export interface MenuItemForVerification {
  name: string;
  search_name?: string;
  description?: string;
  itemType: string;
  attributes: Record<string, unknown>;
}

export interface VerificationCandidate {
  id: string;
  name: string;
  brand_name?: string | null;
  country?: string | null;
  vintage?: string | number | null;
  style?: string | null;
  variety?: string | null;
  alcohol_content_percentage?: number | null;
  originalConfidence: number;
}

export interface VerificationResult {
  bestMatchId: string | null;
  confidence: number;
  reasoning: string;
  candidates: Array<{
    id: string;
    adjustedConfidence: number;
    isMatch: boolean;
  }>;
}

// =============================================================================
// Internal AI response shape (uses indices, not IDs)
// =============================================================================

interface AIVerificationResponse {
  bestMatchIndex: number;
  confidence: number;
  reasoning: string;
  candidates: Array<{
    index: number;
    adjustedConfidence: number;
    isMatch: boolean;
  }>;
}

// =============================================================================
// Structured Output Schema
// =============================================================================

const VERIFICATION_RESPONSE_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    bestMatchIndex: {
      type: "integer",
      description:
        "1-based index of the best matching candidate, or 0 if no candidate is a genuine match",
    },
    confidence: {
      type: "number",
      description: "Confidence in the best match (0-1). Set to 0 if no match.",
    },
    reasoning: {
      type: "string",
      description:
        "Brief explanation of why this match was selected or rejected",
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: {
            type: "integer",
            description: "1-based index of the candidate",
          },
          adjustedConfidence: {
            type: "number",
            description: "AI-adjusted confidence score (0-1)",
          },
          isMatch: {
            type: "boolean",
            description: "Whether this candidate is a genuine match",
          },
        },
        required: ["index", "adjustedConfidence", "isMatch"],
      },
    },
  },
  required: ["bestMatchIndex", "confidence", "reasoning", "candidates"],
};

// =============================================================================
// Gating
// =============================================================================

/**
 * Determine whether AI verification would add value for these candidates.
 * Returns false for clear matches (>0.9), clear misses (<0.4), or no candidates.
 */
export function shouldVerifyWithAI(
  topConfidence: number,
  candidateCount: number,
): boolean {
  if (candidateCount === 0) return false;
  if (topConfidence >= VERIFICATION_HIGH_SKIP) return false;
  if (topConfidence < VERIFICATION_LOW_SKIP) return false;
  return true;
}

// =============================================================================
// Verification
// =============================================================================

/**
 * Use AI to verify and rerank match candidates for a menu item.
 * Gracefully degrades to original scores on failure.
 */
export async function verifyMatchesWithAI(
  menuItem: MenuItemForVerification,
  candidates: VerificationCandidate[],
): Promise<VerificationResult> {
  const truncatedCandidates = candidates.slice(0, MAX_CANDIDATES);

  // Build fallback result preserving original scores
  const fallbackResult: VerificationResult = {
    bestMatchId: truncatedCandidates[0]?.id ?? null,
    confidence: truncatedCandidates[0]?.originalConfidence ?? 0,
    reasoning: "AI verification unavailable, using original scores",
    candidates: truncatedCandidates.map((c) => ({
      id: c.id,
      adjustedConfidence: c.originalConfidence,
      isMatch: c.originalConfidence > 0.6,
    })),
  };

  try {
    const aiProvider = await createAIProvider();

    const prompt = buildVerificationPrompt(menuItem, truncatedCandidates);

    const aiResult = await aiProvider.generateContent(
      { prompt, schema: VERIFICATION_RESPONSE_SCHEMA },
      "low",
    );

    const parsed: AIVerificationResponse = JSON.parse(aiResult.content);

    // Validate response shape
    if (
      !Array.isArray(parsed.candidates) ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reasoning !== "string" ||
      typeof parsed.bestMatchIndex !== "number"
    ) {
      console.error(
        "[ai-verification] Invalid AI response shape, using fallback",
      );
      return fallbackResult;
    }

    // Map indices back to real IDs
    return mapIndicesToIds(parsed, truncatedCandidates);
  } catch (error) {
    console.error(
      "[ai-verification] Verification failed, using original scores:",
      error,
    );
    return fallbackResult;
  }
}

// =============================================================================
// Index-to-ID Mapping
// =============================================================================

/**
 * Map AI response (which uses 1-based indices) back to real candidate IDs.
 * Logs warnings for any out-of-range indices (hallucinated responses).
 */
function mapIndicesToIds(
  aiResponse: AIVerificationResponse,
  candidates: VerificationCandidate[],
): VerificationResult {
  // Map bestMatchIndex (1-based) to real ID
  let bestMatchId: string | null = null;
  if (aiResponse.bestMatchIndex > 0) {
    const bestCandidate = candidates[aiResponse.bestMatchIndex - 1];
    if (bestCandidate) {
      bestMatchId = bestCandidate.id;
    } else {
      console.warn(
        `[ai-verification] AI returned out-of-range bestMatchIndex: ${aiResponse.bestMatchIndex} (max: ${candidates.length})`,
      );
    }
  }

  // Map candidate indices to IDs, filtering out invalid indices
  const mappedCandidates = aiResponse.candidates
    .map((c) => {
      const candidate = candidates[c.index - 1];
      if (!candidate) {
        console.warn(
          `[ai-verification] AI returned out-of-range candidate index: ${c.index} (max: ${candidates.length})`,
        );
        return null;
      }
      return {
        id: candidate.id,
        adjustedConfidence: c.adjustedConfidence,
        isMatch: c.isMatch,
      };
    })
    .filter(
      (c): c is { id: string; adjustedConfidence: number; isMatch: boolean } =>
        c !== null,
    );

  return {
    bestMatchId,
    confidence: aiResponse.confidence,
    reasoning: aiResponse.reasoning,
    candidates: mappedCandidates,
  };
}

// =============================================================================
// Prompt Builder
// =============================================================================

function buildVerificationPrompt(
  menuItem: MenuItemForVerification,
  candidates: VerificationCandidate[],
): string {
  const attributeLines = Object.entries(menuItem.attributes)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join("\n");

  const candidateLines = candidates
    .map((c, i) => {
      const parts = [`[${i + 1}] Name: "${c.name}"`];
      if (c.brand_name) parts.push(`Brand: "${c.brand_name}"`);
      if (c.country) parts.push(`Country: ${c.country}`);
      if (c.vintage) parts.push(`Vintage: ${c.vintage}`);
      if (c.style) parts.push(`Style: ${c.style}`);
      if (c.variety) parts.push(`Variety: ${c.variety}`);
      if (c.alcohol_content_percentage)
        parts.push(`ABV: ${c.alcohol_content_percentage}%`);
      parts.push(`Score: ${c.originalConfidence.toFixed(3)}`);
      return parts.join(", ");
    })
    .join("\n");

  return `You are a beverage matching expert. A restaurant menu item needs to be matched to the correct item in our database.

MENU ITEM:
  Name: "${menuItem.name}"${menuItem.search_name ? `\n  Search Name: "${menuItem.search_name}"` : ""}
  Type: ${menuItem.itemType}${menuItem.description ? `\n  Description: "${menuItem.description}"` : ""}
${attributeLines ? `  Attributes:\n${attributeLines}` : ""}

DATABASE CANDIDATES (ranked by initial similarity):
${candidateLines}

TASK: Determine which candidate (if any) is the correct match.
Refer to candidates by their number (1, 2, 3, etc.).

MATCHING RULES:
- Exact product match requires same producer AND product name
- Abbreviation/accent differences are OK ("Ch." = "Chateau", "Dom." = "Domaine")
- Grape variety shorthand matches full name ("Cab Sauv" = "Cabernet Sauvignon")
- Regional wine names may match specific producers from that region
- For cocktails, match by name and base spirit — ingredient variations are expected
- If no candidate is a genuine match, set bestMatchIndex to 0
- Be conservative: lower confidence rather than falsely confirming
- adjustedConfidence should reflect your assessment, not just echo the original score`;
}
