import { graphql } from "@cellar-assistant/shared/gql";
import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
import { isNil } from "ramda";
import { serverQuery } from "@/lib/urql/server";

// Standard recipe search query
const SearchRecipesQuery = graphql(`
  query SearchRecipes($searchText: String) {
    recipes(
      where: {
        _or: [
          { name: { _ilike: $searchText } }
          { description: { _ilike: $searchText } }
          { type: { _ilike: $searchText } }
        ]
      }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      type
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      created_at
      ingredients {
        id
      }
    }
  }
`);

// Get all recipes query
const GetAllRecipesQuery = graphql(`
  query GetAllRecipes($limit: Int) {
    recipes(
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      name
      description
      type
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      created_at
      ingredients {
        id
      }
    }
  }
`);

// Types for recipe search
export interface RecipeSearchResult {
  id: string;
  name: string;
  description?: string;
  type: "cocktail";
  difficulty_level?: number;
  prep_time_minutes?: number;
  serving_size?: number;
  image_url?: string;
  created_at: string | null;
  ingredient_count: number;
  // For semantic search results
  distance?: number;
  matchReason?: "semantic_match" | "text_match";
  confidenceScore?: number;
}

export interface RecipeSearchParams {
  query?: string;
  semanticQuery?: string;
  limit?: number;
  maxSemanticDistance?: number;
}

export interface RecipeSearchResults {
  recipes: RecipeSearchResult[];
  isSemanticSearch: boolean;
  totalResults: number;
}

/**
 * Server-side recipe search utility function
 * This is NOT a server action - it's a regular async function for server components
 */
export async function searchRecipes(
  params: RecipeSearchParams,
): Promise<RecipeSearchResults> {
  const {
    query,
    semanticQuery,
    limit = 50,
    maxSemanticDistance = 0.8,
  } = params;

  console.log(`🔍 [Recipe Search] Search with params:`, {
    query: query || "none",
    semanticQuery: semanticQuery || "none",
    limit,
  });

  try {
    // Handle semantic search
    if (semanticQuery && semanticQuery.trim().length > 0) {
      return await performSemanticRecipeSearch(
        semanticQuery,
        maxSemanticDistance,
        limit,
      );
    }

    // Handle standard text search
    if (query && query.trim().length > 0) {
      return await performTextRecipeSearch(query, limit);
    }

    // No search query - return all recipes
    return await getAllRecipes(limit);
  } catch (error) {
    console.error("❌ [Recipe Search] Search error:", error);

    // Return empty results on error instead of throwing
    return {
      recipes: [],
      isSemanticSearch: !!semanticQuery,
      totalResults: 0,
    };
  }
}

// Perform semantic search using vector similarity
async function performSemanticRecipeSearch(
  query: string,
  maxDistance: number,
  limit: number,
): Promise<RecipeSearchResults> {
  console.log(`🔍 [Recipe Search] Performing semantic search: "${query}"`);

  try {
    // Generate vector for the query
    const vectorData = await serverQuery(getSearchVectorQuery, {
      text: query.trim(),
    });

    if (isNil(vectorData?.create_search_vector)) {
      console.warn(
        "Failed to generate search vector for semantic recipe search",
      );
      // Fall back to text search
      return await performTextRecipeSearch(query, limit);
    }

    // Call semantic recipe search Nhost function
    const nhostFunctionUrl =
      process.env.NHOST_FUNCTION_URL || "https://local.functions.nhost.run";

    const response = await fetch(
      `${nhostFunctionUrl}/v1/functions/semanticRecipeSearch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "nhost-webhook-secret": process.env.NHOST_WEBHOOK_SECRET || "",
        },
        body: JSON.stringify({
          input: {
            query: query.trim(),
            maxDistance,
            limit,
          },
        }),
      },
    );

    if (!response.ok) {
      console.error(
        `Semantic recipe search failed: ${response.status} ${response.statusText}`,
      );
      // Fall back to text search
      return await performTextRecipeSearch(query, limit);
    }

    const result = await response.json();

    if (!result.success) {
      console.warn("Semantic recipe search returned unsuccessful result");
      // Fall back to text search
      return await performTextRecipeSearch(query, limit);
    }

    const semanticResults: RecipeSearchResult[] = result.recipes.map(
      (recipe: {
        id: string;
        name: string;
        description?: string;
        type: "cocktail";
        difficulty_level?: number;
        prep_time_minutes?: number;
        serving_size?: number;
        image_url?: string;
        created_at?: string;
        ingredients?: Array<{ id: string }>;
        distance?: number;
        confidenceScore?: number;
      }) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        type: recipe.type as "cocktail",
        difficulty_level: recipe.difficulty_level,
        prep_time_minutes: recipe.prep_time_minutes,
        serving_size: recipe.serving_size,
        image_url: recipe.image_url,
        created_at: recipe.created_at || new Date().toISOString(),
        ingredient_count: Array.isArray(recipe.ingredients)
          ? recipe.ingredients.length
          : 0,
        distance: recipe.distance || 0,
        matchReason: "semantic_match" as const,
        confidenceScore: recipe.confidenceScore || 0,
      }),
    );

    console.log(
      `✅ [Recipe Search] Semantic search found ${semanticResults.length} recipes`,
    );

    return {
      recipes: semanticResults,
      isSemanticSearch: true,
      totalResults: semanticResults.length,
    };
  } catch (error) {
    console.error("❌ [Recipe Search] Semantic search error:", error);
    // Fall back to text search
    return await performTextRecipeSearch(query, limit);
  }
}

// Perform standard text-based search
async function performTextRecipeSearch(
  query: string,
  limit: number,
): Promise<RecipeSearchResults> {
  console.log(`🔍 [Recipe Search] Performing text search: "${query}"`);

  const searchText = `%${query.trim()}%`;

  const searchResult = await serverQuery(SearchRecipesQuery, {
    searchText,
  });

  if (!searchResult?.recipes || !Array.isArray(searchResult.recipes)) {
    throw new Error("No recipe data returned");
  }

  const recipes: RecipeSearchResult[] = searchResult.recipes
    .slice(0, limit)
    .map((recipe: any) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description || undefined,
      type: recipe.type as "cocktail",
      difficulty_level: recipe.difficulty_level || undefined,
      prep_time_minutes: recipe.prep_time_minutes || undefined,
      serving_size: recipe.serving_size || undefined,
      image_url: recipe.image_url || undefined,
      created_at: recipe.created_at || new Date().toISOString(),
      ingredient_count: Array.isArray(recipe.ingredients)
        ? recipe.ingredients.length
        : 0,
      matchReason: "text_match" as const,
    }));

  console.log(`✅ [Recipe Search] Text search found ${recipes.length} recipes`);

  return {
    recipes,
    isSemanticSearch: false,
    totalResults: recipes.length,
  };
}

// Get all recipes when no search query is provided
async function getAllRecipes(limit: number): Promise<RecipeSearchResults> {
  console.log(`🔍 [Recipe Search] Getting all recipes (limit: ${limit})`);

  const searchResult = await serverQuery(GetAllRecipesQuery, {
    limit,
  });

  if (!searchResult?.recipes || !Array.isArray(searchResult.recipes)) {
    throw new Error("No recipe data returned");
  }

  const recipes: RecipeSearchResult[] = searchResult.recipes.map(
    (recipe: any) => ({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description || undefined,
      type: recipe.type as "cocktail",
      difficulty_level: recipe.difficulty_level || undefined,
      prep_time_minutes: recipe.prep_time_minutes || undefined,
      serving_size: recipe.serving_size || undefined,
      image_url: recipe.image_url || undefined,
      created_at: recipe.created_at || new Date().toISOString(),
      ingredient_count: Array.isArray(recipe.ingredients)
        ? recipe.ingredients.length
        : 0,
    }),
  );

  console.log(`✅ [Recipe Search] Retrieved ${recipes.length} recipes`);

  return {
    recipes,
    isSemanticSearch: false,
    totalResults: recipes.length,
  };
}
