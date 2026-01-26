/**
 * Utility functions for text matching and similarity calculations
 */

/**
 * Build comprehensive search terms from item request
 */
export function buildSearchTerms(request: {
  name: string;
  brand_name?: string;
  product_name?: string;
  generic_name?: string;
  category?: string;
  subcategory?: string;
  style?: string;
  variety?: string;
}): string {
  const terms = [
    request.name,
    request.brand_name,
    request.product_name,
    request.generic_name,
    request.category,
    request.subcategory,
    request.style,
    request.variety,
  ].filter(Boolean);

  // Remove duplicates and join
  const uniqueTerms = Array.from(new Set(terms.filter(Boolean)));
  return uniqueTerms.join(" ").trim();
}

/**
 * Calculate string similarity using Levenshtein distance
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;

  const distance = levenshteinDistance(str1, str2);
  return (maxLength - distance) / maxLength;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];

  // Create matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Extract search words from a search term, filtering out short words
 */
export function extractSearchWords(
  searchTerm: string,
  minLength = 2,
): string[] {
  return searchTerm
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > minLength);
}

/**
 * Calculate word-based similarity between two texts
 */
export function calculateWordSimilarity(text1: string, text2: string): number {
  const words1 = extractSearchWords(text1);
  const words2 = extractSearchWords(text2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const matchingWords = words1.filter((word1) =>
    words2.some((word2) => word1.includes(word2) || word2.includes(word1)),
  );

  return matchingWords.length / Math.max(words1.length, words2.length);
}
