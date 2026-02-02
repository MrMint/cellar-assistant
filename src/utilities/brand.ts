/**
 * Brand linking utilities for client-side operations
 *
 * Provides a shared utility for linking items to brands during onboarding.
 * This is non-blocking - if brand linking fails, item creation still succeeds.
 */

import { linkItemToBrandMutation } from "@cellar-assistant/shared/queries";
import type { Client } from "urql";

export type ItemTypeForBrand = "wine" | "beer" | "spirit" | "coffee" | "sake";

/**
 * Link an item to a brand via the item_brands join table.
 *
 * This is a non-blocking operation - if it fails, the error is logged
 * but not thrown. The item creation should still be considered successful.
 *
 * @param urqlClient - The urql client instance
 * @param itemId - The ID of the created item
 * @param brandId - The brand ID to link to
 * @param itemType - The type of item (wine, beer, spirit, coffee, sake)
 * @returns Promise that resolves when the operation completes (success or failure)
 */
export async function linkItemToBrand(
  urqlClient: Client,
  itemId: string,
  brandId: string,
  itemType: ItemTypeForBrand,
): Promise<void> {
  try {
    // Build variables object with proper typing
    const variables = {
      brand_id: brandId,
      is_primary: true,
      wine_id: itemType === "wine" ? itemId : null,
      beer_id: itemType === "beer" ? itemId : null,
      spirit_id: itemType === "spirit" ? itemId : null,
      coffee_id: itemType === "coffee" ? itemId : null,
      sake_id: itemType === "sake" ? itemId : null,
    };

    await urqlClient.mutation(linkItemToBrandMutation, variables);
    console.log(`Linked ${itemType} ${itemId} to brand ${brandId}`);
  } catch (error) {
    console.warn(`Failed to link brand to ${itemType}:`, error);
    // Non-blocking - item was created successfully, brand linking is optional
  }
}
