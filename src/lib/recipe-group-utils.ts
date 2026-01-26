/**
 * Utility functions for recipe groups and voting
 */

export type RecipeWithVoteData = {
  id: string;
  name: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
};

/**
 * Get the canonical recipe from a list of recipes
 * Uses the same logic as the database trigger:
 * 1. Highest net vote score wins
 * 2. In case of tie, oldest recipe wins
 */
export const getCanonicalRecipe = (
  recipes: RecipeWithVoteData[],
): RecipeWithVoteData | null => {
  if (!recipes || recipes.length === 0) {
    return null;
  }

  // Sort by net score (descending), then by creation date (ascending)
  const sorted = [...recipes].sort((a, b) => {
    const netScoreA = calculateNetScore(a.upvotes, a.downvotes);
    const netScoreB = calculateNetScore(b.upvotes, b.downvotes);

    // Primary sort: net score (highest first)
    if (netScoreA !== netScoreB) {
      return netScoreB - netScoreA;
    }

    // Tiebreaker: creation date (oldest wins)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return sorted[0];
};

/**
 * Calculate net score (upvotes - downvotes)
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
 * Get vote color based on net score
 */
export const getVoteColor = (
  netScore: number,
): "success" | "danger" | "neutral" => {
  if (netScore > 0) return "success";
  if (netScore < 0) return "danger";
  return "neutral";
};

/**
 * Calculate voting statistics for a recipe group
 */
export const calculateGroupVotingStats = (recipes: RecipeWithVoteData[]) => {
  const totalRecipes = recipes.length;
  const totalUpvotes = recipes.reduce((sum, recipe) => sum + recipe.upvotes, 0);
  const totalDownvotes = recipes.reduce(
    (sum, recipe) => sum + recipe.downvotes,
    0,
  );
  const totalVotes = totalUpvotes + totalDownvotes;
  const netScore = totalUpvotes - totalDownvotes;
  const averageScore = totalRecipes > 0 ? netScore / totalRecipes : 0;

  // Find recipes with votes
  const recipesWithVotes = recipes.filter(
    (recipe) => recipe.upvotes > 0 || recipe.downvotes > 0,
  );

  // Calculate engagement (percentage of recipes with votes)
  const engagement =
    totalRecipes > 0 ? (recipesWithVotes.length / totalRecipes) * 100 : 0;

  return {
    totalRecipes,
    totalVotes,
    totalUpvotes,
    totalDownvotes,
    netScore,
    averageScore,
    engagement,
    recipesWithVotes: recipesWithVotes.length,
  };
};

/**
 * Rank recipes within a group by vote score
 */
export const rankRecipes = (
  recipes: RecipeWithVoteData[],
): Array<RecipeWithVoteData & { rank: number; netScore: number }> => {
  const recipesWithScores = recipes.map((recipe) => ({
    ...recipe,
    netScore: calculateNetScore(recipe.upvotes, recipe.downvotes),
  }));

  // Sort by net score (descending), then by creation date (ascending)
  const sorted = recipesWithScores.sort((a, b) => {
    if (a.netScore !== b.netScore) {
      return b.netScore - a.netScore;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Assign ranks (handling ties)
  let currentRank = 1;
  const ranked = sorted.map((recipe, index) => {
    if (index > 0 && recipe.netScore !== sorted[index - 1].netScore) {
      currentRank = index + 1;
    }
    return {
      ...recipe,
      rank: currentRank,
    };
  });

  return ranked;
};

/**
 * Check if a recipe is the canonical recipe in its group
 */
export const isCanonicalRecipe = (
  recipeId: string,
  recipes: RecipeWithVoteData[],
): boolean => {
  const canonical = getCanonicalRecipe(recipes);
  return canonical ? canonical.id === recipeId : false;
};

/**
 * Get similarity thresholds for recipe grouping
 */
export const RECIPE_SIMILARITY_THRESHOLDS = {
  AUTO_MATCH: 0.85, // Automatically group recipes with similarity >= 85%
  USER_CONFIRMATION: 0.6, // Show confirmation screen for similarity >= 60%
  MIN_SIMILARITY: 0.3, // Don't show matches below 30% similarity
} as const;

/**
 * Determine action based on similarity score
 */
export const getSimilarityAction = (
  similarity: number,
): "auto-match" | "confirm" | "create-new" => {
  if (similarity >= RECIPE_SIMILARITY_THRESHOLDS.AUTO_MATCH) {
    return "auto-match";
  }
  if (similarity >= RECIPE_SIMILARITY_THRESHOLDS.USER_CONFIRMATION) {
    return "confirm";
  }
  return "create-new";
};

/**
 * Get confidence level based on similarity score
 */
export const getConfidenceLevel = (
  similarity: number,
): "high" | "medium" | "low" => {
  if (similarity >= RECIPE_SIMILARITY_THRESHOLDS.AUTO_MATCH) {
    return "high";
  }
  if (similarity >= 0.75) {
    return "medium";
  }
  return "low";
};

/**
 * Format similarity score as percentage
 */
export const formatSimilarity = (similarity: number): string => {
  return `${Math.round(similarity * 100)}%`;
};

/**
 * Generate recipe group name from canonical recipe
 */
export const generateGroupName = (canonicalRecipeName: string): string => {
  // Remove version indicators and clean up the name
  return canonicalRecipeName
    .replace(/\s+v\d+$/i, "") // Remove version like "v1", "v2"
    .replace(/\s+version\s+\d+$/i, "") // Remove "version 1", "version 2"
    .replace(/\s+\(.*\)$/, "") // Remove parenthetical info
    .trim();
};

/**
 * Validate recipe group data
 */
export const validateRecipeGroup = (groupData: {
  name: string;
  category: string;
  recipes: RecipeWithVoteData[];
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!groupData.name || groupData.name.trim().length === 0) {
    errors.push("Recipe group name is required");
  }

  if (!groupData.category || groupData.category.trim().length === 0) {
    errors.push("Recipe category is required");
  }

  if (!groupData.recipes || groupData.recipes.length === 0) {
    errors.push("At least one recipe is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
