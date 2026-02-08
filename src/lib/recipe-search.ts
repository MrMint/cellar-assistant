import { graphql } from "@cellar-assistant/shared/gql";
import { getCachedSearchVector } from "@/lib/cache";
import { adminQuery, serverQuery } from "@/lib/urql/server";

// Semantic recipe search using vector distance via Hasura
const SemanticRecipeSearchQuery = graphql(`
  query SemanticRecipeSearch(
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
  }
`);

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

// Perform semantic search using vector similarity via Hasura directly
async function performSemanticRecipeSearch(
  query: string,
  maxDistance: number,
  limit: number,
): Promise<RecipeSearchResults> {
  console.log(`🔍 [Recipe Search] Performing semantic search: "${query}"`);

  try {
    // Generate query vector via Next.js cache (24h TTL, shared across users)
    const cachedVector = await getCachedSearchVector(query.trim());

    if (!cachedVector) {
      console.warn(
        "Failed to generate search vector for semantic recipe search",
      );
      return await performTextRecipeSearch(query, limit);
    }

    const queryVector: number[] = JSON.parse(cachedVector);
    const queryVectorString = `[${queryVector.join(",")}]`;

    // Query recipe_vectors directly via Hasura
    const searchResult = await adminQuery(SemanticRecipeSearchQuery, {
      queryVector: queryVectorString,
      maxDistance,
      limit,
    });

    if (!searchResult?.recipe_vectors) {
      console.warn("No results from semantic recipe search");
      return await performTextRecipeSearch(query, limit);
    }

    const semanticResults: RecipeSearchResult[] =
      searchResult.recipe_vectors.map((rv) => {
        const distance =
          typeof rv.distance === "number"
            ? rv.distance
            : Number(rv.distance) || 0;
        const similarity = Math.max(0, Math.min(1, 1 - distance / 2));

        return {
          id: rv.recipe.id,
          name: rv.recipe.name,
          description: rv.recipe.description || undefined,
          type: rv.recipe.type as "cocktail",
          difficulty_level: rv.recipe.difficulty_level || undefined,
          prep_time_minutes: rv.recipe.prep_time_minutes || undefined,
          serving_size: rv.recipe.serving_size || undefined,
          image_url: rv.recipe.image_url || undefined,
          created_at: rv.recipe.created_at || new Date().toISOString(),
          ingredient_count: Array.isArray(rv.recipe.ingredients)
            ? rv.recipe.ingredients.length
            : 0,
          distance,
          matchReason: "semantic_match" as const,
          confidenceScore: similarity * 100,
        };
      });

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
