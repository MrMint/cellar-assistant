import { graphql } from "@cellar-assistant/shared";
import { makeServerClient } from "@/lib/urql/server-client";

// Query for semantic search of recipe groups
const _SemanticRecipeGroupSearchQuery = graphql(`
  query SemanticRecipeGroupSearch(
    $queryVector: vector!
    $limit: Int!
    $threshold: Float!
  ) {
    recipe_groups(
      order_by: {
        embedding: {
          similarity: {
            vector: $queryVector
            order: desc
          }
        }
      }
      where: {
        embedding: {
          similarity: {
            vector: $queryVector
            threshold: $threshold
          }
        }
      }
      limit: $limit
    ) {
      id
      name
      description
      category
      base_spirit
      tags
      image_url
      canonical_recipe_id
      canonical_recipe_rel {
        id
        name
        description
        image_url
        difficulty_level
        prep_time_minutes
        serving_size
      }
      recipes_aggregate {
        aggregate {
          count
        }
      }
      embedding_similarity: embedding(
        args: {
          query_vector: $queryVector
        }
      )
    }
  }
`);

// Query for finding similar recipes for grouping
const FindSimilarRecipesForGroupingQuery = graphql(`
  query FindSimilarRecipesForGrouping(
    $recipeName: String!
    $recipeDescription: String
    $placeId: uuid
    $limit: Int!
    $threshold: Float!
  ) {
    recipe_groups(
      where: {
        _or: [
          { name: { _ilike: $recipeName } }
          { description: { _ilike: $recipeDescription } }
          { canonical_recipe_rel: { name: { _ilike: $recipeName } } }
          {
            recipes: {
              menu_items: {
                place_id: { _eq: $placeId }
              }
            }
          }
        ]
      }
      limit: $limit
    ) {
      id
      name
      description
      category
      base_spirit
      canonical_recipe_id
      canonical_recipe_rel {
        id
        name
        description
        image_url
      }
      recipes_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`);

export type SemanticSearchResult = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  base_spirit?: string | null;
  tags?: string[] | null;
  image_url?: string | null;
  canonical_recipe_id?: string | null;
  canonical_recipe_rel?: {
    id: string;
    name: string;
    description?: string | null;
    image_url?: string | null;
    difficulty_level?: number | null;
    prep_time_minutes?: number | null;
    serving_size?: number | null;
  } | null;
  recipes_aggregate: {
    aggregate: {
      count: number;
    };
  };
  similarity_score: number;
};

export type RecipeGroupingCandidate = {
  recipeGroup: {
    id: string;
    name: string;
    description?: string | null;
    category: string;
    base_spirit?: string | null;
    canonical_recipe_rel?: {
      id: string;
      name: string;
      description?: string | null;
      image_url?: string | null;
    } | null;
    recipes_aggregate: {
      aggregate: {
        count: number;
      };
    };
  };
  similarity_score: number;
  confidence: "high" | "medium" | "low";
};

/**
 * Perform semantic search for recipe groups
 * This would be used for the main recipe search page
 */
export async function semanticRecipeGroupSearch(params: {
  query: string;
  limit?: number;
  threshold?: number;
}): Promise<SemanticSearchResult[]> {
  const { query, limit = 20, threshold = 0.3 } = params;

  try {
    // This is a placeholder - in a real implementation, you would:
    // 1. Generate embedding vector for the query using an AI service
    // 2. Execute the GraphQL query with the vector

    console.log("Semantic search for recipe groups:", {
      query,
      limit,
      threshold,
    });

    // For now, return empty results since we don't have vector generation set up
    // TODO: Implement vector generation and actual semantic search
    return [];
  } catch (error) {
    console.error("Error in semantic recipe group search:", error);
    throw new Error("Failed to perform semantic search");
  }
}

/**
 * Find similar recipe groups for grouping new recipes
 * This is used during menu scanning to detect duplicates
 */
export async function findSimilarRecipeGroupsForGrouping(params: {
  recipeName: string;
  recipeDescription?: string;
  placeId?: string;
  limit?: number;
}): Promise<RecipeGroupingCandidate[]> {
  const { recipeName, recipeDescription, placeId, limit = 10 } = params;

  try {
    const client = makeServerClient();

    // Use text-based similarity for now
    const searchPattern = `%${recipeName}%`;
    const descriptionPattern = recipeDescription
      ? `%${recipeDescription}%`
      : null;

    const result = await client.query(FindSimilarRecipesForGroupingQuery, {
      recipeName: searchPattern,
      recipeDescription: descriptionPattern,
      placeId: placeId || null,
      limit,
      threshold: 0.3,
    });

    if (result.error) {
      console.error("Error finding similar recipes:", result.error);
      return [];
    }

    const recipeGroups = result.data?.recipe_groups || [];

    // Calculate similarity scores based on name matching
    const candidates: RecipeGroupingCandidate[] = recipeGroups.map(
      (group: any) => {
        const similarity = calculateTextSimilarity(recipeName, group.name);
        const confidence = getConfidenceLevel(similarity);

        return {
          recipeGroup: group,
          similarity_score: similarity,
          confidence,
        };
      },
    );

    // Sort by similarity score (highest first)
    return candidates.sort((a, b) => b.similarity_score - a.similarity_score);
  } catch (error) {
    console.error("Error finding similar recipe groups:", error);
    throw new Error("Failed to find similar recipe groups");
  }
}

/**
 * Calculate text similarity between two strings
 * This is a simple implementation - in production, you'd use better algorithms
 */
function calculateTextSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 1.0;

  // Substring match
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter((word) => words2.includes(word));
  const wordSimilarity =
    commonWords.length / Math.max(words1.length, words2.length);

  return wordSimilarity;
}

/**
 * Get confidence level based on similarity score
 */
function getConfidenceLevel(similarity: number): "high" | "medium" | "low" {
  if (similarity >= 0.85) return "high";
  if (similarity >= 0.6) return "medium";
  return "low";
}

/**
 * Determine if recipes should be auto-grouped based on similarity
 */
export function shouldAutoGroup(similarity: number): boolean {
  return similarity >= 0.85; // Auto-group threshold from recipe-group-utils.ts
}

/**
 * Determine if user confirmation is needed for grouping
 */
export function needsUserConfirmation(similarity: number): boolean {
  return similarity >= 0.6 && similarity < 0.85;
}

/**
 * Generate recipe group suggestions for a new recipe
 */
export async function generateRecipeGroupSuggestions(params: {
  recipeName: string;
  recipeDescription?: string;
  placeId?: string;
}): Promise<{
  action: "auto-group" | "confirm" | "create-new";
  suggestions: RecipeGroupingCandidate[];
  bestMatch?: RecipeGroupingCandidate;
}> {
  const candidates = await findSimilarRecipeGroupsForGrouping(params);

  if (candidates.length === 0) {
    return {
      action: "create-new",
      suggestions: [],
    };
  }

  const bestMatch = candidates[0];
  const similarity = bestMatch.similarity_score;

  if (shouldAutoGroup(similarity)) {
    return {
      action: "auto-group",
      suggestions: candidates,
      bestMatch,
    };
  }

  if (needsUserConfirmation(similarity)) {
    return {
      action: "confirm",
      suggestions: candidates,
      bestMatch,
    };
  }

  return {
    action: "create-new",
    suggestions: candidates,
  };
}
