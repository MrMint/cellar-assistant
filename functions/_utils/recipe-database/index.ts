/**
 * Recipe Database Operations
 *
 * This module provides a clean API for recipe creation and management,
 * organized into focused sub-modules for better maintainability.
 */

// Export brand management functions
export {
  findOrCreateBrand,
  linkItemToBrand,
} from "./brand-management";
// Export ingredient processing functions
export { processRecipeIngredients } from "./ingredient-processing";
// Export item creation functions
export {
  createBasicGenericItem,
  createBeerWithAI,
  createCoffeeWithAI,
  createSpiritWithAI,
  createWineWithAI,
} from "./item-creators";
// Export main recipe creation functions
export {
  createRecipeFromExtracted,
  createRecipesFromExtracted,
} from "./recipe-creation";
export type {
  RecipeGroupCandidate,
  RecipeGroupCreationResult,
  RecipeGroupingResult,
} from "./recipe-group-creation";
// Export recipe group creation functions
export {
  createRecipeGroup,
  createRecipeWithGroup,
  createRecipeWithGrouping,
  determineGroupingAction,
  findSimilarRecipeGroups,
} from "./recipe-group-creation";
// Export types
export type {
  BatchRecipeCreationResult,
  IngredientProcessingResult,
  ItemCreationResult,
  RecipeCreationResult,
} from "./types";
