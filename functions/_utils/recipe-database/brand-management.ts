/**
 * Brand Management Operations
 *
 * Handles finding existing brands and creating new ones,
 * plus linking items to brands.
 */

import { BRAND_TYPES } from "../shared-enums";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../urql-client";
import {
  CreateBrandMutation,
  FindBrandQuery,
  LinkItemToBrandMutation,
} from "./graphql-operations";

/**
 * Find or create a brand record
 *
 * Handles race conditions: if creation fails due to a concurrent insert,
 * the function will retry the find operation to get the existing brand.
 */
export async function findOrCreateBrand(
  brandName: string,
  brandType?: string,
): Promise<{ id: string; name: string }> {
  console.log(`🏷️ [findOrCreateBrand] Processing brand: ${brandName}`);

  // Helper to find existing brand
  const findExistingBrand = async () => {
    const searchResult = await functionQuery(
      FindBrandQuery,
      { name: brandName },
      { headers: getAdminAuthHeaders() },
    );
    if (searchResult?.brands && searchResult.brands.length > 0) {
      return searchResult.brands[0];
    }
    return null;
  };

  // Step 1: Try to find existing brand
  const existingBrand = await findExistingBrand();
  if (existingBrand) {
    console.log(
      `✅ [findOrCreateBrand] Found existing brand: ${existingBrand.name} (${existingBrand.id})`,
    );
    return {
      id: existingBrand.id,
      name: existingBrand.name,
    };
  }

  // Step 2: Create new brand with race condition handling
  console.log(`🆕 [findOrCreateBrand] Creating new brand: ${brandName}`);

  // Use the brand type directly - database foreign key constraint will validate
  const finalBrandType = (brandType || BRAND_TYPES.OTHER) as
    | "brewery"
    | "distillery"
    | "manufacturer"
    | "other"
    | "restaurant_chain"
    | "roastery"
    | "winery";
  console.log(`🏷️ [findOrCreateBrand] Using brand_type: "${finalBrandType}"`);

  try {
    const createResult = await functionMutation(
      CreateBrandMutation,
      {
        name: brandName,
        brand_type: finalBrandType,
        description: `AI-created brand: ${brandName}`,
      },
      { headers: getAdminAuthHeaders() },
    );

    if (!createResult?.insert_brands_one) {
      throw new Error("Brand creation returned no data");
    }

    const newBrand = createResult.insert_brands_one;
    console.log(
      `✅ [findOrCreateBrand] Created new brand: ${newBrand.name} (${newBrand.id})`,
    );

    return {
      id: newBrand.id,
      name: newBrand.name,
    };
  } catch (error) {
    // Race condition: Another process may have created the brand between our find and create
    const errorMessage = String(error);
    if (
      errorMessage.includes("duplicate") ||
      errorMessage.includes("unique") ||
      errorMessage.includes("constraint")
    ) {
      console.log(
        `⚠️ [findOrCreateBrand] Race condition detected, retrying find for: ${brandName}`,
      );

      // Retry find - the brand should exist now
      const retryBrand = await findExistingBrand();
      if (retryBrand) {
        console.log(
          `✅ [findOrCreateBrand] Found brand after race condition: ${retryBrand.name} (${retryBrand.id})`,
        );
        return {
          id: retryBrand.id,
          name: retryBrand.name,
        };
      }
    }

    // Re-throw if not a race condition or retry failed
    throw error;
  }
}

/**
 * Link an item to a brand
 */
export async function linkItemToBrand(
  itemId: string,
  itemType: "wine" | "beer" | "spirit" | "coffee" | "sake",
  brandId: string,
  isPrimary: boolean = true,
): Promise<void> {
  console.log(
    `🔗 [linkItemToBrand] Linking ${itemType} ${itemId} to brand ${brandId}`,
  );

  // Build XOR variables for item type
  const variables = {
    wine_id: null as string | null,
    beer_id: null as string | null,
    spirit_id: null as string | null,
    coffee_id: null as string | null,
    sake_id: null as string | null,
    brand_id: brandId,
    is_primary: isPrimary,
  };

  // Set the appropriate item ID
  switch (itemType) {
    case "wine":
      variables.wine_id = itemId;
      break;
    case "beer":
      variables.beer_id = itemId;
      break;
    case "spirit":
      variables.spirit_id = itemId;
      break;
    case "coffee":
      variables.coffee_id = itemId;
      break;
    case "sake":
      variables.sake_id = itemId;
      break;
  }

  try {
    const result = await functionMutation(LinkItemToBrandMutation, variables, {
      headers: getAdminAuthHeaders(),
    });

    if (!result?.insert_item_brands_one) {
      // This might be a duplicate relationship, which is okay
      console.log(
        `ℹ️ [linkItemToBrand] Brand relationship may already exist for ${itemType} ${itemId}`,
      );
      return;
    }
  } catch (error) {
    // Don't throw on duplicate key errors - the relationship might already exist
    const errorMessage = String(error);
    if (errorMessage.includes("duplicate") || errorMessage.includes("unique")) {
      console.log(
        `ℹ️ [linkItemToBrand] Brand relationship already exists for ${itemType} ${itemId}`,
      );
      return;
    }
    throw error;
  }

  console.log(
    `✅ [linkItemToBrand] Successfully linked ${itemType} ${itemId} to brand ${brandId}`,
  );
}
