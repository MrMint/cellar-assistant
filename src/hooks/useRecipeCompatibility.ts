"use client";

import { graphql } from "@cellar-assistant/shared";
import { useMemo } from "react";
import { useQuery } from "urql";
import {
  analyzeRecipeCompatibility,
  type CellarItem,
  type RecipeCompatibility,
  type RecipeIngredient,
} from "@/lib/recipe-compatibility";

// GraphQL query to get user's cellar items for compatibility analysis
const GetUserCellarItemsQuery = graphql(`
  query GetUserCellarItems($userId: uuid!) {
    cellar_items(
      where: {
        cellar: { created_by_id: { _eq: $userId } }
        empty_at: { _is_null: true }
        percentage_remaining: { _gt: 5 }
      }
    ) {
      id
      wine_id
      beer_id
      spirit_id
      coffee_id
      percentage_remaining
      wine {
        id
        name
        vintage
        style
      }
      beer {
        id
        name
        style
      }
      spirit {
        id
        name
        type
      }
      coffee {
        id
        name
        roast_level
      }
    }
  }
`);

// GraphQL query to get recipe with full ingredient details
const GetRecipeIngredientsQuery = graphql(`
  query GetRecipeIngredients($recipeId: uuid!) {
    recipes_by_pk(id: $recipeId) {
      id
      name
      ingredients: recipe_ingredients {
        id
        quantity
        unit
        is_optional
        substitution_notes
        wine_id
        beer_id
        spirit_id
        coffee_id
        generic_item_id
        wine {
          id
          name
          vintage
          style
        }
        beer {
          id
          name
          style
        }
        spirit {
          id
          name
          type
        }
        coffee {
          id
          name
          roast_level
        }
        generic_item {
          id
          name
          category
          subcategory
          item_type
        }
      }
    }
  }
`);

export type UseRecipeCompatibilityOptions = {
  userId?: string;
  includeShoppingList?: boolean;
  semanticThreshold?: number;
  allowCrossTypeSubstitution?: boolean;
  enabled?: boolean;
};

export type UseRecipeCompatibilityResult = {
  compatibility: RecipeCompatibility | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to analyze recipe compatibility with user's cellar
 */
export function useRecipeCompatibility(
  recipeId: string,
  options: UseRecipeCompatibilityOptions = {},
): UseRecipeCompatibilityResult {
  const {
    userId,
    includeShoppingList = false,
    semanticThreshold = 70,
    allowCrossTypeSubstitution = false,
    enabled = true,
  } = options;

  // Get user's cellar items
  const [cellarResult] = useQuery({
    query: GetUserCellarItemsQuery,
    variables: { userId: userId || "" },
    pause: !enabled || !userId,
  });

  // Get recipe ingredients
  const [recipeResult] = useQuery({
    query: GetRecipeIngredientsQuery,
    variables: { recipeId },
    pause: !enabled || !recipeId,
  });

  // Calculate compatibility when data is available
  const compatibility = useMemo(() => {
    if (
      !recipeResult.data?.recipes_by_pk?.ingredients ||
      !cellarResult.data?.cellar_items
    ) {
      return null;
    }

    const recipeIngredients: RecipeIngredient[] = recipeResult.data
      .recipes_by_pk.ingredients as RecipeIngredient[];
    const cellarItems: CellarItem[] = cellarResult.data.cellar_items;

    return analyzeRecipeCompatibility(recipeIngredients, cellarItems, {
      includeShoppingList,
      semanticThreshold,
      allowCrossTypeSubstitution,
    });
  }, [
    recipeResult.data,
    cellarResult.data,
    includeShoppingList,
    semanticThreshold,
    allowCrossTypeSubstitution,
  ]);

  const isLoading = cellarResult.fetching || recipeResult.fetching;
  const error = cellarResult.error || recipeResult.error;

  const refetch = () => {
    // URQL refetch - property may not be available in newer versions
    // Consider implementing manual refresh logic if needed
  };

  return {
    compatibility,
    isLoading,
    error: error || null,
    refetch,
  };
}

/**
 * Hook to analyze compatibility for multiple recipes at once
 */
export function useMultipleRecipeCompatibility(
  recipeIds: string[],
  options: UseRecipeCompatibilityOptions = {},
): {
  compatibilities: Record<string, RecipeCompatibility>;
  isLoading: boolean;
  error: Error | null;
} {
  const {
    userId,
    includeShoppingList = false,
    semanticThreshold = 70,
    allowCrossTypeSubstitution = false,
    enabled = true,
  } = options;

  // Get user's cellar items (shared across all recipes)
  const [cellarResult] = useQuery({
    query: GetUserCellarItemsQuery,
    variables: { userId: userId || "" },
    pause: !enabled || !userId,
  });

  // Get all recipes with ingredients
  const GetMultipleRecipesQuery = useMemo(
    () =>
      graphql(`
    query GetMultipleRecipes($recipeIds: [uuid!]!) {
      recipes(where: { id: { _in: $recipeIds } }) {
        id
        name
        ingredients: recipe_ingredients {
          id
          quantity
          unit
          is_optional
          substitution_notes
          wine_id
          beer_id
          spirit_id
          coffee_id
          generic_item_id
          wine {
            id
            name
            vintage
            style
          }
          beer {
            id
            name
            style
          }
          spirit {
            id
            name
            type
          }
          coffee {
            id
            name
            roast_level
          }
          generic_item {
            id
            name
            category
            subcategory
            item_type
          }
        }
      }
    }
  `),
    [],
  );

  const [recipesResult] = useQuery({
    query: GetMultipleRecipesQuery,
    variables: { recipeIds },
    pause: !enabled || recipeIds.length === 0,
  });

  // Calculate compatibility for each recipe
  const compatibilities = useMemo(() => {
    const result: Record<string, RecipeCompatibility> = {};

    if (!recipesResult.data?.recipes || !cellarResult.data?.cellar_items) {
      return result;
    }

    const cellarItems: CellarItem[] = cellarResult.data.cellar_items;

    for (const recipe of recipesResult.data.recipes) {
      const recipeIngredients: RecipeIngredient[] =
        recipe.ingredients as RecipeIngredient[];

      result[recipe.id] = analyzeRecipeCompatibility(
        recipeIngredients,
        cellarItems,
        {
          includeShoppingList,
          semanticThreshold,
          allowCrossTypeSubstitution,
        },
      );
    }

    return result;
  }, [
    recipesResult.data,
    cellarResult.data,
    includeShoppingList,
    semanticThreshold,
    allowCrossTypeSubstitution,
  ]);

  const isLoading = cellarResult.fetching || recipesResult.fetching;
  const error = cellarResult.error || recipesResult.error || null;

  return {
    compatibilities,
    isLoading,
    error,
  };
}

/**
 * Hook to get recipe recommendations based on cellar contents
 */
export function useRecipeRecommendations(
  options: UseRecipeCompatibilityOptions & {
    limit?: number;
    minCompatibilityScore?: number;
    recipeTypes?: ("food" | "cocktail")[];
  } = {},
) {
  const {
    userId,
    enabled = true,
    limit = 10,
    minCompatibilityScore = 60,
    recipeTypes = ["cocktail"],
    semanticThreshold = 70,
    allowCrossTypeSubstitution = false,
  } = options;

  // Get all recipes with basic info
  const GetRecipesForRecommendationsQuery = useMemo(
    () =>
      graphql(`
    query GetRecipesForRecommendations($limit: Int!, $types: [String!]!) {
      recipes(
        where: { type: { _in: $types } }
        limit: $limit
        order_by: { created_at: desc }
      ) {
        id
        name
        type
        difficulty_level
        image_url
        ingredients: recipe_ingredients {
          id
          quantity
          unit
          is_optional
          substitution_notes
          wine_id
          beer_id
          spirit_id
          coffee_id
          generic_item_id
          wine {
            id
            name
            vintage
            style
          }
          beer {
            id
            name
            style
          }
          spirit {
            id
            name
            type
          }
          coffee {
            id
            name
            roast_level
          }
          generic_item {
            id
            name
            category
            subcategory
            item_type
          }
        }
      }
    }
  `),
    [],
  );

  const [recipesResult] = useQuery({
    query: GetRecipesForRecommendationsQuery,
    variables: { limit: limit * 2, types: recipeTypes }, // Get more than needed for filtering
    pause: !enabled,
  });

  // Use the multiple recipe compatibility hook
  const recipeIds = recipesResult.data?.recipes?.map((r) => r.id) || [];
  const { compatibilities, isLoading: compatibilityLoading } =
    useMultipleRecipeCompatibility(recipeIds, {
      userId,
      semanticThreshold,
      allowCrossTypeSubstitution,
      enabled: enabled && recipeIds.length > 0,
    });

  // Filter and sort recipes by compatibility
  const recommendations = useMemo(() => {
    if (!recipesResult.data?.recipes) return [];

    return recipesResult.data.recipes
      .map((recipe) => ({
        ...recipe,
        compatibility: compatibilities[recipe.id],
      }))
      .filter(
        (recipe) =>
          recipe.compatibility &&
          recipe.compatibility.overall_score >= minCompatibilityScore,
      )
      .sort((a, b) => {
        // Sort by compatibility score first, then by can_make status
        const scoreA = a.compatibility?.overall_score || 0;
        const scoreB = b.compatibility?.overall_score || 0;
        const canMakeA = a.compatibility?.can_make ? 1 : 0;
        const canMakeB = b.compatibility?.can_make ? 1 : 0;

        if (canMakeA !== canMakeB) return canMakeB - canMakeA;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }, [recipesResult.data, compatibilities, minCompatibilityScore, limit]);

  return {
    recommendations,
    isLoading: recipesResult.fetching || compatibilityLoading,
    error: recipesResult.error,
    refetch: () => {
      // URQL refetch - property may not be available in newer versions
      // Consider implementing manual refresh logic if needed
    },
  };
}
