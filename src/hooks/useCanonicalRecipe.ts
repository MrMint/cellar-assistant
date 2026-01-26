import { useMemo } from "react";

export type RecipeWithVotes = {
  id: string;
  name: string;
  created_at: string;
  votes_aggregate: {
    aggregate: {
      count: number;
    };
  };
  upvotes?: number; // If available from separate query
  downvotes?: number; // If available from separate query
};

export type CanonicalRecipeResult = {
  canonicalRecipe: RecipeWithVotes | null;
  sortedRecipes: Array<
    RecipeWithVotes & {
      netScore: number;
      isCanonical: boolean;
      rank: number;
    }
  >;
  voteCounts: {
    [recipeId: string]: {
      upvotes: number;
      downvotes: number;
      netScore: number;
    };
  };
};

/**
 * Client-side canonical recipe determination
 * Replicates the server-side logic for determining canonical recipes
 * Useful for real-time UI updates and sorting
 */
export const useCanonicalRecipe = (
  recipes: RecipeWithVotes[],
  explicitCanonicalId?: string | null,
): CanonicalRecipeResult => {
  return useMemo(() => {
    if (!recipes || recipes.length === 0) {
      return {
        canonicalRecipe: null,
        sortedRecipes: [],
        voteCounts: {},
      };
    }

    // Calculate vote scores for each recipe
    const recipesWithScores = recipes.map((recipe) => {
      // If upvotes/downvotes are provided separately, use them
      // Otherwise, assume all votes are upvotes for basic calculation
      const upvotes = recipe.upvotes ?? recipe.votes_aggregate.aggregate.count;
      const downvotes = recipe.downvotes ?? 0;
      const netScore = upvotes - downvotes;

      return {
        ...recipe,
        upvotes,
        downvotes,
        netScore,
        isCanonical: false, // Will be set below
        rank: 0, // Will be set below
      };
    });

    // Sort recipes by net score (highest first) with creation date tiebreaker
    const sortedRecipes = [...recipesWithScores].sort((a, b) => {
      // Primary sort: net score (highest first)
      if (a.netScore !== b.netScore) {
        return b.netScore - a.netScore;
      }

      // Tiebreaker: creation date (oldest wins ties)
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    // Assign ranks
    sortedRecipes.forEach((recipe, index) => {
      recipe.rank = index + 1;
    });

    // Determine canonical recipe
    let canonicalRecipe:
      | (RecipeWithVotes & {
          netScore: number;
          isCanonical: boolean;
          rank: number;
        })
      | null = null;

    if (explicitCanonicalId) {
      // Use explicitly provided canonical ID
      canonicalRecipe =
        sortedRecipes.find((r) => r.id === explicitCanonicalId) || null;
    } else {
      // Use highest scoring recipe (first in sorted list)
      canonicalRecipe = sortedRecipes[0] || null;
    }

    // Mark canonical recipe
    if (canonicalRecipe) {
      const canonicalIndex = sortedRecipes.findIndex(
        (r) => r.id === canonicalRecipe?.id,
      );
      if (canonicalIndex >= 0) {
        sortedRecipes[canonicalIndex].isCanonical = true;
      }
    }

    // Create vote counts lookup
    const voteCounts: {
      [recipeId: string]: {
        upvotes: number;
        downvotes: number;
        netScore: number;
      };
    } = {};
    recipesWithScores.forEach((recipe) => {
      voteCounts[recipe.id] = {
        upvotes: recipe.upvotes,
        downvotes: recipe.downvotes,
        netScore: recipe.netScore,
      };
    });

    return {
      canonicalRecipe,
      sortedRecipes,
      voteCounts,
    };
  }, [recipes, explicitCanonicalId]);
};

/**
 * Calculate net score for a recipe given vote counts
 */
export const calculateNetScore = (
  upvotes: number,
  downvotes: number,
): number => {
  return upvotes - downvotes;
};

/**
 * Format vote count for display
 */
export const formatVoteCount = (count: number): string => {
  if (count === 0) return "0";
  if (count > 0) return `+${count}`;
  return count.toString();
};

/**
 * Determine if a recipe should be considered canonical based on voting
 */
export const isRecipeCanonical = (
  recipe: RecipeWithVotes,
  allRecipes: RecipeWithVotes[],
): boolean => {
  const canonical = useCanonicalRecipe(allRecipes).canonicalRecipe;
  return canonical ? canonical.id === recipe.id : false;
};

/**
 * Get recipe rank within a group based on vote score
 */
export const getRecipeRank = (
  recipeId: string,
  recipes: RecipeWithVotes[],
): number => {
  const { sortedRecipes } = useCanonicalRecipe(recipes);
  const recipe = sortedRecipes.find((r) => r.id === recipeId);
  return recipe?.rank || 0;
};
