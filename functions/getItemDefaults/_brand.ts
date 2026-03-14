/**
 * Brand processing logic shared between getItemDefaults and reprocessOnboardingBatch.
 */

import {
  type BrandDetails,
  type BrandMatchCriteria,
  findOrCreateBrandWithDetails,
} from "../_utils/recipe-database/brand-management";
import { BRAND_TYPES } from "../_utils/shared-enums";
import type { AIDefaults, ItemType } from "./_utils";

export function getBrandNameFromDefaults(
  aiDefaults: AIDefaults,
  itemType: ItemType,
): string | undefined {
  const explicitBrandName = (aiDefaults as { brand_name?: string }).brand_name;
  if (explicitBrandName && explicitBrandName.trim().length > 0) {
    return explicitBrandName.trim();
  }

  switch (itemType) {
    case "WINE":
      return (aiDefaults as { winery?: string }).winery?.trim();
    case "BEER":
      return (aiDefaults as { brewery?: string }).brewery?.trim();
    case "SPIRIT":
      return (aiDefaults as { distillery?: string }).distillery?.trim();
    case "COFFEE":
      return (aiDefaults as { roaster?: string }).roaster?.trim();
    case "SAKE":
      return (aiDefaults as { kura?: string }).kura?.trim();
    default:
      return undefined;
  }
}

export function getBrandTypeForItemType(itemType: ItemType): string {
  switch (itemType) {
    case "WINE":
      return BRAND_TYPES.WINERY;
    case "BEER":
      return BRAND_TYPES.BREWERY;
    case "SPIRIT":
      return BRAND_TYPES.DISTILLERY;
    case "COFFEE":
      return BRAND_TYPES.ROASTERY;
    case "SAKE":
      return BRAND_TYPES.KURA;
    default:
      return BRAND_TYPES.OTHER;
  }
}

export async function processBrandFromAIDefaults(
  aiDefaults: AIDefaults,
  itemType: ItemType,
): Promise<{ id: string; name: string; isNew: boolean } | null> {
  const brandName = getBrandNameFromDefaults(aiDefaults, itemType);

  if (!brandName || brandName.trim().length === 0) {
    console.log("🏷️ [processBrand] No brand name detected in AI defaults");
    return null;
  }

  console.log(`🏷️ [processBrand] Processing brand: "${brandName}"`);

  const brandType = getBrandTypeForItemType(itemType);

  const criteria: BrandMatchCriteria = {
    name: brandName,
    brandType,
    region: (aiDefaults as { brand_region?: string }).brand_region,
    country: (aiDefaults as { brand_country?: string }).brand_country,
  };

  const details: BrandDetails = {
    name: brandName,
    description: (aiDefaults as { brand_description?: string })
      .brand_description,
    brandType,
    region: (aiDefaults as { brand_region?: string }).brand_region,
    country: (aiDefaults as { brand_country?: string }).brand_country,
    website: (aiDefaults as { brand_website?: string }).brand_website,
    parentBrandName: (aiDefaults as { parent_brand_name?: string })
      .parent_brand_name,
  };

  try {
    const result = await findOrCreateBrandWithDetails(criteria, details);
    console.log(
      `✅ [processBrand] Brand resolved: "${result.name}" (${result.id})${result.isNew ? " [NEW]" : ""}`,
    );
    return result;
  } catch (error) {
    console.warn(`⚠️ [processBrand] Failed to process brand: ${error}`);
    return null;
  }
}
