import { ITEM_TYPE_JOY_COLORS } from "../constants/colors";
import type { ItemType, PlaceCategory } from "../types";

// Item type configuration for UI
export interface ItemTypeConfig {
  id: ItemType;
  label: string;
  icon: string; // Icon key for ITEM_TYPE_ICONS mapping
  color: "danger" | "warning" | "neutral" | "success"; // Joy UI color scheme
}

export const ITEM_TYPES: ItemTypeConfig[] = [
  {
    id: "wine",
    label: "Wine",
    icon: "WineBar",
    color: ITEM_TYPE_JOY_COLORS.wine,
  },
  {
    id: "beer",
    label: "Beer",
    icon: "SportsBar",
    color: ITEM_TYPE_JOY_COLORS.beer,
  },
  {
    id: "spirit",
    label: "Spirits",
    icon: "LocalBar",
    color: ITEM_TYPE_JOY_COLORS.spirit,
  },
  {
    id: "coffee",
    label: "Coffee",
    icon: "Coffee",
    color: ITEM_TYPE_JOY_COLORS.coffee,
  },
  {
    id: "sake",
    label: "Sake",
    icon: "Sake",
    color: ITEM_TYPE_JOY_COLORS.sake,
  },
];

// Comprehensive category mappings based on Overture analysis
const WINE_CATEGORIES: PlaceCategory[] = [
  // Tier 1: Highest likelihood (90%+)
  "winery",
  // Note: 'wine_bar' and 'wine_tasting_room' may not exist in current PlaceCategory type

  // Tier 2: High likelihood (70-90%)
  "restaurant",

  // Tier 3: Good likelihood (50-70%)
  "bar",
];

const BEER_CATEGORIES: PlaceCategory[] = [
  // Tier 1: Highest likelihood (90%+)
  "brewery",
  "bar",

  // Tier 2: High likelihood (70-90%)
  "restaurant",

  // Tier 3: Good likelihood (50-70%)
  "cafe", // Some cafes serve beer
];

const SPIRITS_CATEGORIES: PlaceCategory[] = [
  // Tier 1: Highest likelihood (90%+)
  "bar",

  // Tier 2: High likelihood (70-90%)
  "restaurant",

  // Note: 'distillery', 'cocktail_bar', 'whiskey_bar' may not exist in current PlaceCategory type
];

const COFFEE_CATEGORIES: PlaceCategory[] = [
  // Tier 1: Highest likelihood (95%+)
  "cafe",

  // Tier 2: High likelihood (70-90%)
  "restaurant",

  // Note: 'coffee_shop', 'coffee_roastery' may not exist in current PlaceCategory type
];

const SAKE_CATEGORIES: PlaceCategory[] = [
  // Tier 1: Highest likelihood (90%+)
  "restaurant", // Japanese restaurants, izakayas
  "bar",

  // Tier 2: High likelihood (70-90%)
  "specialty_store", // Sake shops, Japanese liquor stores

  // Note: 'sake_brewery', 'izakaya', 'japanese_restaurant' may not exist in current PlaceCategory type
];

// Mapping interface
export interface CategoryMapping {
  getCategories(itemTypes: ItemType[]): PlaceCategory[];
  getDefaultCategories(): PlaceCategory[];
  getCategoriesForItemType(itemType: ItemType): PlaceCategory[];
}

// Implementation of the category mapper
export class ItemTypeCategoryMapper implements CategoryMapping {
  private readonly mappings: Record<ItemType, PlaceCategory[]> = {
    wine: WINE_CATEGORIES,
    beer: BEER_CATEGORIES,
    spirit: SPIRITS_CATEGORIES,
    coffee: COFFEE_CATEGORIES,
    sake: SAKE_CATEGORIES,
  };

  /**
   * Get combined categories for selected item types
   */
  getCategories(itemTypes: ItemType[]): PlaceCategory[] {
    if (itemTypes.length === 0) {
      return []; // No filtering when no item types selected
    }

    const categorySet = new Set<PlaceCategory>();

    itemTypes.forEach((itemType) => {
      this.mappings[itemType]?.forEach((category) => {
        categorySet.add(category);
      });
    });

    return Array.from(categorySet);
  }

  /**
   * Get default categories when no item types are selected
   */
  getDefaultCategories(): PlaceCategory[] {
    // Return broad categories when no item types selected (current behavior)
    return ["restaurant", "bar", "cafe", "brewery", "winery"];
  }

  /**
   * Get categories for a specific item type
   */
  getCategoriesForItemType(itemType: ItemType): PlaceCategory[] {
    return this.mappings[itemType] || [];
  }

  /**
   * Get item types that would include a given category
   */
  getItemTypesForCategory(category: PlaceCategory): ItemType[] {
    const itemTypes: ItemType[] = [];

    Object.entries(this.mappings).forEach(([itemType, categories]) => {
      if (categories.includes(category)) {
        itemTypes.push(itemType as ItemType);
      }
    });

    return itemTypes;
  }
}

// Singleton instance
export const categoryMapper = new ItemTypeCategoryMapper();
