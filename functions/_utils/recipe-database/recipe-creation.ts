/**
 * Recipe Creation Operations
 *
 * Handles the main recipe creation logic, including creating recipe records,
 * processing ingredients, and creating instructions.
 */

import type {
  EnhancedExtractedRecipe,
  EnhancedRecipeInstruction,
} from "../../processRecipePhoto/_schemas";
import { functionMutation, getAdminAuthHeaders } from "../urql-client";
import {
  CreateRecipeInstructionsMutation,
  CreateRecipeMutation,
} from "./graphql-operations";
import { processRecipeIngredients } from "./ingredient-processing";
import type { BatchRecipeCreationResult, RecipeCreationResult } from "./types";

/**
 * Create a single recipe from extracted AI data
 */
export async function createRecipeFromExtracted(
  recipe: EnhancedExtractedRecipe,
  userId: string,
): Promise<RecipeCreationResult> {
  console.log(`📝 [createRecipeFromExtracted] Creating recipe: ${recipe.name}`);

  try {
    // Step 1: Create the recipe record
    console.log(
      `📝 [createRecipeFromExtracted] Step 1: Creating recipe record`,
    );
    const recipeId = await createRecipeRecord(recipe);

    // Step 2: Process ingredients
    console.log(
      `📝 [createRecipeFromExtracted] Step 2: Processing ${recipe.ingredients?.length || 0} ingredients`,
    );
    const ingredientResults = await processRecipeIngredients(
      recipe.ingredients || [],
      recipeId,
      userId,
    );

    // Step 3: Create instructions
    console.log(
      `📝 [createRecipeFromExtracted] Step 3: Creating ${recipe.instructions?.length || 0} instructions`,
    );
    const instructionsCreated = await createRecipeInstructions(
      recipe.instructions || [],
      recipeId,
    );

    console.log(
      `✅ [createRecipeFromExtracted] Successfully created recipe ${recipe.name} (${recipeId})`,
    );
    console.log(
      `📊 [createRecipeFromExtracted] Final stats: ${ingredientResults.successCount} ingredients, ${instructionsCreated} instructions, ${ingredientResults.itemsCreated} items, ${ingredientResults.brandsCreated} brands`,
    );

    return {
      success: true,
      recipeId,
      recipeName: recipe.name,
      ingredientsCreated: ingredientResults.successCount,
      instructionsCreated,
      itemsCreated: ingredientResults.itemsCreated,
      brandsCreated: ingredientResults.brandsCreated,
    };
  } catch (error) {
    console.error(
      `❌ [createRecipeFromExtracted] Failed to create recipe ${recipe.name}:`,
      error,
    );

    return {
      success: false,
      recipeName: recipe.name,
      ingredientsCreated: 0,
      instructionsCreated: 0,
      itemsCreated: 0,
      brandsCreated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Create the main recipe record
 */
async function createRecipeRecord(
  recipe: EnhancedExtractedRecipe,
): Promise<string> {
  console.log(`📝 [createRecipeRecord] Creating recipe: ${recipe.name}`);

  const variables: {
    name: string;
    description: string | undefined;
    type: string;
    difficulty_level: number | null | undefined;
    prep_time_minutes: number | null | undefined;
    serving_size: number | null | undefined;
    image_url: string | undefined;
  } = {
    name: recipe.name,
    description: recipe.description,
    type: recipe.type,
    difficulty_level: recipe.difficulty_level,
    prep_time_minutes: recipe.prep_time_minutes,
    serving_size: recipe.serving_size,
    image_url: undefined, // No image for AI-created recipes initially
  };

  console.log(
    `📝 [createRecipeRecord] Recipe variables:`,
    JSON.stringify(variables, null, 2),
  );

  // Use typed GraphQL mutation for type safety
  const result = await functionMutation(CreateRecipeMutation, variables, {
    headers: getAdminAuthHeaders(),
  });

  if (!result?.insert_recipes_one?.id) {
    throw new Error("Recipe creation returned no ID");
  }

  const recipeId = result.insert_recipes_one.id;
  console.log(
    `✅ [createRecipeRecord] Created recipe ${recipe.name} with ID: ${recipeId}`,
  );

  return recipeId;
}

/**
 * Create recipe instructions
 */
async function createRecipeInstructions(
  instructions: EnhancedRecipeInstruction[],
  recipeId: string,
): Promise<number> {
  console.log(
    `📋 [createRecipeInstructions] Creating ${instructions.length} instructions for recipe ${recipeId}`,
  );

  if (!instructions.length) {
    return 0;
  }

  // Use instruction types directly - database foreign key constraint will validate
  const normalizeInstructionType = (
    type: string,
  ): "chill" | "cook" | "garnish" | "mix" | "prep" | "serve" => {
    const normalizedType = type?.toLowerCase() || "mix";

    // Map common variations to enum table values
    const typeMap: Record<
      string,
      "chill" | "cook" | "garnish" | "mix" | "prep" | "serve"
    > = {
      prepare: "prep",
      preparation: "prep",
      shake: "mix",
      stir: "mix",
      strain: "mix",
      build: "mix",
      pour: "mix",
      add: "mix",
      finish: "garnish",
    };

    return typeMap[normalizedType] || "mix";
  };

  // Prepare batch insert data
  const instructionObjects = instructions.map((instruction, index) => ({
    recipe_id: recipeId,
    step_number: instruction.step_number || index + 1,
    instruction_text: instruction.instruction_text,
    instruction_type: normalizeInstructionType(instruction.instruction_type),
    equipment_needed: instruction.equipment_needed,
    time_minutes: instruction.time_minutes,
  }));

  console.log(
    `📋 [createRecipeInstructions] Mapped instruction types:`,
    instructionObjects.map(
      (obj) => `${obj.step_number}: ${obj.instruction_type}`,
    ),
  );

  const result = await functionMutation(
    CreateRecipeInstructionsMutation,
    { objects: instructionObjects },
    { headers: getAdminAuthHeaders() },
  );

  const affectedRows = result?.insert_recipe_instructions?.affected_rows || 0;
  console.log(
    `✅ [createRecipeInstructions] Created ${affectedRows} instructions`,
  );

  return affectedRows;
}

/**
 * Process multiple recipes in batch
 */
export async function createRecipesFromExtracted(
  recipes: EnhancedExtractedRecipe[],
  userId: string,
): Promise<BatchRecipeCreationResult> {
  console.log(
    `📚 [createRecipesFromExtracted] Processing ${recipes.length} recipes for user ${userId}`,
  );

  const results: RecipeCreationResult[] = [];
  let totalIngredients = 0;
  let enhancementsApplied = 0;

  for (const recipe of recipes) {
    const result = await createRecipeFromExtracted(recipe, userId);
    results.push(result);

    if (result.success) {
      totalIngredients += result.ingredientsCreated || 0;
      // Count enhancements as successful ingredient processing
      enhancementsApplied += result.ingredientsCreated || 0;
    }
  }

  const successfulRecipes = results.filter((r) => r.success).length;

  console.log(
    `✅ [createRecipesFromExtracted] Completed batch: ${successfulRecipes}/${recipes.length} recipes created`,
  );

  return {
    success: successfulRecipes > 0,
    recipesCreated: successfulRecipes,
    totalIngredients,
    enhancementsApplied,
    results,
  };
}
