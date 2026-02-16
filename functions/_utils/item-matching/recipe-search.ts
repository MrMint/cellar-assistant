/**
 * Recipe vector search for matching cocktails/mixed drinks from menu scans.
 *
 * Mirrors the pattern from semanticRecipeSearch but returns SearchResult[]
 * for compatibility with the item matching pipeline.
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";
import { createAIProvider } from "../ai-providers/factory";
import { functionQuery, getAdminAuthHeaders } from "../urql-client";
import type { SearchResult } from "./types";

const RECIPE_VECTOR_SEARCH_QUERY = graphql(`
  query RecipeVectorSearchForMatching(
    $queryVector: halfvec!
    $maxDistance: float8!
    $limit: Int!
  ) {
    recipe_vectors(
      where: {
        distance: {
          arguments: { query_vector: $queryVector }
          _lte: $maxDistance
        }
      }
      order_by: [
        {
          distance: {
            arguments: { query_vector: $queryVector }
            order: asc
          }
        }
      ]
      limit: $limit
    ) {
      id
      recipe_id
      distance(args: { query_vector: $queryVector })
      recipe {
        id
        name
        description
        type
        recipe_group {
          id
          name
          category
          base_spirit
        }
      }
    }
  }
`);

/**
 * Search recipes using vector embeddings for semantic similarity.
 * Returns SearchResult[] compatible with the matching pipeline.
 */
export async function searchRecipesByVector(
  searchTerms: string,
  limit: number,
  similarityThreshold: number,
): Promise<SearchResult[]> {
  if (!searchTerms.trim()) {
    return [];
  }

  try {
    const aiProvider = await createAIProvider();
    if (!aiProvider.generateEmbeddings) {
      console.log(
        "[searchRecipesByVector] AI provider doesn't support embeddings",
      );
      return [];
    }

    const embeddingResponse = await aiProvider.generateEmbeddings({
      content: searchTerms,
      type: "text",
      taskType: "RETRIEVAL_QUERY",
    });

    if (
      !embeddingResponse?.embeddings ||
      embeddingResponse.embeddings.length === 0
    ) {
      console.log("[searchRecipesByVector] No embeddings generated");
      return [];
    }

    // Convert to vector string format for PostgreSQL halfvec
    const vectorString = `[${embeddingResponse.embeddings.join(",")}]`;

    // Cosine distance range: 0 (identical) to 2 (opposite)
    const maxDistance = 2 * (1 - similarityThreshold);

    const searchResult = await functionQuery(
      RECIPE_VECTOR_SEARCH_QUERY,
      { queryVector: vectorString, maxDistance, limit: limit * 2 },
      { headers: getAdminAuthHeaders() },
    );

    if (!searchResult?.recipe_vectors) {
      return [];
    }

    const results: SearchResult[] = (
      searchResult.recipe_vectors as Array<Record<string, unknown>>
    )
      .map((result: Record<string, unknown>): SearchResult | null => {
        const recipe = result.recipe as Record<string, unknown> | null;
        if (!recipe) return null;

        const distance =
          typeof result.distance === "number"
            ? result.distance
            : Number(result.distance) || 0;
        const similarity = Math.max(0, 1 - distance / 2);

        // gql.tada returns opaque types for nested selections; narrow with
        // a runtime check and cast (same pattern as extractIdName elsewhere).
        const rg = recipe.recipe_group as Record<string, unknown> | null;
        const recipeGroup =
          rg && typeof rg.name === "string"
            ? {
                name: rg.name,
                category: (rg.category as string | null) ?? null,
                base_spirit: (rg.base_spirit as string | null) ?? null,
              }
            : null;

        return {
          id: recipe.id as string,
          name: recipe.name as string,
          brand_name: recipeGroup?.name ?? null,
          category: recipeGroup?.category ?? null,
          country: null as string | null,
          vintage: null as string | number | null,
          alcohol_content_percentage: null as number | null,
          similarity_score: similarity,
          // Extra recipe-specific fields for confidence scoring
          description: recipe.description,
          type: recipe.type,
          base_spirit: recipeGroup?.base_spirit ?? null,
          itemType: "cocktail",
        };
      })
      .filter(
        (r: SearchResult | null): r is SearchResult =>
          r !== null && (r.similarity_score ?? 0) >= similarityThreshold,
      )
      .sort(
        (a: SearchResult, b: SearchResult) =>
          (b.similarity_score ?? 0) - (a.similarity_score ?? 0),
      )
      .slice(0, limit);

    console.log(
      `[searchRecipesByVector] Found ${results.length} recipe matches for "${searchTerms.substring(0, 100)}"`,
    );

    return results;
  } catch (error) {
    console.error("[searchRecipesByVector] Error:", error);
    return [];
  }
}
