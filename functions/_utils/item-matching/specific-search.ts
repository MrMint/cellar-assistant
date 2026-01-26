/**
 * Specific item search functionality (wine, beer, spirit, coffee)
 */

import { match } from "ts-pattern";
import { createAIProvider } from "../ai-providers/factory";
import { TEXT_SEARCH_QUERIES, VECTOR_SEARCH_QUERIES } from "../search-queries";
import { functionQuery } from "../urql-client";
import { extractSearchWords } from "./search-utils";
import type {
  ItemRecord,
  SearchResult,
  SpecificItemSearchParams,
  VectorSearchResult,
} from "./types";

/**
 * Search specific items (wine/beer/spirit/coffee) using existing search infrastructure
 */
export async function searchSpecificItems(
  params: SpecificItemSearchParams,
): Promise<SearchResult[]> {
  console.log(
    `🔍 [searchSpecificItems] Searching ${params.itemType} with terms: "${params.searchTerms}"`,
  );

  if (!params.searchTerms.trim()) {
    console.log(
      `🔍 [searchSpecificItems] Empty search terms, returning empty results`,
    );
    return [];
  }

  try {
    // Try vector search first, fall back to text search if embedding fails
    return (
      (await searchWithVectorEmbeddings(params)) ||
      (await searchWithTextMatching(params))
    );
  } catch (error) {
    console.error(
      `❌ [searchSpecificItems] Error searching ${params.itemType}:`,
      error,
    );
    return [];
  }
}

/**
 * Search using vector embeddings for semantic similarity
 */
async function searchWithVectorEmbeddings(
  params: SpecificItemSearchParams,
): Promise<SearchResult[]> {
  try {
    console.log(
      `🔍 [searchWithVectorEmbeddings] Starting vector search for ${params.itemType} with terms: "${params.searchTerms}"`,
    );

    // Generate embedding for search terms
    const aiProvider = await createAIProvider();
    if (!aiProvider.generateEmbeddings) {
      console.log(
        `🔍 [searchWithVectorEmbeddings] AI provider doesn't support embeddings, falling back to text search`,
      );
      return [];
    }

    const embeddingResponse = await aiProvider.generateEmbeddings({
      content: params.searchTerms,
      type: "text",
    });

    if (
      !embeddingResponse?.embeddings ||
      embeddingResponse.embeddings.length === 0
    ) {
      console.log(
        `🔍 [searchWithVectorEmbeddings] No embeddings generated, falling back to text search`,
      );
      return [];
    }

    console.log(
      `🔍 [searchWithVectorEmbeddings] Generated ${embeddingResponse.embeddings.length}-dimensional embedding`,
    );

    // Convert embeddings array to vector string format for PostgreSQL
    const vectorString = JSON.stringify(embeddingResponse.embeddings);

    // Calculate max distance from similarity threshold
    // Lower similarity threshold = higher allowed distance
    // Using cosine distance: range is 0 (identical) to 2 (opposite)
    const maxDistance = 2 * (1 - params.similarityThreshold);

    console.log(
      `🔍 [searchWithVectorEmbeddings] Querying with max distance: ${maxDistance.toFixed(3)}`,
    );

    // Query using the text_search native query
    // VECTOR_SEARCH_QUERIES uses lowercase keys, but itemType is uppercase
    const query =
      VECTOR_SEARCH_QUERIES[
        params.itemType.toLowerCase() as keyof typeof VECTOR_SEARCH_QUERIES
      ];
    if (!query) {
      console.log(
        `🔍 [searchWithVectorEmbeddings] Vector search not available for ${params.itemType}, falling back to text search`,
      );
      return [];
    }

    const searchResult = await functionQuery(query, {
      text: vectorString,
      limit: params.limit * 2, // Get more results for filtering
      maxDistance,
    });

    // Extract results from the text_search response
    const vectorResults = searchResult.text_search || [];

    if (vectorResults.length === 0) {
      console.log(
        `🔍 [searchWithVectorEmbeddings] No vector results found, falling back to text search`,
      );
      return [];
    }

    console.log(
      `🔍 [searchWithVectorEmbeddings] Found ${vectorResults.length} vector results before filtering`,
    );

    // Transform vector search results to SearchResult format
    return transformVectorSearchResults(vectorResults, params);
  } catch (error) {
    console.error(
      `❌ [searchWithVectorEmbeddings] Vector search failed:`,
      error,
    );
    // Return empty array to trigger fallback to text search
    return [];
  }
}

/**
 * Transform vector search results into standardized SearchResult format
 */
function transformVectorSearchResults(
  results: VectorSearchResult[],
  params: SpecificItemSearchParams,
): SearchResult[] {
  const searchResults: SearchResult[] = results
    .map((result: VectorSearchResult) => {
      // Extract the item based on type
      const item =
        result.wine ||
        result.beer ||
        result.spirit ||
        result.coffee ||
        result.sake;
      if (!item) {
        return null;
      }

      // Convert distance to similarity score (0 = identical, 2 = opposite)
      // Normalize to 0-1 range where 1 is perfect match
      const similarity = Math.max(0, 1 - result.distance / 2);

      // Apply filter boosts
      let adjustedSimilarity = applyFilterBoosts(
        item,
        params.filters,
        similarity,
      );
      adjustedSimilarity = Math.min(adjustedSimilarity, 1.0);

      return createSearchResult(item, params.itemType, adjustedSimilarity);
    })
    .filter((result): result is SearchResult => result !== null)
    .filter((result) => result.similarity_score >= params.similarityThreshold)
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, params.limit);

  logSearchResults(searchResults, params.itemType, "vector");
  return searchResults;
}

/**
 * Fallback search using text-based matching when embeddings are not available
 */
async function searchWithTextMatching(
  params: SpecificItemSearchParams,
): Promise<SearchResult[]> {
  console.log(
    `🔍 [searchWithTextMatching] Text-based search for ${params.itemType} with terms: "${params.searchTerms}"`,
  );

  try {
    // Build search conditions using ILIKE for text matching
    const searchTermLower = params.searchTerms.toLowerCase().trim();
    const searchWords = extractSearchWords(searchTermLower);

    console.log(
      `🔍 [searchWithTextMatching] Searching with words: [${searchWords.join(", ")}]`,
    );

    // Use type-safe query execution based on item type (uppercase enum values)
    const results = await match(params.itemType)
      .with("WINE", async () => {
        const searchResult = await functionQuery(TEXT_SEARCH_QUERIES.wine, {
          searchTerm: `%${searchTermLower}%`,
          limit: params.limit * 2,
        });
        return searchResult.wines || [];
      })
      .with("BEER", async () => {
        const searchResult = await functionQuery(TEXT_SEARCH_QUERIES.beer, {
          searchTerm: `%${searchTermLower}%`,
          limit: params.limit * 2,
        });
        return searchResult.beers || [];
      })
      .with("SPIRIT", async () => {
        const searchResult = await functionQuery(TEXT_SEARCH_QUERIES.spirit, {
          searchTerm: `%${searchTermLower}%`,
          limit: params.limit * 2,
        });
        return searchResult.spirits || [];
      })
      .with("COFFEE", async () => {
        const searchResult = await functionQuery(TEXT_SEARCH_QUERIES.coffee, {
          searchTerm: `%${searchTermLower}%`,
          limit: params.limit * 2,
        });
        return searchResult.coffees || [];
      })
      .with("SAKE", async () => {
        const searchResult = await functionQuery(TEXT_SEARCH_QUERIES.sake, {
          searchTerm: `%${searchTermLower}%`,
          limit: params.limit * 2,
        });
        return searchResult.sakes || [];
      })
      .exhaustive();

    console.log(
      `🔍 [searchWithTextMatching] Found ${results.length} results before similarity filtering`,
    );

    return transformTextSearchResults(results, params);
  } catch (error) {
    console.error(`❌ [searchWithTextMatching] Text search failed:`, error);
    return [];
  }
}

/**
 * Transform text search results into standardized SearchResult format
 */
function transformTextSearchResults(
  results: ItemRecord[],
  params: SpecificItemSearchParams,
): SearchResult[] {
  const searchTermLower = params.searchTerms.toLowerCase().trim();
  const searchWords = extractSearchWords(searchTermLower);

  const searchResults: SearchResult[] = results
    .map((item: ItemRecord) => {
      // Calculate similarity score using text matching
      let similarity = calculateTextSimilarity(
        item,
        searchTermLower,
        searchWords,
      );

      // Apply filters and additional boosts
      similarity = applyFilterBoosts(item, params.filters, similarity);

      // Clamp to max 1.0
      similarity = Math.min(similarity, 1.0);

      return createSearchResult(item, params.itemType, similarity);
    })
    .filter(
      (result: SearchResult) =>
        (result.similarity_score ?? 0) >= params.similarityThreshold,
    )
    .sort(
      (a: SearchResult, b: SearchResult) =>
        (b.similarity_score ?? 0) - (a.similarity_score ?? 0),
    )
    .slice(0, params.limit);

  logSearchResults(searchResults, params.itemType, "text");
  return searchResults;
}

/**
 * Check if item passes the provided filters
 */
function _passesFilters(
  item: ItemRecord,
  filters: SpecificItemSearchParams["filters"],
): boolean {
  if (filters.country && item.country !== filters.country) {
    return false;
  }

  if (filters.alcohol_content && item.alcohol_content_percentage) {
    const diff = Math.abs(
      item.alcohol_content_percentage - filters.alcohol_content,
    );
    if (diff > 5) return false; // Allow 5% difference
  }

  if (
    filters.vintage &&
    "vintage" in item &&
    item.vintage !== filters.vintage
  ) {
    return false;
  }

  if (filters.style) {
    const styleField = `${item.itemType || "wine"}_style` as keyof ItemRecord;
    if (item[styleField] && item[styleField] !== filters.style) {
      return false;
    }
  }

  if (
    filters.variety &&
    "wine_variety" in item &&
    item.wine_variety !== filters.variety
  ) {
    return false;
  }

  return true;
}

/**
 * Calculate text-based similarity for an item
 */
function calculateTextSimilarity(
  item: ItemRecord,
  searchTermLower: string,
  searchWords: string[],
): number {
  const itemNameLower = item.name.toLowerCase();

  // Exact match gets highest score
  if (itemNameLower === searchTermLower) {
    return 1.0;
  } else if (itemNameLower.includes(searchTermLower)) {
    return 0.8;
  } else {
    // Word-based similarity
    const itemWords = itemNameLower.split(/\s+/);
    const matchingWords = searchWords.filter((word) =>
      itemWords.some(
        (itemWord: string) =>
          itemWord.includes(word) || word.includes(itemWord),
      ),
    );
    return matchingWords.length / Math.max(searchWords.length, 1);
  }
}

/**
 * Apply filter-based boosts to similarity score
 */
function applyFilterBoosts(
  item: ItemRecord,
  filters: SpecificItemSearchParams["filters"],
  similarity: number,
): number {
  if (filters.country && item.country === filters.country) {
    similarity += 0.1;
  }

  if (filters.alcohol_content && item.alcohol_content_percentage) {
    const diff = Math.abs(
      item.alcohol_content_percentage - filters.alcohol_content,
    );
    if (diff <= 2) similarity += 0.1;
  }

  if (
    filters.vintage &&
    "vintage" in item &&
    item.vintage === filters.vintage
  ) {
    similarity += 0.2;
  }

  if (filters.style) {
    const styleField = `${item.itemType || "wine"}_style`;
    if (item[styleField] === filters.style) {
      similarity += 0.15;
    }
  }

  return similarity;
}

/**
 * Create a standardized SearchResult from an item
 */
function createSearchResult(
  item: ItemRecord,
  itemType: string,
  similarity: number,
): SearchResult {
  // Get category based on item type (style or type field)
  const styleKey = `${itemType.toLowerCase()}_style` as keyof ItemRecord;
  const typeKey = `${itemType.toLowerCase()}_type` as keyof ItemRecord;
  const category =
    (item[styleKey] as string | null) ||
    (item[typeKey] as string | null) ||
    item.style ||
    item.type;

  // Get brand name from various possible fields
  const brandName =
    item.brand_name ||
    item.producer_name ||
    item.brewery_name ||
    item.distillery_name ||
    item.farm_name;

  return {
    id: item.id,
    name: item.name,
    brand_name: brandName,
    category,
    country: item.country,
    vintage: item.vintage,
    alcohol_content_percentage: item.alcohol_content_percentage,
    similarity_score: similarity,
    // Include the full item data for additional processing
    ...item,
  };
}

/**
 * Log search results for debugging
 */
function logSearchResults(
  searchResults: SearchResult[],
  itemType: string,
  searchType: string,
): void {
  console.log(
    `🔍 [${searchType}Search] Returning ${searchResults.length} filtered results for ${itemType}`,
  );

  // Log top results for debugging
  searchResults.slice(0, 3).forEach((result, index) => {
    console.log(
      `🔍 [${searchType}Search]   ${index + 1}. "${result.name}" (similarity: ${result.similarity_score?.toFixed(3)}, brand: ${result.brand_name || "N/A"})`,
    );
  });
}
