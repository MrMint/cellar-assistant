/**
 * Confidence scoring and match evaluation functionality
 */

import { calculateStringSimilarity } from "./search-utils";
import type { ItemMatchRequest, ItemMatchResult, SearchResult } from "./types";

/**
 * Find the best match from search results with enhanced scoring
 */
export function findBestMatchWithPriority(
  matches: SearchResult[],
  request: ItemMatchRequest,
  matchType: "specific" | "generic",
): ItemMatchResult | null {
  if (!matches.length) {
    console.log(
      `📊 [findBestMatchWithPriority] No ${matchType} matches to score`,
    );
    return null;
  }

  console.log(
    `📊 [findBestMatchWithPriority] Scoring ${matches.length} ${matchType} matches`,
  );

  // Calculate enhanced confidence for each match
  const scoredMatches = matches.map((match, index) => {
    const enhancedConfidence = calculateEnhancedConfidence(request, match);
    const matchReason = determineMatchReason(request, match);

    console.log(
      `📊 [findBestMatchWithPriority]   ${index + 1}. "${match.name}" - base: ${match.similarity_score || "N/A"}, enhanced: ${enhancedConfidence}, reason: ${matchReason}`,
    );

    return {
      ...match,
      enhancedConfidence,
      matchReason,
    };
  });

  // Sort by confidence (descending)
  scoredMatches.sort((a, b) => b.enhancedConfidence - a.enhancedConfidence);

  const best = scoredMatches[0];
  console.log(
    `📊 [findBestMatchWithPriority] Best ${matchType} match: "${best.name}" with confidence ${best.enhancedConfidence}`,
  );

  return {
    type: matchType,
    itemId: best.id,
    itemType: matchType === "specific" ? request.item_type : "generic",
    confidence: best.enhancedConfidence,
    matchReason: best.matchReason,
    item: best,
  };
}

/**
 * Calculate enhanced confidence score using multiple factors
 */
export function calculateEnhancedConfidence(
  request: ItemMatchRequest,
  match: SearchResult,
): number {
  let confidence = match.similarity_score || 0; // Base embedding similarity
  const boosts: string[] = [];

  // Exact name matching boost (highest priority)
  confidence = applyNameMatchBoosts(request, match, confidence, boosts);

  // Brand matching boost (second highest priority)
  confidence = applyBrandMatchBoosts(request, match, confidence, boosts);

  // Category matching boost
  confidence = applyCategoryMatchBoosts(request, match, confidence, boosts);

  // Country matching boost
  confidence = applyCountryMatchBoosts(request, match, confidence, boosts);

  // Vintage matching for wines (exact match important)
  confidence = applyVintageMatchBoosts(request, match, confidence, boosts);

  // Alcohol content proximity for spirits/wines
  confidence = applyAlcoholContentBoosts(request, match, confidence, boosts);

  // Style/variety matching for wines/beers
  confidence = applyStyleVarietyBoosts(request, match, confidence, boosts);

  const finalConfidence = Math.min(confidence, 1.0);

  // Log confidence calculation details
  console.log(
    `📊 [calculateEnhancedConfidence] "${match.name}": base(${match.similarity_score || 0}) + ${boosts.join(", ")} = ${finalConfidence}`,
  );

  return finalConfidence;
}

/**
 * Apply name matching boosts to confidence score
 */
function applyNameMatchBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.name && match.name) {
    const nameSimilarity = calculateStringSimilarity(
      request.name.toLowerCase(),
      match.name.toLowerCase(),
    );
    if (nameSimilarity > 0.95) {
      confidence += 0.3;
      boosts.push(`exact_name(+0.3)`);
    } else if (nameSimilarity > 0.8) {
      confidence += 0.2;
      boosts.push(`similar_name(+0.2)`);
    } else if (nameSimilarity > 0.6) {
      confidence += 0.1;
      boosts.push(`partial_name(+0.1)`);
    }
  }
  return confidence;
}

/**
 * Apply brand matching boosts to confidence score
 */
function applyBrandMatchBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.brand_name && match.brand_name) {
    const brandSimilarity = calculateStringSimilarity(
      request.brand_name.toLowerCase(),
      match.brand_name.toLowerCase(),
    );
    if (brandSimilarity > 0.9) {
      confidence += 0.25;
      boosts.push(`exact_brand(+0.25)`);
    } else if (brandSimilarity > 0.7) {
      confidence += 0.15;
      boosts.push(`similar_brand(+0.15)`);
    } else if (brandSimilarity > 0.5) {
      confidence += 0.05;
      boosts.push(`partial_brand(+0.05)`);
    }
  }
  return confidence;
}

/**
 * Apply category matching boosts to confidence score
 */
function applyCategoryMatchBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (
    request.category &&
    match.category &&
    request.category === match.category
  ) {
    confidence += 0.1;
    boosts.push(`category(+0.1)`);
  }
  return confidence;
}

/**
 * Apply country matching boosts to confidence score
 */
function applyCountryMatchBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.country && match.country && request.country === match.country) {
    confidence += 0.05;
    boosts.push(`country(+0.05)`);
  }
  return confidence;
}

/**
 * Apply vintage matching boosts to confidence score
 */
function applyVintageMatchBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.vintage && match.vintage && request.vintage === match.vintage) {
    confidence += 0.15; // Vintage is important for wines
    boosts.push(`vintage(+0.15)`);
  }
  return confidence;
}

/**
 * Apply alcohol content proximity boosts to confidence score
 */
function applyAlcoholContentBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.alcohol_content && match.alcohol_content_percentage) {
    const alcoholDiff = Math.abs(
      request.alcohol_content - match.alcohol_content_percentage,
    );
    if (alcoholDiff <= 1) {
      confidence += 0.1;
      boosts.push(`abv_close(+0.1)`);
    } else if (alcoholDiff <= 2) {
      confidence += 0.05;
      boosts.push(`abv_near(+0.05)`);
    }
  }
  return confidence;
}

/**
 * Apply style and variety matching boosts to confidence score
 */
function applyStyleVarietyBoosts(
  request: ItemMatchRequest,
  match: SearchResult,
  confidence: number,
  boosts: string[],
): number {
  if (request.style && match.style && request.style === match.style) {
    confidence += 0.1;
    boosts.push(`style(+0.1)`);
  }

  if (request.variety && match.variety && request.variety === match.variety) {
    confidence += 0.1;
    boosts.push(`variety(+0.1)`);
  }
  return confidence;
}

/**
 * Determine the primary reason for the match
 */
export function determineMatchReason(
  request: ItemMatchRequest,
  match: SearchResult,
): ItemMatchResult["matchReason"] {
  // Check for exact name match first
  if (request.name && match.name) {
    const nameSimilarity = calculateStringSimilarity(
      request.name.toLowerCase(),
      match.name.toLowerCase(),
    );
    if (nameSimilarity > 0.95) return "exact_name";
  }

  // Check for brand matching
  if (request.brand_name && match.brand_name) {
    const brandSimilarity = calculateStringSimilarity(
      request.brand_name.toLowerCase(),
      match.brand_name.toLowerCase(),
    );
    if (brandSimilarity > 0.9) return "exact_brand";
    if (brandSimilarity > 0.7) return "brand_similarity";
  }

  // Check for category matching
  if (
    request.category &&
    match.category &&
    request.category === match.category
  ) {
    return "category_match";
  }

  // Default to semantic similarity
  return "semantic_similarity";
}
