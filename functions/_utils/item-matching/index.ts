/**
 * Shared Item Matching Infrastructure
 *
 * Universal item matching system used by:
 * - Recipe ingredient processing
 * - getItemDefaults (onboarding)
 * - Manual item search/deduplication
 * - Admin tools for duplicate detection
 */

import { findBestMatchWithPriority } from "./confidence-scoring";
import { searchGenericItems } from "./generic-search";
import { buildSearchTerms } from "./search-utils";
import { searchSpecificItems } from "./specific-search";
// Import the modular components
import type { ItemMatchRequest, ItemMatchResult, SearchOptions } from "./types";

// Re-export confidence scoring functions
export {
  calculateEnhancedConfidence,
  findBestMatchWithPriority,
} from "./confidence-scoring";
export { searchGenericItems } from "./generic-search";
// Re-export utility functions
export { buildSearchTerms, calculateStringSimilarity } from "./search-utils";
// Re-export search functions
export { searchSpecificItems } from "./specific-search";
// Re-export types for backwards compatibility
export type {
  GenericItemSearchParams,
  ItemMatchRequest,
  ItemMatchResult,
  SearchOptions,
  SearchResult,
  SpecificItemSearchParams,
} from "./types";

/**
 * Universal item matching function used across the application
 *
 * @param request - Item data to match against
 * @param options - Matching configuration options
 * @returns Best matching item or null if no good match found
 */
export async function findBestItemMatch(
  request: ItemMatchRequest,
  options: SearchOptions = {},
): Promise<ItemMatchResult | null> {
  const {
    confidenceThreshold = 0.8,
    includeGeneric = true,
    maxResults = 5,
  } = options;

  // Build comprehensive search terms
  const searchTerms = buildSearchTerms(request);

  let bestMatch: ItemMatchResult | null = null;

  // 1. Try specific items first if not explicitly generic
  if (request.item_type !== "generic") {
    console.log(
      `🔍 [ItemMatching] Searching specific ${request.item_type} items for: "${searchTerms}"`,
    );
    console.log(
      `📊 [ItemMatching] Search confidence threshold: ${confidenceThreshold}`,
    );

    const specificMatches = await searchSpecificItems({
      itemType: request.item_type,
      searchTerms,
      filters: {
        category: request.category,
        country: request.country,
        alcohol_content: request.alcohol_content,
        vintage: request.vintage,
        style: request.style,
        variety: request.variety,
      },
      limit: maxResults,
      similarityThreshold: 0.7, // Lower threshold for initial search
    });

    console.log(
      `📊 [ItemMatching] Found ${specificMatches.length} specific ${request.item_type} candidates`,
    );
    bestMatch = findBestMatchWithPriority(specificMatches, request, "specific");

    if (bestMatch) {
      console.log(
        `✅ [ItemMatching] Found specific match: ${bestMatch.item.name} (confidence: ${bestMatch.confidence}, reason: ${bestMatch.matchReason})`,
      );
    } else {
      console.log(
        `📊 [ItemMatching] No specific matches above similarity threshold 0.7`,
      );
    }
  } else {
    console.log(
      `📊 [ItemMatching] Skipping specific item search for generic item type`,
    );
  }

  // 2. Try generic items if no good specific match or if requested
  if (
    (!bestMatch || bestMatch.confidence < confidenceThreshold) &&
    includeGeneric
  ) {
    const currentConfidence = bestMatch?.confidence || 0;
    console.log(
      `🔍 [ItemMatching] Searching generic items for: "${searchTerms}"`,
    );
    console.log(
      `📊 [ItemMatching] Current best confidence: ${currentConfidence}, threshold: ${confidenceThreshold}`,
    );

    const genericMatches = await searchGenericItems({
      searchTerms,
      category: request.category,
      itemType: request.item_type,
      limit: maxResults,
      similarityThreshold: 0.6, // Lower threshold for generic items
    });

    console.log(
      `📊 [ItemMatching] Found ${genericMatches.length} generic candidates`,
    );
    const genericMatch = findBestMatchWithPriority(
      genericMatches,
      request,
      "generic",
    );

    // Use generic match if it's better or if no specific match
    if (
      !bestMatch ||
      (genericMatch && genericMatch.confidence > bestMatch.confidence)
    ) {
      const oldConfidence = bestMatch?.confidence || "none";
      bestMatch = genericMatch;

      if (bestMatch) {
        console.log(
          `✅ [ItemMatching] Found generic match: ${bestMatch.item.name} (confidence: ${bestMatch.confidence}, reason: ${bestMatch.matchReason})`,
        );
        console.log(
          `📊 [ItemMatching] Replaced ${oldConfidence} with ${bestMatch.confidence} confidence`,
        );
      }
    } else if (genericMatch) {
      console.log(
        `📊 [ItemMatching] Generic match found but not better than current: ${genericMatch.confidence} vs ${currentConfidence}`,
      );
    }
  } else if (!includeGeneric) {
    console.log(
      `📊 [ItemMatching] Skipping generic search (includeGeneric: false)`,
    );
  }

  const finalMatch =
    bestMatch && bestMatch.confidence >= confidenceThreshold ? bestMatch : null;

  if (!finalMatch) {
    const bestConfidence = bestMatch?.confidence || "none";
    console.log(
      `❌ [ItemMatching] No suitable match found for "${request.name}" (best: ${bestConfidence}, threshold: ${confidenceThreshold})`,
    );
  } else {
    console.log(
      `✅ [ItemMatching] Final match selected: confidence ${finalMatch.confidence} >= threshold ${confidenceThreshold}`,
    );
  }

  return finalMatch;
}
