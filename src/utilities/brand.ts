/**
 * Brand linking utilities for client-side operations
 *
 * Provides a shared utility for linking items to brands during onboarding.
 * This is non-blocking - if brand linking fails, item creation still succeeds.
 */

import { linkItemToBrandMutation } from "@cellar-assistant/shared/queries";
import type { Client } from "urql";
import {
  InsertBrandMutation,
  SearchBrandsQuery,
} from "@/components/brand/queries";

export type ItemTypeForBrand =
  | "wine"
  | "beer"
  | "spirit"
  | "coffee"
  | "sake"
  | "tea";

/**
 * Default brand type to assign when creating a brand for a given item type.
 * `as const` keeps the values as literals so they satisfy the
 * `brand_types_enum` GraphQL variable type.
 */
const BRAND_TYPE_BY_ITEM = {
  wine: "winery",
  beer: "brewery",
  spirit: "distillery",
  coffee: "roastery",
  sake: "kura",
  tea: "tea_house",
} as const satisfies Record<ItemTypeForBrand, string>;

/**
 * The brand the user selected (or typed) in the brand picker.
 * Mirrors the `brand_id` / `brand_name` / `is_new_brand` form fields.
 */
export type BrandSelection = {
  brand_id?: string | null;
  brand_name?: string | null;
  is_new_brand?: boolean | null;
};

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
      tea_id: itemType === "tea" ? itemId : null,
    };

    await urqlClient.mutation(linkItemToBrandMutation, variables);
    console.log(`Linked ${itemType} ${itemId} to brand ${brandId}`);
  } catch (error) {
    console.warn(`Failed to link brand to ${itemType}:`, error);
    // Non-blocking - item was created successfully, brand linking is optional
  }
}

/**
 * Escape `_ilike` / LIKE metacharacters so user-typed brand names match
 * literally instead of being interpreted as wildcards (Postgres uses `\` as
 * the default LIKE escape character).
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Resolve a brand selection to a concrete brand id, creating the brand if the
 * user typed a name that doesn't already exist.
 *
 * Dedupes against existing brands by exact (case-insensitive) name so manual
 * entry doesn't pile up duplicates. If a concurrent insert wins the unique-name
 * race (a `lower(name)` unique index backs the brands table), the create fails
 * and we re-resolve to the existing row. Non-throwing: returns undefined on
 * failure.
 */
export async function ensureBrandId(
  urqlClient: Client,
  selection: BrandSelection,
  itemType: ItemTypeForBrand,
): Promise<string | undefined> {
  // An existing brand was selected from the picker.
  if (selection.brand_id) {
    return selection.brand_id;
  }

  const name = selection.brand_name?.trim();
  if (!name) {
    return undefined;
  }

  // Exact (case-insensitive) match: escape wildcards so e.g. "100%" or "A_B"
  // don't match unrelated rows.
  const findExisting = async (): Promise<string | undefined> => {
    const existing = await urqlClient
      .query(SearchBrandsQuery, { search: escapeLike(name), limit: 5 })
      .toPromise();
    return existing.data?.brands.find(
      (brand) => brand.name.toLowerCase() === name.toLowerCase(),
    )?.id;
  };

  try {
    const existingId = await findExisting();
    if (existingId) {
      return existingId;
    }

    const created = await urqlClient
      .mutation(InsertBrandMutation, {
        name,
        brand_type: BRAND_TYPE_BY_ITEM[itemType],
      })
      .toPromise();
    const createdId = created.data?.insert_brands_one?.id;
    if (createdId) {
      return createdId;
    }

    // Insert returned no row (e.g. a concurrent insert won the unique-name
    // race) — re-resolve to the brand that now exists.
    return await findExisting();
  } catch (error) {
    console.warn(`Failed to ensure brand "${name}":`, error);
    // A unique-violation from a concurrent create lands here; try once more to
    // return the existing brand rather than dropping the link.
    try {
      return await findExisting();
    } catch {
      return undefined;
    }
  }
}

/**
 * Resolve a brand selection and link it to a freshly created item.
 *
 * Non-blocking: if anything fails the item is still considered created.
 */
export async function ensureAndLinkBrand(
  urqlClient: Client,
  itemId: string,
  itemType: ItemTypeForBrand,
  selection: BrandSelection,
): Promise<void> {
  const brandId = await ensureBrandId(urqlClient, selection, itemType);
  if (brandId) {
    await linkItemToBrand(urqlClient, itemId, brandId, itemType);
  }
}
