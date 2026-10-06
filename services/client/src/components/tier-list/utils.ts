/**
 * Formats a snake_case category string into Title Case.
 * e.g. "fast_food_restaurant" → "Fast Food Restaurant"
 */
export function formatCategoryName(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
