/**
 * Recipe Group Creation Operations
 *
 * Handles recipe creation with automatic grouping and duplicate detection
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { EnhancedExtractedRecipe } from "../../processRecipePhoto/_schemas";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../urql-client";
import type { RecipeCreationResult } from "./types";

// GraphQL queries and mutations for recipe groups
const FindSimilarRecipeGroupsQuery = graphql(`
  query FindSimilarRecipeGroups($recipeName: String!) {
    recipes(
      where: {
        name: { _ilike: $recipeName }
      }
      limit: 10
    ) {
      id
      name
      description
      type
    }
  }
`);

const CreateRecipeGroupMutation = graphql(`
  mutation CreateRecipeGroup(
    $name: String!
    $description: String
  ) {
    insert_recipes_one(
      object: {
        name: $name
        description: $description
        type: "recipe_group"
      }
    ) {
      id
      name
    }
  }
`);

const CreateRecipeWithGroupMutation = graphql(`
  mutation CreateRecipeWithGroup(
    $name: String!
    $description: String
    $type: String!
    $difficulty_level: Int
    $prep_time_minutes: Int
    $serving_size: Int
    $image_url: String
    $version: Int
    $recipe_group_id: uuid!
    $created_by: uuid!
  ) {
    insert_recipes_one(
      object: {
        name: $name
        description: $description
        type: $type
        difficulty_level: $difficulty_level
        prep_time_minutes: $prep_time_minutes
        serving_size: $serving_size
        image_url: $image_url
        version: $version
        recipe_group_id: $recipe_group_id
        created_by: $created_by
      }
    ) {
      id
      name
      recipe_group_id
    }
  }
`);

const CreateRecipeInstructionsMutation = graphql(`
  mutation CreateRecipeInstructions($objects: [recipe_instructions_insert_input!]!) {
    insert_recipe_instructions(objects: $objects) {
      affected_rows
    }
  }
`);

export type RecipeGroupCandidate = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  base_spirit?: string | null;
  canonical_recipe_id?: string | null;
  recipes_aggregate: {
    aggregate: {
      count: number;
    };
  };
  similarity_score: number;
  confidence: "high" | "medium" | "low";
};

export type RecipeGroupingResult = {
  action: "auto-group" | "confirm" | "create-new";
  groupId?: string;
  groupName?: string;
  suggestions: RecipeGroupCandidate[];
  bestMatch?: RecipeGroupCandidate;
};

export type RecipeGroupCreationResult = RecipeCreationResult & {
  grouping: RecipeGroupingResult;
  isNewGroup: boolean;
  groupId: string;
};

/**
 * Calculate text similarity between two strings
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
 * Find similar recipe groups for a new recipe
 */
export async function findSimilarRecipeGroups(
  recipeName: string,
  _recipeDescription?: string,
  _placeId?: string,
): Promise<RecipeGroupCandidate[]> {
  console.log(
    `🔍 [findSimilarRecipeGroups] Searching for similar groups to: ${recipeName}`,
  );

  try {
    const searchPattern = `%${recipeName}%`;

    const result = await functionQuery(
      FindSimilarRecipeGroupsQuery,
      {
        recipeName: searchPattern,
      },
      { headers: getAdminAuthHeaders() },
    );

    const recipeGroups = (result?.recipes as unknown[]) || [];
    console.log(
      `🔍 [findSimilarRecipeGroups] Found ${recipeGroups.length} potential matches`,
    );

    // Calculate similarity scores
    const candidates: RecipeGroupCandidate[] = (
      recipeGroups as Array<Record<string, unknown>>
    ).map((group) => {
      const groupName = String(group.name || "");
      const similarity = calculateTextSimilarity(recipeName, groupName);
      const confidence = getConfidenceLevel(similarity);

      console.log(
        `🔍 [findSimilarRecipeGroups] - "${groupName}": ${Math.round(similarity * 100)}% similar (${confidence})`,
      );

      return {
        id: String(group.id || ""),
        name: groupName,
        description: group.description as string | null,
        category: String(group.type || ""),
        base_spirit: null as string | null,
        canonical_recipe_id: null as string | null,
        recipes_aggregate: {
          aggregate: {
            count: 1,
          },
        },
        similarity_score: similarity,
        confidence,
      };
    });

    // Sort by similarity score (highest first)
    return candidates.sort((a, b) => b.similarity_score - a.similarity_score);
  } catch (error) {
    console.error("❌ [findSimilarRecipeGroups] Error:", error);
    return [];
  }
}

/**
 * Determine grouping action based on similarity
 */
export function determineGroupingAction(
  candidates: RecipeGroupCandidate[],
): RecipeGroupingResult {
  if (candidates.length === 0) {
    return {
      action: "create-new",
      suggestions: [],
    };
  }

  const bestMatch = candidates[0];
  const similarity = bestMatch.similarity_score;

  console.log(
    `🎯 [determineGroupingAction] Best match: "${bestMatch.name}" with ${Math.round(similarity * 100)}% similarity`,
  );

  // Auto-group threshold (85%+)
  if (similarity >= 0.85) {
    console.log(
      `🤖 [determineGroupingAction] Auto-grouping (similarity >= 85%)`,
    );
    return {
      action: "auto-group",
      groupId: bestMatch.id,
      groupName: bestMatch.name,
      suggestions: candidates,
      bestMatch,
    };
  }

  // User confirmation threshold (60%+)
  if (similarity >= 0.6) {
    console.log(
      `❓ [determineGroupingAction] User confirmation needed (similarity >= 60%)`,
    );
    return {
      action: "confirm",
      suggestions: candidates,
      bestMatch,
    };
  }

  // Create new group (< 60%)
  console.log(
    `🆕 [determineGroupingAction] Creating new group (similarity < 60%)`,
  );
  return {
    action: "create-new",
    suggestions: candidates,
  };
}

/**
 * Create a new recipe group
 */
export async function createRecipeGroup(
  name: string,
  description?: string,
  _category: string = "cocktail",
  _baseSpirit?: string,
  _tags?: string[],
): Promise<string> {
  console.log(`📝 [createRecipeGroup] Creating new recipe group: ${name}`);

  try {
    const result = await functionMutation(
      CreateRecipeGroupMutation,
      {
        name,
        description,
      },
      { headers: getAdminAuthHeaders() },
    );

    const groupId = (result as { insert_recipes_one?: { id: string } })
      ?.insert_recipes_one?.id;
    if (!groupId) {
      throw new Error("Recipe group creation returned no ID");
    }

    console.log(`✅ [createRecipeGroup] Created recipe group: ${groupId}`);
    return groupId;
  } catch (error) {
    console.error("❌ [createRecipeGroup] Error:", error);
    throw error;
  }
}

/**
 * Create recipe instructions for grouped recipes
 */
async function createRecipeInstructionsForGroup(
  instructions: Array<{
    step_number?: number;
    instruction_text?: string;
    instruction_type?: string;
    equipment_needed?: string;
    time_minutes?: number;
    [key: string]: unknown;
  }>,
  recipeId: string,
): Promise<number> {
  if (!instructions || instructions.length === 0) {
    console.log(
      `📋 [createRecipeInstructionsForGroup] No instructions provided for recipe ${recipeId}`,
    );
    return 0;
  }

  console.log(
    `📋 [createRecipeInstructionsForGroup] Creating ${instructions.length} instructions for recipe ${recipeId}`,
  );

  // Map instruction types to valid enum values (must match database constraint)
  const mapInstructionType = (
    type: unknown,
  ): "prep" | "mix" | "garnish" | "serve" | "cook" | "chill" => {
    const typeStr = String(type || "");
    const typeMap: {
      [key: string]: "prep" | "mix" | "garnish" | "serve" | "cook" | "chill";
    } = {
      PREPARE: "prep",
      MIX: "mix",
      SHAKE: "mix", // Map to 'mix' (valid constraint value)
      STIR: "mix", // Map to 'mix' (valid constraint value)
      STRAIN: "mix", // Map to 'mix' (valid constraint value)
      BUILD: "mix", // Map to 'mix' (valid constraint value)
      POUR: "mix", // Map to 'mix' (valid constraint value)
      ADD: "mix", // Map to 'mix' (valid constraint value)
      MUDDLE: "prep", // Map to 'prep' (valid constraint value)
      FINISH: "garnish", // Map to 'garnish' (valid constraint value)
      GARNISH: "garnish",
      SERVE: "serve",
      COOK: "cook",
      CHILL: "chill",
    };

    return typeMap[typeStr.toUpperCase()] || "mix"; // Default to 'mix' if unknown
  };

  // Prepare batch insert data
  const instructionObjects = instructions.map((instruction, index) => ({
    recipe_id: recipeId,
    step_number: Number(instruction.step_number) || index + 1,
    instruction_text: String(instruction.instruction_text || ""),
    instruction_type: mapInstructionType(instruction.instruction_type),
    equipment_needed: instruction.equipment_needed
      ? String(instruction.equipment_needed)
      : undefined,
    time_minutes: instruction.time_minutes
      ? Number(instruction.time_minutes)
      : undefined,
  }));

  console.log(
    `📋 [createRecipeInstructionsForGroup] Mapped instruction types:`,
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
    `✅ [createRecipeInstructionsForGroup] Created ${affectedRows} instructions`,
  );

  return affectedRows;
}

/**
 * Create a recipe directly with a recipe group (bypasses the original createRecipeFromExtracted)
 */
export async function createRecipeWithGroup(
  recipe: EnhancedExtractedRecipe,
  groupId: string,
  userId: string,
): Promise<string> {
  console.log(
    `📝 [createRecipeWithGroup] Creating recipe in group ${groupId}: ${recipe.name}`,
  );

  try {
    // Determine version number based on existing recipes in group
    // For now, we'll use version 1 and let the database handle versioning
    const version = 1;

    const result = await functionMutation(
      CreateRecipeWithGroupMutation,
      {
        name: recipe.name,
        description: recipe.description,
        type: recipe.type,
        difficulty_level: recipe.difficulty_level,
        prep_time_minutes: recipe.prep_time_minutes,
        serving_size: recipe.serving_size,
        version,
        recipe_group_id: groupId,
        created_by: userId,
      },
      { headers: getAdminAuthHeaders() },
    );

    const recipeId = result?.insert_recipes_one?.id;
    if (!recipeId) {
      throw new Error("Recipe creation returned no ID");
    }

    console.log(`✅ [createRecipeWithGroup] Created recipe: ${recipeId}`);
    return recipeId;
  } catch (error) {
    console.error("❌ [createRecipeWithGroup] Error:", error);
    throw error;
  }
}

/**
 * Enhanced recipe creation with automatic grouping
 */
export async function createRecipeWithGrouping(
  recipe: EnhancedExtractedRecipe,
  userId: string,
  options: {
    placeId?: string;
    forceGroupId?: string; // Force assignment to specific group (from user confirmation)
  } = {},
): Promise<RecipeGroupCreationResult> {
  console.log(
    `🎯 [createRecipeWithGrouping] Processing recipe: ${recipe.name}`,
  );

  try {
    let groupingResult: RecipeGroupingResult;
    let groupId: string;
    let isNewGroup = false;

    if (options.forceGroupId) {
      // User explicitly chose a group
      console.log(
        `👤 [createRecipeWithGrouping] Using user-selected group: ${options.forceGroupId}`,
      );
      groupingResult = {
        action: "auto-group",
        groupId: options.forceGroupId,
        suggestions: [],
      };
      groupId = options.forceGroupId;
    } else {
      // Automatic grouping detection
      console.log(
        `🔍 [createRecipeWithGrouping] Searching for similar recipe groups`,
      );
      const candidates = await findSimilarRecipeGroups(
        recipe.name,
        recipe.description,
        options.placeId,
      );

      groupingResult = determineGroupingAction(candidates);

      if (groupingResult.action === "confirm") {
        // Return early for user confirmation - don't create recipe yet
        console.log(`❓ [createRecipeWithGrouping] User confirmation needed`);
        return {
          success: false,
          recipeName: recipe.name,
          ingredientsCreated: 0,
          instructionsCreated: 0,
          itemsCreated: 0,
          brandsCreated: 0,
          grouping: groupingResult,
          isNewGroup: false,
          groupId: "",
          error: "User confirmation required",
        };
      }

      if (groupingResult.action === "auto-group" && groupingResult.groupId) {
        // Use existing group
        console.log(
          `🤖 [createRecipeWithGrouping] Auto-grouping with existing group`,
        );
        groupId = groupingResult.groupId;
      } else {
        // Create new group
        console.log(`🆕 [createRecipeWithGrouping] Creating new recipe group`);
        isNewGroup = true;

        // Determine base spirit from recipe type and content
        let baseSpirit: string | undefined;
        if (recipe.type === "cocktail") {
          // Try to detect spirit from ingredients (simplified logic)
          const ingredients = recipe.ingredients || [];
          const spiritIngredient = ingredients.find(
            (ing) =>
              ing.database_item_type === "spirit" ||
              (ing.name &&
                /vodka|gin|rum|whiskey|bourbon|tequila|brandy/i.test(ing.name)),
          );
          if (spiritIngredient?.name) {
            const name = spiritIngredient.name.toLowerCase();
            if (name.includes("vodka")) baseSpirit = "VODKA";
            else if (name.includes("gin")) baseSpirit = "GIN";
            else if (name.includes("rum")) baseSpirit = "RUM";
            else if (name.includes("whiskey") || name.includes("bourbon"))
              baseSpirit = "WHISKEY";
            else if (name.includes("tequila")) baseSpirit = "TEQUILA";
            else if (name.includes("brandy")) baseSpirit = "BRANDY_COGNAC";
          }
        }

        groupId = await createRecipeGroup(
          recipe.name, // Use recipe name as group name
          recipe.description,
          recipe.type === "cocktail" ? "cocktail" : "food", // Map recipe type to available enum values
          baseSpirit,
        );

        groupingResult.groupId = groupId;
        groupingResult.groupName = recipe.name;
      }
    }

    // Create the recipe using the original function but with group assignment
    console.log(
      `📝 [createRecipeWithGrouping] Creating recipe in group ${groupId}`,
    );

    // We need to create the recipe with the group ID
    // Since the original createRecipeFromExtracted doesn't support groups,
    // we'll create the recipe record manually then use the rest of the logic
    const recipeId = await createRecipeWithGroup(recipe, groupId, userId);

    // Now process ingredients and instructions using the original functions
    const { processRecipeIngredients } = await import(
      "./ingredient-processing"
    );

    console.log(
      `📝 [createRecipeWithGrouping] Processing ingredients and instructions`,
    );
    const ingredientResults = await processRecipeIngredients(
      recipe.ingredients || [],
      recipeId,
      userId,
    );

    const instructionsCreated = await createRecipeInstructionsForGroup(
      (recipe.instructions || []) as Array<{
        step_number?: number;
        instruction_text?: string;
        instruction_type?: string;
        equipment_needed?: string;
        time_minutes?: number;
        [key: string]: unknown;
      }>,
      recipeId,
    );

    console.log(
      `✅ [createRecipeWithGrouping] Recipe creation completed successfully`,
    );

    return {
      success: true,
      recipeId,
      recipeName: recipe.name,
      ingredientsCreated: ingredientResults.successCount,
      instructionsCreated,
      itemsCreated: ingredientResults.itemsCreated,
      brandsCreated: ingredientResults.brandsCreated,
      grouping: groupingResult,
      isNewGroup,
      groupId,
    };
  } catch (error) {
    console.error(`❌ [createRecipeWithGrouping] Error:`, error);

    return {
      success: false,
      recipeName: recipe.name,
      ingredientsCreated: 0,
      instructionsCreated: 0,
      itemsCreated: 0,
      brandsCreated: 0,
      grouping: {
        action: "create-new",
        suggestions: [],
      },
      isNewGroup: false,
      groupId: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
