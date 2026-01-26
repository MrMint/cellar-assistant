/**
 * Types for Recipe Database Operations
 */

export interface RecipeCreationResult {
  success: boolean;
  recipeId?: string;
  recipeName: string;
  ingredientsCreated?: number;
  instructionsCreated?: number;
  itemsCreated?: number;
  brandsCreated?: number;
  error?: string;
}

export interface BatchRecipeCreationResult {
  success: boolean;
  recipesCreated: number;
  totalIngredients: number;
  enhancementsApplied: number;
  results: RecipeCreationResult[];
}

export interface IngredientProcessingResult {
  successCount: number;
  itemsCreated: number;
  brandsCreated: number;
}

export interface ItemCreationResult {
  itemCreated: boolean;
  brandCreated: boolean;
}
