/**
 * Ingredient Processing Operations
 *
 * Handles processing recipe ingredients, matching them to existing items,
 * creating new items when needed, and linking them to recipes.
 */

import type { EnhancedRecipeIngredient } from "../../processRecipePhoto/_schemas";
import type { ItemMatchRequest, ItemMatchResult } from "../item-matching";
import { findBestItemMatch } from "../item-matching";
import { functionMutation, getAdminAuthHeaders } from "../urql-client";
import { CreateRecipeIngredientMutation } from "./graphql-operations";
import {
  createBasicGenericItem,
  createBeerWithAI,
  createCoffeeWithAI,
  createSpiritWithAI,
  createWineWithAI,
} from "./item-creators";
import type { IngredientProcessingResult, ItemCreationResult } from "./types";

/**
 * Process all ingredients for a recipe
 */
export async function processRecipeIngredients(
  ingredients: EnhancedRecipeIngredient[],
  recipeId: string,
  userId: string,
): Promise<IngredientProcessingResult> {
  console.log(
    `🥤 [processRecipeIngredients] Processing ${ingredients.length} ingredients for recipe ${recipeId}`,
  );

  let successCount = 0;
  let itemsCreated = 0;
  let brandsCreated = 0;

  for (const ingredient of ingredients) {
    try {
      const result = await processRecipeIngredient(
        ingredient,
        recipeId,
        userId,
      );
      successCount++;

      // Track items and brands created
      if (result.itemCreated) itemsCreated++;
      if (result.brandCreated) brandsCreated++;
    } catch (error) {
      console.error(
        `❌ [processRecipeIngredients] Failed to process ingredient ${ingredient.name}:`,
        error,
      );
      // Continue with other ingredients even if one fails
    }
  }

  console.log(
    `✅ [processRecipeIngredients] Successfully processed ${successCount}/${ingredients.length} ingredients`,
  );
  console.log(
    `📊 [processRecipeIngredients] Created ${itemsCreated} items and ${brandsCreated} brands`,
  );

  return { successCount, itemsCreated, brandsCreated };
}

/**
 * Process a single recipe ingredient with AI classification and matching
 */
async function processRecipeIngredient(
  ingredient: EnhancedRecipeIngredient,
  recipeId: string,
  _userId: string,
): Promise<ItemCreationResult> {
  console.log(
    `🥤 [processRecipeIngredient] Processing ingredient: ${ingredient.name}`,
  );

  let itemCreated = false;
  let brandCreated = false;

  // Step 1: Try to match existing items based on AI classification
  // Convert database_item_type to uppercase for non-generic types
  const itemType =
    ingredient.database_item_type === "generic"
      ? "generic"
      : (ingredient.database_item_type.toUpperCase() as
          | "WINE"
          | "BEER"
          | "SPIRIT"
          | "COFFEE"
          | "SAKE");

  const matchRequest: ItemMatchRequest = {
    name: ingredient.name,
    brand_name: ingredient.brand_name,
    product_name: ingredient.product_name,
    generic_name: ingredient.generic_name,
    category: ingredient.category,
    subcategory: ingredient.subcategory,
    country: ingredient.country,
    item_type: itemType,
    alcohol_content: ingredient.alcohol_content_percentage,
    vintage: undefined, // No vintage field in ingredient schema
    region: ingredient.region,
    style:
      ingredient.spirit_type || ingredient.wine_style || ingredient.beer_style,
    variety: ingredient.wine_variety,
  };

  let itemMatch: ItemMatchResult | null = null;

  // Log confidence scores for matching decision
  console.log(
    `📊 [processRecipeIngredient] Confidence analysis for "${ingredient.name}":`,
  );
  console.log(
    `📊 [processRecipeIngredient]   - Creation confidence: ${ingredient.creation_confidence || "N/A"}`,
  );
  console.log(
    `📊 [processRecipeIngredient]   - Should be specific: ${ingredient.should_be_specific}`,
  );
  console.log(
    `📊 [processRecipeIngredient]   - Database item type: ${ingredient.database_item_type}`,
  );

  // Always try matching to avoid duplicates, but adjust strategy based on classification
  if (
    ingredient.should_be_specific &&
    ingredient.database_item_type !== "generic"
  ) {
    console.log(
      `🔍 [processRecipeIngredient] Attempting to match specific ${ingredient.database_item_type} item (confidence threshold: 0.8)`,
    );

    itemMatch = await findBestItemMatch(matchRequest, {
      confidenceThreshold: 0.8,
      includeGeneric: true,
      maxResults: 5,
    });

    if (itemMatch) {
      console.log(
        `📊 [processRecipeIngredient] Match found - confidence: ${itemMatch.confidence}, reason: ${itemMatch.matchReason}`,
      );
    } else {
      console.log(
        `📊 [processRecipeIngredient] No match found above 0.8 confidence threshold`,
      );
    }
  } else if (ingredient.database_item_type === "generic") {
    console.log(
      `🔍 [processRecipeIngredient] Searching for existing generic item to avoid duplicates`,
    );

    // For generic items, search with lower threshold to find existing items
    itemMatch = await findBestItemMatch(matchRequest, {
      confidenceThreshold: 0.7, // Lower threshold for generic items
      includeGeneric: true,
      maxResults: 5,
    });

    if (itemMatch) {
      console.log(
        `✅ [processRecipeIngredient] Found existing generic item: ${itemMatch.item.name} (confidence: ${itemMatch.confidence})`,
      );
    } else {
      console.log(
        `📊 [processRecipeIngredient] No existing generic item found, will create new one`,
      );
    }
  } else {
    console.log(
      `📊 [processRecipeIngredient] Skipping item matching (should_be_specific: ${ingredient.should_be_specific}, type: ${ingredient.database_item_type})`,
    );
  }

  // Step 2: If no match and AI is confident, create new item
  if (!itemMatch && ingredient.creation_confidence >= 0.8) {
    console.log(
      `🆕 [processRecipeIngredient] No match found, creating new item with confidence ${ingredient.creation_confidence} (threshold: 0.8)`,
    );
    console.log(
      `📊 [processRecipeIngredient] AI confidence score ${ingredient.creation_confidence} >= 0.8 threshold - proceeding with item creation`,
    );

    itemMatch = await createItemWithAI(ingredient);
    itemCreated = true;

    if (itemMatch) {
      console.log(
        `📊 [processRecipeIngredient] New ${itemMatch.itemType} created - final confidence: ${itemMatch.confidence}`,
      );
    }

    // Check if a brand was created during item creation
    if (ingredient.brand_name) {
      brandCreated = true; // Brand creation happens inside createItemWithAI
      console.log(
        `📊 [processRecipeIngredient] Brand "${ingredient.brand_name}" created during item creation`,
      );
    }
  } else if (!itemMatch) {
    console.log(
      `📊 [processRecipeIngredient] AI confidence ${ingredient.creation_confidence || "N/A"} < 0.8 threshold - will create generic item as fallback`,
    );
  }

  // Step 2.5: If still no match, create a basic generic item as fallback
  if (!itemMatch) {
    const fallbackConfidence = ingredient.creation_confidence || 0.5;
    console.log(
      `📝 [processRecipeIngredient] No match and low confidence (${ingredient.creation_confidence || "N/A"}), creating generic item for: ${ingredient.name}`,
    );
    console.log(
      `📊 [processRecipeIngredient] Fallback confidence set to: ${fallbackConfidence}`,
    );

    const genericItemId = await createBasicGenericItem(ingredient);
    itemMatch = {
      type: "generic",
      itemId: genericItemId,
      itemType: "generic",
      confidence: fallbackConfidence,
      matchReason: "category_match",
      item: { id: genericItemId, name: ingredient.name },
    };
    itemCreated = true;

    console.log(
      `📊 [processRecipeIngredient] Generic item created with confidence: ${itemMatch.confidence}`,
    );
  }

  // Step 3: Create recipe ingredient link
  await createRecipeIngredientLink(ingredient, recipeId, itemMatch);

  console.log(
    `✅ [processRecipeIngredient] Successfully processed ingredient: ${ingredient.name}`,
  );

  return { itemCreated, brandCreated };
}

/**
 * Create a new item using AI data (placeholder for now)
 */
async function createItemWithAI(
  ingredient: EnhancedRecipeIngredient,
): Promise<ItemMatchResult> {
  console.log(
    `🤖 [createItemWithAI] Creating ${ingredient.database_item_type} item: ${ingredient.name}`,
  );

  if (
    ingredient.should_be_specific &&
    ingredient.database_item_type !== "generic"
  ) {
    // Create specific item based on type
    switch (ingredient.database_item_type) {
      case "wine":
        return await createWineWithAI(ingredient);
      case "beer":
        return await createBeerWithAI(ingredient);
      case "spirit":
        return await createSpiritWithAI(ingredient);
      case "coffee":
        return await createCoffeeWithAI(ingredient);
      default:
        console.log(
          `⚠️ [createItemWithAI] Unknown specific item type: ${ingredient.database_item_type}, falling back to generic`,
        );
        break;
    }
  }

  // Create generic item
  const genericItemId = await createBasicGenericItem(ingredient);
  return {
    type: "generic",
    itemId: genericItemId,
    itemType: "generic",
    confidence: ingredient.creation_confidence,
    matchReason: "category_match",
    item: { id: genericItemId, name: ingredient.name },
  };
}

/**
 * Create the recipe ingredient link with XOR constraint
 */
async function createRecipeIngredientLink(
  ingredient: EnhancedRecipeIngredient,
  recipeId: string,
  itemMatch: ItemMatchResult | null,
): Promise<void> {
  console.log(
    `🔗 [createRecipeIngredientLink] Linking ingredient ${ingredient.name} to recipe ${recipeId}`,
  );

  // Build XOR variables - only one item reference should be non-null
  const variables = {
    recipe_id: recipeId,
    wine_id: null as string | null,
    beer_id: null as string | null,
    spirit_id: null as string | null,
    coffee_id: null as string | null,
    generic_item_id: null as string | null,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    is_optional: ingredient.is_optional,
    substitution_notes: ingredient.substitution_notes,
  };

  // Set the appropriate item ID based on match type
  if (itemMatch) {
    if (itemMatch.type === "specific") {
      switch (itemMatch.itemType) {
        case "WINE":
          variables.wine_id = itemMatch.itemId;
          break;
        case "BEER":
          variables.beer_id = itemMatch.itemId;
          break;
        case "SPIRIT":
          variables.spirit_id = itemMatch.itemId;
          break;
        case "COFFEE":
          variables.coffee_id = itemMatch.itemId;
          break;
      }
    } else {
      variables.generic_item_id = itemMatch.itemId;
    }
  } else {
    // No match - this shouldn't happen if our logic is correct
    throw new Error(
      `No item match provided for ingredient: ${ingredient.name}`,
    );
  }

  await functionMutation(CreateRecipeIngredientMutation, variables, {
    headers: getAdminAuthHeaders(),
  });

  console.log(
    `✅ [createRecipeIngredientLink] Successfully linked ingredient ${ingredient.name}`,
  );
}
