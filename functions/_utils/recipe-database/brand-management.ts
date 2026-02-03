/**
 * Brand Management Operations
 *
 * Handles finding existing brands and creating new ones,
 * plus linking items to brands.
 *
 * Uses PostgreSQL pg_trgm extension for efficient database-side
 * similarity matching instead of client-side fuzzy matching.
 */

import { BRAND_TYPES } from "../shared-enums";
import {
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
} from "../urql-client";
import {
  CreateBrandMutation,
  CreateBrandWithDetailsMutation,
  FindBrandQuery,
  LinkItemToBrandMutation,
  SearchBrandsBySimilarityQuery,
} from "./graphql-operations";

// =============================================================================
// Types for Enhanced Brand Management
// =============================================================================

/**
 * Criteria used to match an existing brand
 */
export interface BrandMatchCriteria {
  name: string;
  brandType?: string;
  region?: string;
  country?: string;
}

/**
 * Full details for creating a new brand
 */
export interface BrandDetails {
  name: string;
  description?: string;
  brandType: string;
  region?: string;
  country?: string;
  website?: string;
  parentBrandName?: string;
}

/**
 * Result from brand matching/creation
 */
export interface BrandResult {
  id: string;
  name: string;
  isNew: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Similarity threshold for database-side trigram matching (0.0-1.0)
 * pg_trgm similarity returns 0.0-1.0, with 1.0 being exact match
 * 0.5 is a reasonable threshold for catching typos and variations
 */
const SIMILARITY_THRESHOLD = 0.5;

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
    | "kura"
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
 * Enhanced brand matching and creation with smart matching
 *
 * This function:
 * 1. Attempts exact name match first
 * 2. Falls back to fuzzy matching if no exact match
 * 3. Uses country to disambiguate multiple fuzzy matches
 * 4. Creates new brand with full details if no match found
 *
 * @param criteria - Criteria for matching existing brands
 * @param details - Full details for creating a new brand if needed
 * @returns Brand ID, name, and whether it was newly created
 */
export async function findOrCreateBrandWithDetails(
  criteria: BrandMatchCriteria,
  details: BrandDetails,
): Promise<BrandResult> {
  const { name: brandName, country } = criteria;

  if (!brandName || brandName.trim().length === 0) {
    throw new Error("Brand name is required for matching");
  }

  const trimmedName = brandName.trim();
  console.log(
    `🏷️ [findOrCreateBrandWithDetails] Processing brand: "${trimmedName}"`,
  );

  // Step 1: Try exact match first (case-insensitive)
  const exactMatch = await functionQuery(
    FindBrandQuery,
    { name: trimmedName },
    { headers: getAdminAuthHeaders() },
  );

  if (exactMatch?.brands && exactMatch.brands.length > 0) {
    const brand = exactMatch.brands[0];
    console.log(
      `✅ [findOrCreateBrandWithDetails] Exact match found: "${brand.name}" (${brand.id})`,
    );
    return { id: brand.id, name: brand.name, isNew: false };
  }

  // Step 2: Try database-side similarity matching using pg_trgm
  // This uses the PostgreSQL trigram index for efficient similarity search
  const similarityResult = await functionQuery(
    SearchBrandsBySimilarityQuery,
    {
      search_term: trimmedName,
      similarity_threshold: SIMILARITY_THRESHOLD,
      max_results: 10,
    },
    { headers: getAdminAuthHeaders() },
  );

  // Type for similarity search results
  type SimilaritySearchResult = {
    id: string;
    name: string;
    description: string | null;
    brand_type: string | null;
    similarity_score: number;
  };

  const similarBrands =
    (similarityResult?.searchBrandsBySimilarity as SimilaritySearchResult[]) ||
    [];

  if (similarBrands.length > 0) {
    // Results are already sorted by similarity_score DESC from the database
    const bestMatch = similarBrands[0];

    if (similarBrands.length === 1) {
      // Single good match - use it
      console.log(
        `✅ [findOrCreateBrandWithDetails] Similarity match found: "${bestMatch.name}" (score: ${bestMatch.similarity_score.toFixed(2)})`,
      );
      return { id: bestMatch.id, name: bestMatch.name, isNew: false };
    }

    // Multiple matches - try to disambiguate by country in description
    if (country) {
      console.log(
        `🔍 [findOrCreateBrandWithDetails] Multiple matches (${similarBrands.length}), checking descriptions for country: ${country}`,
      );

      const countryMatch = similarBrands.find((b) =>
        b.description?.toLowerCase().includes(country.toLowerCase()),
      );

      if (countryMatch) {
        console.log(
          `✅ [findOrCreateBrandWithDetails] Country-disambiguated match: "${countryMatch.name}" (score: ${countryMatch.similarity_score.toFixed(2)})`,
        );
        return { id: countryMatch.id, name: countryMatch.name, isNew: false };
      }
    }

    // No country match or no country provided - use the best scoring match
    console.log(
      `✅ [findOrCreateBrandWithDetails] Best similarity match: "${bestMatch.name}" (score: ${bestMatch.similarity_score.toFixed(2)})`,
    );
    return { id: bestMatch.id, name: bestMatch.name, isNew: false };
  }

  // Step 3: No match found - create new brand with full details
  console.log(
    `🆕 [findOrCreateBrandWithDetails] Creating new brand: "${trimmedName}"`,
  );

  // Build description from AI-extracted details
  let description = details.description || "";
  if (!description && (details.region || details.country)) {
    const locationParts = [details.region, details.country].filter(Boolean);
    description = `${trimmedName} is a ${details.brandType || "producer"} based in ${locationParts.join(", ")}.`;
  }
  if (details.website) {
    description = description
      ? `${description} Website: ${details.website}`
      : `Website: ${details.website}`;
  }

  // Determine brand type
  const finalBrandType = (details.brandType || BRAND_TYPES.OTHER) as
    | "brewery"
    | "distillery"
    | "kura"
    | "manufacturer"
    | "other"
    | "restaurant_chain"
    | "roastery"
    | "winery";

  // Handle parent brand if provided
  let parentBrandId: string | undefined;
  if (details.parentBrandName && details.parentBrandName.trim().length > 0) {
    try {
      console.log(
        `🔗 [findOrCreateBrandWithDetails] Looking up parent brand: "${details.parentBrandName}"`,
      );
      const parentResult = await findOrCreateBrand(
        details.parentBrandName.trim(),
        "manufacturer", // Parent brands are typically holding companies
      );
      parentBrandId = parentResult.id;
    } catch (error) {
      console.warn(
        `⚠️ [findOrCreateBrandWithDetails] Failed to create parent brand: ${error}`,
      );
      // Continue without parent brand - not a blocking error
    }
  }

  try {
    const createResult = await functionMutation(
      CreateBrandWithDetailsMutation,
      {
        name: trimmedName,
        brand_type: finalBrandType,
        description: description || `AI-detected brand: ${trimmedName}`,
        parent_brand_id: parentBrandId || null,
      },
      { headers: getAdminAuthHeaders() },
    );

    if (!createResult?.insert_brands_one) {
      throw new Error("Brand creation returned no data");
    }

    const newBrand = createResult.insert_brands_one;
    console.log(
      `✅ [findOrCreateBrandWithDetails] Created new brand: "${newBrand.name}" (${newBrand.id})`,
    );

    return { id: newBrand.id, name: newBrand.name, isNew: true };
  } catch (error) {
    // Race condition handling - another process may have created the brand
    const errorMessage = String(error);
    if (
      errorMessage.includes("duplicate") ||
      errorMessage.includes("unique") ||
      errorMessage.includes("constraint")
    ) {
      console.log(
        `⚠️ [findOrCreateBrandWithDetails] Race condition, retrying find for: "${trimmedName}"`,
      );

      const retryResult = await functionQuery(
        FindBrandQuery,
        { name: trimmedName },
        { headers: getAdminAuthHeaders() },
      );

      if (retryResult?.brands && retryResult.brands.length > 0) {
        const brand = retryResult.brands[0];
        return { id: brand.id, name: brand.name, isNew: false };
      }
    }

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
