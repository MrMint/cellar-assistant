/**
 * Database operations and result generation for recipe photo processing
 */
import { createRecipeWithGrouping } from "../_utils/recipe-database/recipe-group-creation";
import type { AIProcessingResult, PlaceData } from "./_ai-processing";
import type { EnhancedExtractedRecipe } from "./_schemas";
import type { ProcessingSetup } from "./_validation";

export interface RecipeSaveResult {
  recipeId: string | null;
  recipeName: string;
  success: boolean;
  ingredientsCreated: number;
  instructionsCreated: number;
  itemsCreated: number;
  brandsCreated: number;
  groupId: string | null;
  groupAction: string;
  isNewGroup: boolean;
  groupingSuggestions: number;
  error: string | null;
}

export interface DatabaseOperationsResult {
  success: boolean;
  recipesCreated: number;
  totalIngredients: number;
  totalInstructions: number;
  totalItemsCreated: number;
  totalBrandsCreated: number;
  enhancementsApplied: number;
  groupingStats: {
    newGroupsCreated: number;
    recipesAutoGrouped: number;
    recipesRequiringConfirmation: number;
  };
  results: RecipeSaveResult[];
  menuAnalysis: {
    restaurant_type: string | null;
    recipes_extracted: number;
    recipes_saved: number;
    extraction_method: string;
  };
}

/**
 * Log enum gaps for future database updates
 */
function logEnumGaps(
  suggestions: {
    spirit_types?: string[];
    wine_styles?: string[];
    wine_varieties?: string[];
    beer_styles?: string[];
    coffee_roast_levels?: string[];
  },
  recipeName: string,
): void {
  console.log(
    `🔍 [EnumGaps] Potential missing enums in recipe "${recipeName}":`,
  );

  if (suggestions.spirit_types?.length) {
    console.log(
      `🥃 [EnumGaps] Spirit types: ${suggestions.spirit_types.join(", ")}`,
    );
  }
  if (suggestions.wine_styles?.length) {
    console.log(
      `🍷 [EnumGaps] Wine styles: ${suggestions.wine_styles.join(", ")}`,
    );
  }
  if (suggestions.wine_varieties?.length) {
    console.log(
      `🍇 [EnumGaps] Wine varieties: ${suggestions.wine_varieties.join(", ")}`,
    );
  }
  if (suggestions.beer_styles?.length) {
    console.log(
      `🍺 [EnumGaps] Beer styles: ${suggestions.beer_styles.join(", ")}`,
    );
  }
  if (suggestions.coffee_roast_levels?.length) {
    console.log(
      `☕ [EnumGaps] Coffee roast levels: ${suggestions.coffee_roast_levels.join(", ")}`,
    );
  }
}

/**
 * Log detailed recipe confidence information
 */
function logRecipeConfidenceDetails(recipes: EnhancedExtractedRecipe[]): void {
  recipes.forEach((recipe, index) => {
    console.log(
      `📋 [RecipeProcessor] Recipe ${index + 1}: "${recipe.name}" (${recipe.type}, difficulty: ${recipe.difficulty_level}, ${recipe.ingredients?.length || 0} ingredients)`,
    );
    console.log(
      `📊 [RecipeProcessor] Recipe confidence: ${recipe.confidence} (threshold for processing: 0.7)`,
    );

    // Log ingredient-level confidence scores
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      console.log(`📊 [RecipeProcessor] Ingredient confidence scores:`);
      recipe.ingredients.forEach((ingredient, ingredientIndex) => {
        console.log(
          `📊 [RecipeProcessor]   ${ingredientIndex + 1}. "${ingredient.name}" - creation_confidence: ${ingredient.creation_confidence || "N/A"}, should_be_specific: ${ingredient.should_be_specific}, type: ${ingredient.database_item_type}`,
        );
        if (ingredient.brand_name) {
          console.log(
            `📊 [RecipeProcessor]      Brand: "${ingredient.brand_name}" (confidence affects item creation)`,
          );
        }
      });
    }

    // Log enum gap suggestions if any
    if (recipe.missing_enum_suggestions) {
      logEnumGaps(recipe.missing_enum_suggestions, recipe.name);
    }
  });
}

/**
 * Save recipes to database with comprehensive error handling
 */
export async function saveRecipesToDatabase(
  setup: ProcessingSetup,
  aiResult: AIProcessingResult,
  placeData: PlaceData | null,
): Promise<DatabaseOperationsResult> {
  const { request } = setup;
  const { recipes } = aiResult;

  // Log recipe summary with enhancements and detailed confidence tracking
  logRecipeConfidenceDetails(recipes);

  // Save recipes to database using our new system
  console.log("💾 [RecipeProcessor] Starting database save operations");
  const results: RecipeSaveResult[] = [];
  let totalIngredientsCreated = 0;
  let totalInstructionsCreated = 0;
  let totalItemsCreated = 0;
  let totalBrandsCreated = 0;

  for (const recipe of recipes) {
    try {
      console.log(`💾 [RecipeProcessor] Saving recipe: ${recipe.name}`);

      const saveResult = await createRecipeWithGrouping(
        recipe,
        request.userId,
        {
          placeId: request.placeId,
        },
      );

      console.log(
        `✅ [RecipeProcessor] Recipe ${recipe.name} saved successfully`,
      );
      console.log(`📊 [RecipeProcessor] - Recipe ID: ${saveResult.recipeId}`);
      console.log(`📊 [RecipeProcessor] - Group ID: ${saveResult.groupId}`);
      console.log(
        `📊 [RecipeProcessor] - Group Action: ${saveResult.grouping.action}`,
      );
      console.log(
        `📊 [RecipeProcessor] - New Group: ${saveResult.isNewGroup ? "Yes" : "No"}`,
      );
      console.log(
        `📊 [RecipeProcessor] - Ingredients created: ${saveResult.ingredientsCreated || 0}`,
      );
      console.log(
        `📊 [RecipeProcessor] - Instructions created: ${saveResult.instructionsCreated || 0}`,
      );
      console.log(
        `📊 [RecipeProcessor] - Items created: ${saveResult.itemsCreated || 0}`,
      );
      console.log(
        `📊 [RecipeProcessor] - Brands created: ${saveResult.brandsCreated || 0}`,
      );

      // Add to totals
      totalIngredientsCreated += saveResult.ingredientsCreated || 0;
      totalInstructionsCreated += saveResult.instructionsCreated || 0;
      totalItemsCreated += saveResult.itemsCreated || 0;
      totalBrandsCreated += saveResult.brandsCreated || 0;

      results.push({
        recipeId: saveResult.recipeId,
        recipeName: recipe.name,
        success: true,
        ingredientsCreated: saveResult.ingredientsCreated || 0,
        instructionsCreated: saveResult.instructionsCreated || 0,
        itemsCreated: saveResult.itemsCreated || 0,
        brandsCreated: saveResult.brandsCreated || 0,
        groupId: saveResult.groupId,
        groupAction: saveResult.grouping.action,
        isNewGroup: saveResult.isNewGroup,
        groupingSuggestions: saveResult.grouping.suggestions?.length || 0,
        error: null,
      });
    } catch (error) {
      console.error(
        `❌ [RecipeProcessor] Failed to save recipe ${recipe.name}:`,
        error,
      );

      results.push({
        recipeId: null,
        recipeName: recipe.name,
        success: false,
        ingredientsCreated: 0,
        instructionsCreated: 0,
        itemsCreated: 0,
        brandsCreated: 0,
        groupId: null,
        groupAction: "create-new",
        isNewGroup: false,
        groupingSuggestions: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Calculate enhanced metrics
  const enhancementsApplied = totalItemsCreated + totalBrandsCreated;
  const newGroupsCreated = results.filter(
    (r) => r.success && r.isNewGroup,
  ).length;
  const autoGrouped = results.filter(
    (r) => r.success && r.groupAction === "auto-group",
  ).length;

  // Log comprehensive confidence summary
  logConfidenceSummary(
    recipes,
    newGroupsCreated,
    autoGrouped,
    totalIngredientsCreated,
    totalItemsCreated,
    totalBrandsCreated,
    enhancementsApplied,
  );

  return {
    success: true,
    recipesCreated: results.filter((r) => r.success).length,
    totalIngredients: totalIngredientsCreated,
    totalInstructions: totalInstructionsCreated,
    totalItemsCreated,
    totalBrandsCreated,
    enhancementsApplied,
    groupingStats: {
      newGroupsCreated,
      recipesAutoGrouped: autoGrouped,
      recipesRequiringConfirmation: results.filter(
        (r) => r.success && r.groupAction === "confirm",
      ).length,
    },
    results,
    menuAnalysis: {
      restaurant_type: placeData?.primary_category || null,
      recipes_extracted: recipes.length,
      recipes_saved: results.filter((r) => r.success).length,
      extraction_method: "enhanced_ai_vision_with_recipe_grouping",
    },
  };
}

/**
 * Log comprehensive confidence and performance summary
 */
function logConfidenceSummary(
  recipes: EnhancedExtractedRecipe[],
  newGroupsCreated: number,
  autoGrouped: number,
  totalIngredientsCreated: number,
  totalItemsCreated: number,
  totalBrandsCreated: number,
  enhancementsApplied: number,
): void {
  console.log(`📊 [RecipeProcessor] CONFIDENCE SUMMARY:`);
  console.log(`📊 [RecipeProcessor] Recipes processed: ${recipes.length}`);
  console.log(
    `📊 [RecipeProcessor] New recipe groups created: ${newGroupsCreated}`,
  );
  console.log(`📊 [RecipeProcessor] Recipes auto-grouped: ${autoGrouped}`);

  if (recipes.length > 0) {
    const recipeConfidences = recipes.map((r) => r.confidence).filter(Boolean);
    const avgRecipeConfidence =
      recipeConfidences.length > 0
        ? (
            recipeConfidences.reduce((a, b) => a + b, 0) /
            recipeConfidences.length
          ).toFixed(3)
        : "N/A";

    console.log(
      `📊 [RecipeProcessor] Average recipe confidence: ${avgRecipeConfidence}`,
    );
    console.log(
      `📊 [RecipeProcessor] Total ingredients processed: ${totalIngredientsCreated}`,
    );
    console.log(
      `📊 [RecipeProcessor] Items created by AI: ${totalItemsCreated}`,
    );
    console.log(`📊 [RecipeProcessor] Brands created: ${totalBrandsCreated}`);
    console.log(
      `📊 [RecipeProcessor] Enhancement ratio: ${totalIngredientsCreated > 0 ? `${((enhancementsApplied / totalIngredientsCreated) * 100).toFixed(1)}%` : "0%"}`,
    );
  }
}
