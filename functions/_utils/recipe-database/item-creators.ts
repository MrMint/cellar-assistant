/**
 * Item Creation Operations
 *
 * Handles creating specific item types (wine, beer, spirit, coffee)
 * and generic items with proper AI data integration.
 */

import type { EnhancedRecipeIngredient } from "../../processRecipePhoto/_schemas";
import type { ItemMatchResult } from "../item-matching";
import { BRAND_TYPES } from "../shared-enums";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../urql-client";
import { findOrCreateBrand, linkItemToBrand } from "./brand-management";
import {
  CreateGenericItemMutation,
  FindExistingGenericItemQuery,
  InsertBeerMutation,
  InsertCoffeeMutation,
  InsertSpiritMutation,
  InsertWineMutation,
} from "./graphql-operations";

/**
 * Creates a wine item using AI to fill in missing details
 */
export async function createWineWithAI(
  ingredient: EnhancedRecipeIngredient,
): Promise<ItemMatchResult> {
  console.log(`🍷 [createWineWithAI] Creating wine: ${ingredient.name}`);
  console.log(
    `📊 [createWineWithAI] Input confidence: ${ingredient.creation_confidence}`,
  );

  try {
    // For now, skip AI enhancement and use ingredient data directly
    const aiData = {
      wine: {
        wine_type: ingredient.wine_style || "RED",
        vintage: undefined, // No vintage field in ingredient schema
        alcohol_content: ingredient.alcohol_content_percentage || 12,
        description: `AI-created wine: ${ingredient.name}`,
        region: ingredient.region || ingredient.country,
        grape_varietal: ingredient.wine_variety,
        tasting_notes: ingredient.flavor_profile?.join(", "),
      },
      confidence: ingredient.creation_confidence || 0.8,
    };

    console.log(
      `📊 [createWineWithAI] Using ingredient data with confidence: ${aiData.confidence || "N/A"}`,
    );

    // Handle brand creation if provided
    let brandId = null;
    if (ingredient.brand_name) {
      const brandResult = await findOrCreateBrand(
        ingredient.brand_name,
        BRAND_TYPES.WINERY,
      );
      brandId = brandResult.id;
    }

    // Insert wine with generated data
    const variables = {
      name: ingredient.name,
      wine_type: aiData.wine.wine_type,
      vintage: aiData.wine.vintage,
      alcohol_content_percentage: aiData.wine.alcohol_content,
      description: aiData.wine.description,
      region: aiData.wine.region,
      grape_varietal: aiData.wine.grape_varietal,
      tasting_notes: aiData.wine.tasting_notes,
      brand_id: brandId,
    };

    const result = await functionMutation(InsertWineMutation, variables, {
      headers: getAdminAuthHeaders(),
    });

    if (!result?.insert_wines_one?.id) {
      throw new Error("Wine creation returned no ID");
    }

    const wineId = result.insert_wines_one.id;

    // Link to brand if we created/found one
    if (brandId) {
      await linkItemToBrand(wineId, "wine", brandId);
    }

    console.log(
      `✅ [createWineWithAI] Created wine ${wineId}: ${ingredient.name}`,
    );

    const finalConfidence = aiData.confidence || ingredient.creation_confidence;
    console.log(
      `📊 [createWineWithAI] Final wine confidence: ${finalConfidence} (AI: ${aiData.confidence || "N/A"}, ingredient: ${ingredient.creation_confidence})`,
    );

    return {
      type: "specific",
      itemId: wineId,
      itemType: "WINE",
      confidence: finalConfidence,
      matchReason: "category_match",
      item: { id: wineId, name: ingredient.name },
    };
  } catch (error) {
    console.error(
      `❌ [createWineWithAI] Failed to create wine ${ingredient.name}:`,
      error,
    );
    console.log(
      `📊 [createWineWithAI] Falling back to generic item with reduced confidence: 0.3`,
    );

    // Fallback to generic item
    const genericItemId = await createBasicGenericItem(ingredient);
    return {
      type: "generic",
      itemId: genericItemId,
      itemType: "generic",
      confidence: 0.3,
      matchReason: "category_match",
      item: { id: genericItemId, name: ingredient.name },
    };
  }
}

/**
 * Creates a beer item using AI to fill in missing details
 */
export async function createBeerWithAI(
  ingredient: EnhancedRecipeIngredient,
): Promise<ItemMatchResult> {
  console.log(`🍺 [createBeerWithAI] Creating beer: ${ingredient.name}`);
  console.log(
    `📊 [createBeerWithAI] Input confidence: ${ingredient.creation_confidence}`,
  );

  try {
    // Use ingredient data directly for beer creation
    const aiData = {
      beer: {
        beer_type: ingredient.beer_style || "LAGER",
        alcohol_content: ingredient.alcohol_content_percentage || 5,
        description: `AI-created beer: ${ingredient.name}`,
        brewery: ingredient.brand_name,
        country_of_origin: ingredient.country,
        tasting_notes: ingredient.flavor_profile?.join(", "),
      },
      confidence: ingredient.creation_confidence || 0.8,
    };

    console.log(
      `📊 [createBeerWithAI] Using ingredient data with confidence: ${aiData.confidence || "N/A"}`,
    );

    // Handle brand creation if provided
    let brandId = null;
    if (ingredient.brand_name) {
      const brandResult = await findOrCreateBrand(
        ingredient.brand_name,
        BRAND_TYPES.BREWERY,
      );
      brandId = brandResult.id;
    }

    // Insert beer with AI-generated data
    const variables = {
      name: ingredient.name,
      beer_type: aiData.beer.beer_type,
      alcohol_content_percentage: aiData.beer.alcohol_content,
      description: aiData.beer.description,
      brewery: aiData.beer.brewery,
      country_of_origin: aiData.beer.country_of_origin,
      tasting_notes: aiData.beer.tasting_notes,
      brand_id: brandId,
    };

    const result = await functionMutation(InsertBeerMutation, variables, {
      headers: getAdminAuthHeaders(),
    });

    if (!result?.insert_beers_one?.id) {
      throw new Error("Beer creation returned no ID");
    }

    const beerId = result.insert_beers_one.id;

    // Link to brand if we created/found one
    if (brandId) {
      await linkItemToBrand(beerId, "beer", brandId);
    }

    console.log(
      `✅ [createBeerWithAI] Created beer ${beerId}: ${ingredient.name}`,
    );

    const finalConfidence = aiData.confidence || ingredient.creation_confidence;
    console.log(
      `📊 [createBeerWithAI] Final beer confidence: ${finalConfidence} (AI: ${aiData.confidence || "N/A"}, ingredient: ${ingredient.creation_confidence})`,
    );

    return {
      type: "specific",
      itemId: beerId,
      itemType: "BEER",
      confidence: finalConfidence,
      matchReason: "category_match",
      item: { id: beerId, name: ingredient.name },
    };
  } catch (error) {
    console.error(
      `❌ [createBeerWithAI] Failed to create beer ${ingredient.name}:`,
      error,
    );
    console.log(
      `📊 [createBeerWithAI] Falling back to generic item with reduced confidence: 0.3`,
    );

    // Fallback to generic item
    const genericItemId = await createBasicGenericItem(ingredient);
    return {
      type: "generic",
      itemId: genericItemId,
      itemType: "generic",
      confidence: 0.3,
      matchReason: "category_match",
      item: { id: genericItemId, name: ingredient.name },
    };
  }
}

/**
 * Creates a spirit item using AI to fill in missing details
 */
export async function createSpiritWithAI(
  ingredient: EnhancedRecipeIngredient,
): Promise<ItemMatchResult> {
  console.log(`🥃 [createSpiritWithAI] Creating spirit: ${ingredient.name}`);
  console.log(
    `📊 [createSpiritWithAI] Input confidence: ${ingredient.creation_confidence}`,
  );

  try {
    // For now, use ingredient data directly for spirit creation
    const aiData = {
      spirit: {
        spirit_type: ingredient.spirit_type || "WHISKEY",
        alcohol_content: ingredient.alcohol_content_percentage || 40,
        description: `AI-created spirit: ${ingredient.name}`,
        distillery: ingredient.brand_name,
        country_of_origin: ingredient.country,
        age_years: undefined, // Optional field - no age data in ingredient schema
        tasting_notes: ingredient.flavor_profile?.join(", "),
      },
      confidence: ingredient.creation_confidence || 0.8,
    };

    console.log(
      `📊 [createSpiritWithAI] Using ingredient data with confidence: ${aiData.confidence || "N/A"}`,
    );

    // Handle brand creation if provided
    let brandId = null;
    if (ingredient.brand_name) {
      const brandResult = await findOrCreateBrand(
        ingredient.brand_name,
        BRAND_TYPES.DISTILLERY,
      );
      brandId = brandResult.id;
    }

    // Insert spirit with AI-generated data
    // Note: spirit_type uses enum type assertion - value is validated at runtime by GraphQL
    const variables = {
      name: ingredient.name,
      type: aiData.spirit
        .spirit_type as import("@cellar-assistant/shared").Spirit_Type_Enum,
      alcohol_content_percentage: aiData.spirit.alcohol_content,
      description: aiData.spirit.description,
      distillery: aiData.spirit.distillery,
      country_of_origin: aiData.spirit.country_of_origin,
      age_years: aiData.spirit.age_years,
      tasting_notes: aiData.spirit.tasting_notes,
      brand_id: brandId,
    };

    const result = await functionMutation(InsertSpiritMutation, variables, {
      headers: getAdminAuthHeaders(),
    });

    if (!result?.insert_spirits_one?.id) {
      throw new Error("Spirit creation returned no ID");
    }

    const spiritId = result.insert_spirits_one.id;

    // Link to brand if we created/found one
    if (brandId) {
      await linkItemToBrand(spiritId, "spirit", brandId);
    }

    console.log(
      `✅ [createSpiritWithAI] Created spirit ${spiritId}: ${ingredient.name}`,
    );

    const finalConfidence = aiData.confidence || ingredient.creation_confidence;
    console.log(
      `📊 [createSpiritWithAI] Final spirit confidence: ${finalConfidence} (AI: ${aiData.confidence || "N/A"}, ingredient: ${ingredient.creation_confidence})`,
    );

    return {
      type: "specific",
      itemId: spiritId,
      itemType: "SPIRIT",
      confidence: finalConfidence,
      matchReason: "category_match",
      item: { id: spiritId, name: ingredient.name },
    };
  } catch (error) {
    console.error(
      `❌ [createSpiritWithAI] Failed to create spirit ${ingredient.name}:`,
      error,
    );
    console.log(
      `📊 [createSpiritWithAI] Falling back to generic item with reduced confidence: 0.3`,
    );

    // Fallback to generic item
    const genericItemId = await createBasicGenericItem(ingredient);
    return {
      type: "generic",
      itemId: genericItemId,
      itemType: "generic",
      confidence: 0.3,
      matchReason: "category_match",
      item: { id: genericItemId, name: ingredient.name },
    };
  }
}

/**
 * Creates a coffee item using AI to fill in missing details
 */
export async function createCoffeeWithAI(
  ingredient: EnhancedRecipeIngredient,
): Promise<ItemMatchResult> {
  console.log(`☕ [createCoffeeWithAI] Creating coffee: ${ingredient.name}`);
  console.log(
    `📊 [createCoffeeWithAI] Input confidence: ${ingredient.creation_confidence}`,
  );

  try {
    // For now, use ingredient data directly for coffee creation
    const aiData = {
      coffee: {
        coffee_type: "SINGLE_ORIGIN",
        description: `AI-created coffee: ${ingredient.name}`,
        roaster: ingredient.brand_name,
        origin_country: ingredient.country,
        roast_level: "MEDIUM",
        processing_method: undefined, // Optional field - no processing data available
        tasting_notes: ingredient.flavor_profile?.join(", "),
      },
      confidence: ingredient.creation_confidence || 0.8,
    };

    console.log(
      `📊 [createCoffeeWithAI] Using ingredient data with confidence: ${aiData.confidence || "N/A"}`,
    );

    // Handle brand creation if provided
    let brandId = null;
    if (ingredient.brand_name) {
      const brandResult = await findOrCreateBrand(
        ingredient.brand_name,
        BRAND_TYPES.ROASTERY,
      );
      brandId = brandResult.id;
    }

    // Insert coffee with AI-generated data
    // Note: roast_level uses enum type assertion - value is validated at runtime by GraphQL
    const variables = {
      name: ingredient.name,
      coffee_type: aiData.coffee.coffee_type,
      description: aiData.coffee.description,
      roaster: aiData.coffee.roaster,
      origin_country: aiData.coffee.origin_country,
      roast_level: aiData.coffee
        .roast_level as import("@cellar-assistant/shared").Coffee_Roast_Level_Enum,
      processing_method: aiData.coffee.processing_method,
      tasting_notes: aiData.coffee.tasting_notes,
      brand_id: brandId,
    };

    const result = await functionMutation(InsertCoffeeMutation, variables, {
      headers: getAdminAuthHeaders(),
    });

    if (!result?.insert_coffees_one?.id) {
      throw new Error("Coffee creation returned no ID");
    }

    const coffeeId = result.insert_coffees_one.id;

    // Link to brand if we created/found one
    if (brandId) {
      await linkItemToBrand(coffeeId, "coffee", brandId);
    }

    console.log(
      `✅ [createCoffeeWithAI] Created coffee ${coffeeId}: ${ingredient.name}`,
    );

    const finalConfidence = aiData.confidence || ingredient.creation_confidence;
    console.log(
      `📊 [createCoffeeWithAI] Final coffee confidence: ${finalConfidence} (AI: ${aiData.confidence || "N/A"}, ingredient: ${ingredient.creation_confidence})`,
    );

    return {
      type: "specific",
      itemId: coffeeId,
      itemType: "COFFEE",
      confidence: finalConfidence,
      matchReason: "category_match",
      item: { id: coffeeId, name: ingredient.name },
    };
  } catch (error) {
    console.error(
      `❌ [createCoffeeWithAI] Failed to create coffee ${ingredient.name}:`,
      error,
    );
    console.log(
      `📊 [createCoffeeWithAI] Falling back to generic item with reduced confidence: 0.3`,
    );

    // Fallback to generic item
    const genericItemId = await createBasicGenericItem(ingredient);
    return {
      type: "generic",
      itemId: genericItemId,
      itemType: "generic",
      confidence: 0.3,
      matchReason: "category_match",
      item: { id: genericItemId, name: ingredient.name },
    };
  }
}

/**
 * Create a basic generic item as fallback
 */
export async function createBasicGenericItem(
  ingredient: EnhancedRecipeIngredient,
): Promise<string> {
  console.log(
    `🆕 [createBasicGenericItem] Creating generic item: ${ingredient.name}`,
  );

  const itemName = ingredient.generic_name || ingredient.name;
  const itemCategory = ingredient.category || "ingredient";

  // First try to find existing item to avoid duplicates
  console.log(
    `🔍 [createBasicGenericItem] Checking for existing item: "${itemName}" in category "${itemCategory}"`,
  );

  const searchResult = await functionQuery(
    FindExistingGenericItemQuery,
    {
      name: itemName,
      category: itemCategory,
    },
    { headers: getAdminAuthHeaders() },
  );

  // If item already exists, return its ID
  if (searchResult?.generic_items?.length > 0) {
    const existingItem = searchResult.generic_items[0];
    console.log(
      `✅ [createBasicGenericItem] Found existing generic item: ${existingItem.name} (ID: ${existingItem.id})`,
    );
    return existingItem.id;
  }

  console.log(
    `🆕 [createBasicGenericItem] No existing item found, creating new generic item`,
  );

  // Create new item with upsert logic to handle race conditions

  const variables = {
    name: itemName,
    category: itemCategory,
    subcategory: ingredient.subcategory,
    item_type:
      ingredient.database_item_type === "generic"
        ? "ingredient"
        : ingredient.database_item_type,
    description: `AI-created generic item: ${ingredient.name}`,
    is_substitutable: ingredient.substitution_flexibility !== "none",
  };

  console.log(`🆕 [createBasicGenericItem] Inserting with upsert logic:`, {
    name: variables.name,
    category: variables.category,
    subcategory: variables.subcategory,
  });

  const result = await functionMutation(CreateGenericItemMutation, variables, {
    headers: getAdminAuthHeaders(),
  });

  if (!result?.insert_generic_items_one?.id) {
    throw new Error("Generic item creation returned no ID");
  }

  const itemId = result.insert_generic_items_one.id;
  const itemName_result = result.insert_generic_items_one.name;
  console.log(
    `✅ [createBasicGenericItem] Created/found generic item "${itemName_result}" with ID: ${itemId}`,
  );

  return itemId;
}
