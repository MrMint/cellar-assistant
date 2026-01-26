/**
 * Generic item search functionality
 */

import { SEARCH_GENERIC_ITEMS_QUERY } from "../search-queries";
import { functionQuery, getAdminAuthHeaders } from "../urql-client";
import { extractSearchWords } from "./search-utils";
import type { GenericItemSearchParams, SearchResult } from "./types";

/**
 * Represents a generic item from the database
 */
interface GenericItem {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  item_type?: string | null;
  is_substitutable?: boolean | null;
  created_at?: string | null;
  alternative_names?: Record<string, unknown> | null;
  unit_type?: string | null;
  standard_unit?: string | null;
}

/**
 * Search generic items using name-based matching
 */
export async function searchGenericItems(
  params: GenericItemSearchParams,
): Promise<SearchResult[]> {
  console.log(
    `🔍 [searchGenericItems] Searching generic items with terms: "${params.searchTerms}"`,
  );

  if (!params.searchTerms.trim()) {
    console.log(
      `🔍 [searchGenericItems] Empty search terms, returning empty results`,
    );
    return [];
  }

  try {
    const searchTermLower = params.searchTerms.toLowerCase().trim();
    const searchWords = extractSearchWords(searchTermLower);

    console.log(
      `🔍 [searchGenericItems] Searching with terms: "${searchTermLower}", words: [${searchWords.join(", ")}]`,
    );

    // Use URQL with typed queries for generic items search
    console.log(
      `🔍 [searchGenericItems] Executing generic items search via URQL`,
    );

    const searchResult = await functionQuery(
      SEARCH_GENERIC_ITEMS_QUERY,
      {
        searchTerm: `%${searchTermLower}%`,
        limit: params.limit * 2,
      },
      { headers: getAdminAuthHeaders() },
    );

    if (!searchResult?.generic_items) {
      console.log(`🔍 [searchGenericItems] No search results returned`);
      return [];
    }

    const results = searchResult.generic_items;
    console.log(
      `🔍 [searchGenericItems] Found ${results.length} generic items before similarity filtering`,
    );

    return transformGenericSearchResults(
      results,
      params,
      searchTermLower,
      searchWords,
    );
  } catch (error) {
    console.error(
      `❌ [searchGenericItems] Error searching generic items:`,
      error,
    );
    return [];
  }
}

/**
 * Transform generic search results into standardized SearchResult format
 */
function transformGenericSearchResults(
  results: GenericItem[],
  params: GenericItemSearchParams,
  searchTermLower: string,
  searchWords: string[],
): SearchResult[] {
  const searchResults: SearchResult[] = results
    .map((item: GenericItem) => {
      // Calculate text similarity score using multiple factors
      const similarity = calculateGenericItemSimilarity(
        item,
        searchTermLower,
        searchWords,
        params.category,
      );

      return createGenericSearchResult(item, similarity);
    })
    .filter(
      (result: SearchResult) =>
        (result.similarity_score ?? 0) >= params.similarityThreshold,
    )
    .sort(
      (a: SearchResult, b: SearchResult) =>
        (b.similarity_score ?? 0) - (a.similarity_score ?? 0),
    ) // Sort by similarity descending
    .slice(0, params.limit); // Limit final results

  logGenericSearchResults(searchResults, params.similarityThreshold);
  return searchResults;
}

/**
 * Calculate similarity score for a generic item using multiple factors
 */
function calculateGenericItemSimilarity(
  item: GenericItem,
  searchTermLower: string,
  searchWords: string[],
  categoryFilter?: string,
): number {
  let similarity = 0;
  const itemNameLower = item.name.toLowerCase();

  // Exact match boost
  if (itemNameLower === searchTermLower) {
    similarity = 1.0;
  } else if (itemNameLower.includes(searchTermLower)) {
    similarity = 0.8;
  } else {
    // Word-based similarity
    const itemWords = itemNameLower.split(/\s+/);
    const matchingWords = searchWords.filter((word) =>
      itemWords.some(
        (itemWord: string) =>
          itemWord.includes(word) || word.includes(itemWord),
      ),
    );
    similarity = matchingWords.length / Math.max(searchWords.length, 1);
  }

  // Category match boost
  if (
    categoryFilter &&
    item.category &&
    item.category.toLowerCase().includes(categoryFilter.toLowerCase())
  ) {
    similarity += 0.2;
  }

  // Alternative names boost
  if (item.alternative_names) {
    const altNames = Object.keys(item.alternative_names).map((name) =>
      name.toLowerCase(),
    );
    const hasAltMatch = altNames.some(
      (altName) =>
        altName.includes(searchTermLower) || searchTermLower.includes(altName),
    );
    if (hasAltMatch) {
      similarity += 0.3;
    }
  }

  // Description match boost (if description contains search terms)
  if (item.description) {
    const descLower = item.description.toLowerCase();
    const hasDescMatch = searchWords.some((word) => descLower.includes(word));
    if (hasDescMatch) {
      similarity += 0.1;
    }
  }

  // Clamp similarity to max 1.0
  return Math.min(similarity, 1.0);
}

/**
 * Create a standardized SearchResult from a generic item
 */
function createGenericSearchResult(
  item: GenericItem,
  similarity: number,
): SearchResult {
  return {
    id: item.id,
    name: item.name,
    category: item.category ?? undefined,
    subcategory: item.subcategory ?? undefined,
    similarity_score: similarity,
    // Include additional fields that might be useful
    description: item.description ?? undefined,
    unit_type: item.unit_type ?? undefined,
    standard_unit: item.standard_unit ?? undefined,
    alternative_names: item.alternative_names ?? undefined,
    // Copy all item data for additional processing
    ...item,
  };
}

/**
 * Log generic search results for debugging
 */
function logGenericSearchResults(
  searchResults: SearchResult[],
  threshold: number,
): void {
  console.log(
    `🔍 [searchGenericItems] Returning ${searchResults.length} filtered results (threshold: ${threshold})`,
  );

  // Log top results for debugging
  searchResults.slice(0, 3).forEach((result, index) => {
    console.log(
      `🔍 [searchGenericItems]   ${index + 1}. "${result.name}" (similarity: ${result.similarity_score?.toFixed(3)}, category: ${result.category || "N/A"})`,
    );
  });
}
