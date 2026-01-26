import { searchPlacesByText } from "@/app/(authenticated)/map/actions";
import type { MapBounds, SemanticPlaceResult } from "../types";

// Re-export the result type from the server action for consistency
export type SemanticSearchResult = SemanticPlaceResult;

export interface SemanticSearchResponse {
  success: boolean;
  places: SemanticSearchResult[];
}

// Service for performing semantic place searches
export class SemanticSearchService {
  /**
   * Perform a semantic search for places using server action
   */
  async searchPlaces(
    query: string,
    bounds: MapBounds,
    options: {
      maxDistance?: number;
      limit?: number;
    } = {},
  ): Promise<SemanticSearchResponse> {
    const { maxDistance = 0.8, limit = 20 } = options;

    try {
      const places = await searchPlacesByText({
        query: query.trim(),
        bounds: {
          north: bounds.north,
          south: bounds.south,
          east: bounds.east,
          west: bounds.west,
        },
        maxDistance,
        limit,
      });

      return {
        success: true,
        places,
      };
    } catch (error) {
      console.error("Semantic search error:", error);
      throw new Error(
        error instanceof Error
          ? `Semantic search failed: ${error.message}`
          : "Semantic search failed with unknown error",
      );
    }
  }

  /**
   * Analyze query to suggest search improvements
   */
  analyzeQuery(query: string): {
    itemTypes: ("wine" | "beer" | "spirits" | "coffee")[];
    suggestions: string[];
    isSpecific: boolean;
  } {
    const lowerQuery = query.toLowerCase();
    const itemTypes: ("wine" | "beer" | "spirits" | "coffee")[] = [];
    const suggestions: string[] = [];

    // Detect item types in query
    if (
      lowerQuery.includes("wine") ||
      lowerQuery.includes("pinot") ||
      lowerQuery.includes("cabernet") ||
      lowerQuery.includes("chardonnay")
    ) {
      itemTypes.push("wine");
    }
    if (
      lowerQuery.includes("beer") ||
      lowerQuery.includes("ipa") ||
      lowerQuery.includes("lager") ||
      lowerQuery.includes("stout")
    ) {
      itemTypes.push("beer");
    }
    if (
      lowerQuery.includes("whiskey") ||
      lowerQuery.includes("bourbon") ||
      lowerQuery.includes("gin") ||
      lowerQuery.includes("vodka") ||
      lowerQuery.includes("cocktail")
    ) {
      itemTypes.push("spirits");
    }
    if (
      lowerQuery.includes("coffee") ||
      lowerQuery.includes("espresso") ||
      lowerQuery.includes("latte") ||
      lowerQuery.includes("ethiopian")
    ) {
      itemTypes.push("coffee");
    }

    // Provide search suggestions
    if (query.length < 3) {
      suggestions.push(
        'Try a more specific search like "Italian wine" or "craft beer"',
      );
    }

    if (itemTypes.length === 0) {
      suggestions.push(
        'Try searching for specific items like "Pinot Noir", "IPA beer", or "Ethiopian coffee"',
      );
    }

    if (itemTypes.length > 1) {
      suggestions.push(
        "Your search covers multiple item types - results will include places serving any of them",
      );
    }

    const isSpecific = query.length > 5 && itemTypes.length > 0;

    return { itemTypes, suggestions, isSpecific };
  }
}

// Export a default instance
export const semanticSearchService = new SemanticSearchService();
