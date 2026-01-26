/**
 * Recipe Compatibility Analysis System
 *
 * This module provides sophisticated recipe compatibility scoring based on:
 * - Exact item matches in user's cellar
 * - Generic ingredient substitutions
 * - Semantic similarity matching
 * - Ingredient availability and substitution scoring
 */

import { isNil } from "ramda";

// Types for recipe compatibility analysis
export type RecipeIngredient = {
  id: string;
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean;
  substitution_notes?: string | null;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  generic_item_id?: string | null;
  wine?: {
    id: string;
    name: string;
    vintage?: string | null;
    style?: string | null;
  } | null;
  beer?: { id: string; name: string; style?: string | null } | null;
  spirit?: { id: string; name: string; type?: string | null } | null;
  coffee?: { id: string; name: string; roast_level?: string | null } | null;
  generic_item?: {
    id: string;
    name: string;
    category?: string | null;
    subcategory?: string | null;
    item_type?: string | null;
  } | null;
};

export type CellarItem = {
  id: string;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  percentage_remaining?: number | null;
  wine?: {
    id: string;
    name: string;
    vintage?: string | null;
    style?: string | null;
  } | null;
  beer?: { id: string; name: string; style?: string | null } | null;
  spirit?: { id: string; name: string; type?: string | null } | null;
  coffee?: { id: string; name: string; roast_level?: string | null } | null;
};

export type IngredientMatch = {
  ingredient_id: string;
  match_type: "exact" | "category" | "semantic" | "generic" | "none";
  match_score: number; // 0-100
  matched_item?: CellarItem;
  alternatives?: CellarItem[];
  substitution_reason?: string;
  is_optional: boolean;
};

export type RecipeCompatibility = {
  recipe_id: string;
  overall_score: number; // 0-100
  can_make: boolean;
  missing_ingredients: IngredientMatch[];
  available_ingredients: IngredientMatch[];
  substitution_suggestions: IngredientMatch[];
  required_missing_count: number;
  optional_missing_count: number;
  shopping_list?: ShoppingItem[];
};

export type ShoppingItem = {
  ingredient_id: string;
  name: string;
  category: string;
  estimated_quantity?: string;
  suggested_items?: string[];
  is_essential: boolean;
};

/**
 * Analyze how well a user can make a recipe based on their cellar contents
 */
export function analyzeRecipeCompatibility(
  recipeIngredients: RecipeIngredient[],
  cellarItems: CellarItem[],
  options: {
    includeShoppingList?: boolean;
    semanticThreshold?: number; // Minimum score for semantic matches (default: 70)
    allowCrossTypeSubstitution?: boolean; // Allow spirit->wine substitutions etc
  } = {},
): RecipeCompatibility {
  const {
    includeShoppingList = false,
    semanticThreshold = 70,
    allowCrossTypeSubstitution = false,
  } = options;

  const ingredientMatches: IngredientMatch[] = [];
  let totalScore = 0;
  let requiredMissingCount = 0;
  let optionalMissingCount = 0;

  // Analyze each ingredient
  for (const ingredient of recipeIngredients) {
    const match = findBestMatch(ingredient, cellarItems, {
      semanticThreshold,
      allowCrossTypeSubstitution,
    });

    ingredientMatches.push(match);

    // Calculate scoring impact
    if (match.is_optional) {
      // Optional ingredients contribute less to overall score
      totalScore += match.match_score * 0.3;
      if (match.match_type === "none") {
        optionalMissingCount++;
      }
    } else {
      // Required ingredients have full weight
      totalScore += match.match_score;
      if (match.match_type === "none") {
        requiredMissingCount++;
      }
    }
  }

  // Calculate final score (weighted average)
  const requiredIngredients = recipeIngredients.filter((i) => !i.is_optional);
  const optionalIngredients = recipeIngredients.filter((i) => i.is_optional);
  const totalWeight =
    requiredIngredients.length + optionalIngredients.length * 0.3;
  const overallScore =
    totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

  // Determine if recipe can be made (all required ingredients available at threshold)
  const canMake =
    requiredMissingCount === 0 ||
    ingredientMatches.filter((m) => !m.is_optional && m.match_score < 60)
      .length === 0;

  // Separate ingredients by availability
  const availableIngredients = ingredientMatches.filter(
    (m) => m.match_score >= 60,
  );
  const missingIngredients = ingredientMatches.filter(
    (m) => m.match_score < 60,
  );
  const substitutionSuggestions = ingredientMatches.filter(
    (m) => m.match_type === "category" || m.match_type === "semantic",
  );

  // Generate shopping list if requested
  const shoppingList = includeShoppingList
    ? generateShoppingList(missingIngredients, recipeIngredients)
    : undefined;

  return {
    recipe_id: recipeIngredients[0]?.id || "", // Assumes ingredients belong to same recipe
    overall_score: overallScore,
    can_make: canMake,
    missing_ingredients: missingIngredients,
    available_ingredients: availableIngredients,
    substitution_suggestions: substitutionSuggestions,
    required_missing_count: requiredMissingCount,
    optional_missing_count: optionalMissingCount,
    shopping_list: shoppingList,
  };
}

/**
 * Find the best match for a recipe ingredient in the user's cellar
 */
function findBestMatch(
  ingredient: RecipeIngredient,
  cellarItems: CellarItem[],
  options: {
    semanticThreshold: number;
    allowCrossTypeSubstitution: boolean;
  },
): IngredientMatch {
  const { semanticThreshold, allowCrossTypeSubstitution } = options;
  const isOptional = ingredient.is_optional || false;

  // 1. Try exact item match first
  const exactMatch = findExactMatch(ingredient, cellarItems);
  if (exactMatch) {
    return {
      ingredient_id: ingredient.id,
      match_type: "exact",
      match_score: 100,
      matched_item: exactMatch,
      is_optional: isOptional,
    };
  }

  // 2. Try category match (same type, similar style/category)
  const categoryMatch = findCategoryMatch(ingredient, cellarItems);
  if (categoryMatch) {
    return {
      ingredient_id: ingredient.id,
      match_type: "category",
      match_score: categoryMatch.score,
      matched_item: categoryMatch.item,
      substitution_reason: categoryMatch.reason,
      is_optional: isOptional,
    };
  }

  // 3. Try semantic match (name similarity, type compatibility)
  const semanticMatch = findSemanticMatch(
    ingredient,
    cellarItems,
    semanticThreshold,
  );
  if (semanticMatch) {
    return {
      ingredient_id: ingredient.id,
      match_type: "semantic",
      match_score: semanticMatch.score,
      matched_item: semanticMatch.item,
      alternatives: semanticMatch.alternatives,
      substitution_reason: semanticMatch.reason,
      is_optional: isOptional,
    };
  }

  // 4. Try generic item match (if ingredient is generic)
  const genericMatch = findGenericMatch(
    ingredient,
    cellarItems,
    allowCrossTypeSubstitution,
  );
  if (genericMatch) {
    return {
      ingredient_id: ingredient.id,
      match_type: "generic",
      match_score: genericMatch.score,
      matched_item: genericMatch.item,
      alternatives: genericMatch.alternatives,
      substitution_reason: genericMatch.reason,
      is_optional: isOptional,
    };
  }

  // 5. No match found
  return {
    ingredient_id: ingredient.id,
    match_type: "none",
    match_score: 0,
    is_optional: isOptional,
  };
}

/**
 * Find exact matches - same specific item
 */
function findExactMatch(
  ingredient: RecipeIngredient,
  cellarItems: CellarItem[],
): CellarItem | null {
  for (const cellarItem of cellarItems) {
    // Check if any of the item IDs match
    if (
      (ingredient.wine_id && cellarItem.wine_id === ingredient.wine_id) ||
      (ingredient.beer_id && cellarItem.beer_id === ingredient.beer_id) ||
      (ingredient.spirit_id && cellarItem.spirit_id === ingredient.spirit_id) ||
      (ingredient.coffee_id && cellarItem.coffee_id === ingredient.coffee_id)
    ) {
      // Prefer items with more remaining quantity
      const remaining = cellarItem.percentage_remaining || 0;
      if (remaining > 10) {
        // At least 10% remaining
        return cellarItem;
      }
    }
  }
  return null;
}

/**
 * Find category matches - same type but different specific item
 */
function findCategoryMatch(
  ingredient: RecipeIngredient,
  cellarItems: CellarItem[],
): { item: CellarItem; score: number; reason: string } | null {
  const matches: { item: CellarItem; score: number; reason: string }[] = [];

  for (const cellarItem of cellarItems) {
    let score = 0;
    let reason = "";

    // Wine category matching
    if (ingredient.wine && cellarItem.wine) {
      if (
        ingredient.wine.style &&
        cellarItem.wine.style === ingredient.wine.style
      ) {
        score = 85; // Same style
        reason = `Same wine style: ${ingredient.wine.style}`;
      } else {
        score = 70; // Same type (wine)
        reason = "Same wine type";
      }
    }

    // Beer category matching
    else if (ingredient.beer && cellarItem.beer) {
      if (
        ingredient.beer.style &&
        cellarItem.beer.style === ingredient.beer.style
      ) {
        score = 85; // Same style
        reason = `Same beer style: ${ingredient.beer.style}`;
      } else {
        score = 70; // Same type (beer)
        reason = "Same beer type";
      }
    }

    // Spirit category matching
    else if (ingredient.spirit && cellarItem.spirit) {
      if (
        ingredient.spirit.type &&
        cellarItem.spirit.type === ingredient.spirit.type
      ) {
        score = 85; // Same spirit type
        reason = `Same spirit type: ${ingredient.spirit.type}`;
      } else {
        score = 70; // Same category (spirit)
        reason = "Same spirit category";
      }
    }

    // Coffee category matching
    else if (ingredient.coffee && cellarItem.coffee) {
      if (
        ingredient.coffee.roast_level &&
        cellarItem.coffee.roast_level === ingredient.coffee.roast_level
      ) {
        score = 85; // Same roast level
        reason = `Same roast level: ${ingredient.coffee.roast_level}`;
      } else {
        score = 70; // Same type (coffee)
        reason = "Same coffee type";
      }
    }

    if (score > 0) {
      // Adjust score based on remaining quantity
      const remaining = cellarItem.percentage_remaining || 0;
      if (remaining < 10) score *= 0.5; // Reduce score for low quantities

      matches.push({ item: cellarItem, score, reason });
    }
  }

  // Return best match
  return matches.length > 0
    ? matches.sort((a, b) => b.score - a.score)[0]
    : null;
}

/**
 * Find semantic matches based on name similarity and compatibility
 */
function findSemanticMatch(
  ingredient: RecipeIngredient,
  cellarItems: CellarItem[],
  threshold: number,
): {
  item: CellarItem;
  score: number;
  reason: string;
  alternatives: CellarItem[];
} | null {
  const matches: { item: CellarItem; score: number; reason: string }[] = [];

  // Get ingredient name for comparison
  const ingredientName = getIngredientName(ingredient);
  if (!ingredientName) return null;

  for (const cellarItem of cellarItems) {
    const cellarItemName = getCellarItemName(cellarItem);
    if (!cellarItemName) continue;

    // Calculate name similarity
    const similarity = calculateStringSimilarity(
      ingredientName,
      cellarItemName,
    );

    if (similarity >= threshold) {
      const score = Math.round(similarity * 0.8); // Semantic matches get 80% of similarity score
      matches.push({
        item: cellarItem,
        score,
        reason: `Similar name: "${cellarItemName}" matches "${ingredientName}"`,
      });
    }
  }

  if (matches.length === 0) return null;

  // Sort by score and return best match with alternatives
  const sortedMatches = matches.sort((a, b) => b.score - a.score);
  const best = sortedMatches[0];
  const alternatives = sortedMatches.slice(1, 4).map((m) => m.item); // Top 3 alternatives

  return {
    item: best.item,
    score: best.score,
    reason: best.reason,
    alternatives,
  };
}

/**
 * Find matches for generic ingredients
 */
function findGenericMatch(
  ingredient: RecipeIngredient,
  cellarItems: CellarItem[],
  allowCrossType: boolean,
): {
  item: CellarItem;
  score: number;
  reason: string;
  alternatives: CellarItem[];
} | null {
  if (!ingredient.generic_item) return null;

  const generic = ingredient.generic_item;
  const matches: { item: CellarItem; score: number; reason: string }[] = [];

  for (const cellarItem of cellarItems) {
    let score = 0;
    let reason = "";

    // Direct category matching
    if (generic.item_type === "wine" && cellarItem.wine) {
      score = 75;
      reason = `Generic wine ingredient matches wine: ${getCellarItemName(cellarItem)}`;
    } else if (generic.item_type === "beer" && cellarItem.beer) {
      score = 75;
      reason = `Generic beer ingredient matches beer: ${getCellarItemName(cellarItem)}`;
    } else if (generic.item_type === "spirit" && cellarItem.spirit) {
      score = 75;
      reason = `Generic spirit ingredient matches spirit: ${getCellarItemName(cellarItem)}`;
    } else if (generic.item_type === "coffee" && cellarItem.coffee) {
      score = 75;
      reason = `Generic coffee ingredient matches coffee: ${getCellarItemName(cellarItem)}`;
    }

    // Cross-type substitution (if allowed)
    else if (allowCrossType && generic.category) {
      if (generic.category === "alcohol" || generic.subcategory === "spirit") {
        if (cellarItem.spirit || cellarItem.wine) {
          score = 50;
          reason = `Cross-type alcohol substitution: ${getCellarItemName(cellarItem)}`;
        }
      }
    }

    if (score > 0) {
      matches.push({ item: cellarItem, score, reason });
    }
  }

  if (matches.length === 0) return null;

  const sortedMatches = matches.sort((a, b) => b.score - a.score);
  const best = sortedMatches[0];
  const alternatives = sortedMatches.slice(1, 4).map((m) => m.item);

  return {
    item: best.item,
    score: best.score,
    reason: best.reason,
    alternatives,
  };
}

/**
 * Generate shopping list for missing ingredients
 */
function generateShoppingList(
  missingIngredients: IngredientMatch[],
  recipeIngredients: RecipeIngredient[],
): ShoppingItem[] {
  const shoppingList: ShoppingItem[] = [];

  for (const missing of missingIngredients) {
    const ingredient = recipeIngredients.find(
      (i) => i.id === missing.ingredient_id,
    );
    if (!ingredient) continue;

    const name = getIngredientName(ingredient) || "Unknown ingredient";
    const category = getIngredientCategory(ingredient);
    const quantity = formatIngredientQuantity(ingredient);

    shoppingList.push({
      ingredient_id: missing.ingredient_id,
      name,
      category,
      estimated_quantity: quantity,
      suggested_items: generateItemSuggestions(ingredient),
      is_essential: !missing.is_optional,
    });
  }

  return shoppingList;
}

// Helper functions

function getIngredientName(ingredient: RecipeIngredient): string | null {
  if (ingredient.wine) return ingredient.wine.name;
  if (ingredient.beer) return ingredient.beer.name;
  if (ingredient.spirit) return ingredient.spirit.name;
  if (ingredient.coffee) return ingredient.coffee.name;
  if (ingredient.generic_item) return ingredient.generic_item.name;
  return null;
}

function getCellarItemName(cellarItem: CellarItem): string | null {
  if (cellarItem.wine) return cellarItem.wine.name;
  if (cellarItem.beer) return cellarItem.beer.name;
  if (cellarItem.spirit) return cellarItem.spirit.name;
  if (cellarItem.coffee) return cellarItem.coffee.name;
  return null;
}

function getIngredientCategory(ingredient: RecipeIngredient): string {
  if (ingredient.wine) return "Wine";
  if (ingredient.beer) return "Beer";
  if (ingredient.spirit) return "Spirit";
  if (ingredient.coffee) return "Coffee";
  if (ingredient.generic_item?.category)
    return ingredient.generic_item.category;
  return "Other";
}

function formatIngredientQuantity(ingredient: RecipeIngredient): string {
  if (isNil(ingredient.quantity)) return "";
  const unit = ingredient.unit || "";
  return `${ingredient.quantity} ${unit}`.trim();
}

function generateItemSuggestions(ingredient: RecipeIngredient): string[] {
  // This would ideally connect to a product database or API
  // For now, return generic suggestions based on ingredient type
  const name = getIngredientName(ingredient);
  if (!name) return [];

  if (ingredient.wine) {
    return [
      `${name} (any vintage)`,
      `Similar ${ingredient.wine.style || "wine"}`,
    ];
  }
  if (ingredient.spirit) {
    return [`${name}`, `Similar ${ingredient.spirit.type || "spirit"}`];
  }
  if (ingredient.generic_item) {
    return [`Any ${name.toLowerCase()}`, `Store brand ${name.toLowerCase()}`];
  }

  return [name];
}

/**
 * Calculate string similarity (simple Levenshtein-based approach)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;

  // Check for partial matches
  if (s1.includes(s2) || s2.includes(s1)) return 85;

  // Simple word-based matching
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  let matchingWords = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchingWords++;
        break;
      }
    }
  }

  const similarity =
    (matchingWords / Math.max(words1.length, words2.length)) * 100;
  return Math.round(similarity);
}
