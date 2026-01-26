/**
 * Generates rich, searchable embedding text from recipe data
 *
 * This module combines recipe data with recipe_group data and ingredient details
 * to create comprehensive embedding text for semantic search.
 */

import {
  BASE_SPIRIT_KEYWORDS,
  BEER_STYLE_KEYWORDS,
  CATEGORY_KEYWORDS,
  DIFFICULTY_KEYWORDS,
  getIngredientCountKeywords,
  getPrepTimeKeywords,
  getServingSizeKeywords,
  INGREDIENT_CATEGORY_KEYWORDS,
  INSTRUCTION_TYPE_KEYWORDS,
  RECIPE_TYPE_KEYWORDS,
  SPIRIT_TYPE_KEYWORDS,
  WINE_STYLE_KEYWORDS,
} from "./_embedding-config";
import type {
  RecipeGroup,
  RecipeIngredient,
  RecipeInstruction,
  RecipeWithDetails,
} from "./_types";

/**
 * Generate comprehensive embedding text for a recipe
 *
 * Includes:
 * - Recipe name and description
 * - Recipe type (food/cocktail) with keywords
 * - Recipe group data (category, base_spirit, tags)
 * - All ingredient names and their type-specific keywords
 * - Difficulty level keywords
 * - Prep time and serving size context
 * - Instruction type keywords
 */
export function generateRecipeEmbeddingText(recipe: RecipeWithDetails): string {
  const parts: string[] = [];

  // 1. Recipe name (highest priority)
  parts.push(recipe.name);
  parts.push("recipe", "how to make");

  // Add type-specific recipe keywords
  if (recipe.type === "cocktail") {
    parts.push("drink recipe", "cocktail recipe");
  } else if (recipe.type === "food") {
    parts.push("food recipe", "dish recipe");
  }

  // 2. Recipe description
  if (recipe.description) {
    parts.push(recipe.description);
  }

  // 3. Recipe type (food vs cocktail)
  if (recipe.type) {
    parts.push(recipe.type);
    const typeKeywords =
      RECIPE_TYPE_KEYWORDS[recipe.type as keyof typeof RECIPE_TYPE_KEYWORDS];
    if (typeKeywords) {
      parts.push(...typeKeywords);
    }
  }

  // 4. Recipe group data (category, base_spirit, tags)
  if (recipe.recipe_group) {
    addRecipeGroupData(recipe.recipe_group, parts);
  }

  // 5. Ingredients (all ingredient names + type-specific keywords)
  addIngredientData(recipe.ingredients, parts);

  // 6. Difficulty level
  if (recipe.difficulty_level) {
    const difficultyKeywords = DIFFICULTY_KEYWORDS[recipe.difficulty_level];
    if (difficultyKeywords) {
      parts.push(...difficultyKeywords);
    }
  }

  // 7. Prep time context
  if (recipe.prep_time_minutes) {
    parts.push(...getPrepTimeKeywords(recipe.prep_time_minutes));
  }

  // 8. Serving size context
  if (recipe.serving_size) {
    parts.push(...getServingSizeKeywords(recipe.serving_size));
  }

  // 9. Instruction types (for technique context)
  if (recipe.instructions && recipe.instructions.length > 0) {
    addInstructionTypeData(recipe.instructions, parts);
  }

  return cleanupEmbeddingText(parts);
}

/**
 * Add recipe group data to embedding parts
 */
function addRecipeGroupData(group: RecipeGroup, parts: string[]): void {
  if (!group) return;

  // Group name
  if (group.name) {
    parts.push(group.name);
  }

  // Group description
  if (group.description) {
    parts.push(group.description);
  }

  // Category keywords
  if (group.category) {
    parts.push(group.category);
    const categoryKeywords =
      CATEGORY_KEYWORDS[group.category as keyof typeof CATEGORY_KEYWORDS];
    if (categoryKeywords) {
      parts.push(...categoryKeywords);
    }
  }

  // Base spirit keywords
  if (group.base_spirit) {
    parts.push(group.base_spirit);
    const spiritKey = group.base_spirit.toLowerCase();
    const spiritKeywords = BASE_SPIRIT_KEYWORDS[spiritKey];
    if (spiritKeywords) {
      parts.push(...spiritKeywords);
    }
  }

  // Tags (directly searchable)
  if (group.tags && Array.isArray(group.tags)) {
    parts.push(...group.tags);
  }
}

/**
 * Add ingredient data to embedding parts
 */
function addIngredientData(
  ingredients: RecipeIngredient[],
  parts: string[],
): void {
  const ingredientNames: string[] = [];

  for (const ingredient of ingredients) {
    // Extract ingredient name and add type-specific keywords
    if (ingredient.wine) {
      ingredientNames.push(ingredient.wine.name);
      parts.push("wine ingredient");
      if (ingredient.wine.variety) {
        parts.push(ingredient.wine.variety);
      }
      if (ingredient.wine.style) {
        parts.push(ingredient.wine.style);
        const styleKeywords =
          WINE_STYLE_KEYWORDS[
            ingredient.wine.style as keyof typeof WINE_STYLE_KEYWORDS
          ];
        if (styleKeywords) {
          parts.push(...styleKeywords);
        }
      }
    } else if (ingredient.beer) {
      ingredientNames.push(ingredient.beer.name);
      parts.push("beer ingredient");
      if (ingredient.beer.style) {
        parts.push(ingredient.beer.style);
        const styleKeywords =
          BEER_STYLE_KEYWORDS[
            ingredient.beer.style as keyof typeof BEER_STYLE_KEYWORDS
          ];
        if (styleKeywords) {
          parts.push(...styleKeywords);
        }
      }
    } else if (ingredient.spirit) {
      ingredientNames.push(ingredient.spirit.name);
      parts.push("spirit ingredient");
      if (ingredient.spirit.type) {
        parts.push(ingredient.spirit.type);
        const typeKeywords =
          SPIRIT_TYPE_KEYWORDS[
            ingredient.spirit.type as keyof typeof SPIRIT_TYPE_KEYWORDS
          ];
        if (typeKeywords) {
          parts.push(...typeKeywords);
        }
      }
    } else if (ingredient.coffee) {
      ingredientNames.push(ingredient.coffee.name);
      parts.push("coffee ingredient");
      if (ingredient.coffee.roast_level) {
        parts.push(ingredient.coffee.roast_level);
      }
    } else if (ingredient.sake) {
      ingredientNames.push(ingredient.sake.name);
      parts.push("sake ingredient", "japanese rice wine");
      if (ingredient.sake.category) {
        parts.push(ingredient.sake.category);
      }
      if (ingredient.sake.type) {
        parts.push(ingredient.sake.type);
      }
    } else if (ingredient.generic_item) {
      ingredientNames.push(ingredient.generic_item.name);
      const category = ingredient.generic_item.category;
      if (category) {
        parts.push(category);
        const categoryKeywords =
          INGREDIENT_CATEGORY_KEYWORDS[category.toLowerCase()];
        if (categoryKeywords) {
          parts.push(...categoryKeywords);
        }
      }
    }

    // Note optional ingredients
    if (ingredient.is_optional) {
      parts.push("optional ingredient");
    }
  }

  // Add all ingredient names
  parts.push(...ingredientNames);

  // Add ingredient count context
  parts.push(...getIngredientCountKeywords(ingredientNames.length));
}

/**
 * Add instruction type data to embedding parts
 */
function addInstructionTypeData(
  instructions: RecipeInstruction[],
  parts: string[],
): void {
  const types = new Set<string>();

  for (const instruction of instructions) {
    if (instruction.instruction_type) {
      types.add(instruction.instruction_type);
    }
  }

  for (const type of types) {
    const keywords =
      INSTRUCTION_TYPE_KEYWORDS[type as keyof typeof INSTRUCTION_TYPE_KEYWORDS];
    if (keywords) {
      parts.push(...keywords);
    }
  }

  // Add technique context based on instruction count
  if (instructions.length > 5) {
    parts.push("multi-step", "detailed instructions");
  } else if (instructions.length <= 2) {
    parts.push("simple steps", "easy to follow");
  }
}

/**
 * Clean up embedding text by removing duplicates and normalizing
 */
function cleanupEmbeddingText(parts: string[]): string {
  // Filter out empty/null values
  const filteredParts = parts
    .filter(Boolean)
    .map((part) => String(part).trim());

  // Remove duplicates (case-insensitive)
  const uniqueParts: string[] = [];
  const seen = new Set<string>();

  for (const part of filteredParts) {
    const lowerPart = part.toLowerCase();
    if (!seen.has(lowerPart)) {
      seen.add(lowerPart);
      uniqueParts.push(part);
    }
  }

  // Join and normalize whitespace
  return uniqueParts.join(" ").replace(/\s+/g, " ").trim();
}
