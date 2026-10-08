/**
 * The user-selectable place categories — the create form's vocabulary.
 *
 * The list itself is `@cellar-assistant/contracts/place-categories`, the one
 * the AI place review's schema also spreads (D15: one list for both), so the
 * form and the reviewer cannot drift. `createPlace` accepts any non-empty
 * list (`requireCategories`), so this is the form's vocabulary, not a server
 * allow-list.
 */
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_TIERS,
} from "@cellar-assistant/contracts/place-categories";

export { PLACE_CATEGORY_TIERS };

export const USER_PLACE_CATEGORIES = PLACE_CATEGORIES;

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
