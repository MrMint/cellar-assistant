/**
 * Shared place category definitions.
 *
 * Single source of truth for user-selectable place categories.
 * Used by both the frontend form and backend prompt/validation.
 *
 * NOTE: This covers categories users can CREATE places with.
 * Overture Maps data may have additional categories (steakhouse,
 * hotel, casino, etc.) defined in the frontend PlaceCategory type.
 */

export const PLACE_CATEGORY_TIERS = {
  venues: [
    "restaurant",
    "bar",
    "cafe",
    "coffee_shop",
    "cocktail_bar",
    "wine_bar",
    "brewery",
    "winery",
    "distillery",
    "pub",
    "beer_bar",
    "sports_bar",
    "lounge",
    "gastropub",
    "tapas_bar",
    "sake_bar",
    "whiskey_bar",
    "beer_garden",
    "wine_tasting_room",
    "coffee_roastery",
  ],
  retail: [
    "liquor_store",
    "beer_wine_and_spirits",
    "beverage_store",
    "specialty_store",
  ],
} as const;

export const USER_PLACE_CATEGORIES = [
  ...PLACE_CATEGORY_TIERS.venues,
  ...PLACE_CATEGORY_TIERS.retail,
] as const;

export type UserPlaceCategory = (typeof USER_PLACE_CATEGORIES)[number];

const LABEL_OVERRIDES: Partial<Record<UserPlaceCategory, string>> = {
  beer_wine_and_spirits: "Beer, Wine & Spirits",
};

/** Format a category slug into Title Case label (e.g. "coffee_shop" → "Coffee Shop") */
export function formatCategoryLabel(category: string): string {
  const override = LABEL_OVERRIDES[category as UserPlaceCategory];
  if (override) return override;
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Format all user-selectable categories into a comma-separated string for display/prompts */
export function formatAllCategories(): string {
  return USER_PLACE_CATEGORIES.map(formatCategoryLabel).join(", ");
}
