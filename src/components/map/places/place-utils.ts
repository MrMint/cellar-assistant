/** Shared formatting utilities for place display components. */

/** Converts a snake_case category to Title Case (e.g. "coffee_shop" → "Coffee Shop"). */
export function formatCategoryName(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Formats a 4-digit time string like "0900" to "9:00 AM". */
export function formatTimeString(time: string): string {
  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = time.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes} ${period}`;
}

/** Converts a numeric price level (1–4) to dollar signs. */
export function getPriceLevelText(level?: number | null): string | null {
  if (!level) return null;
  return "$".repeat(level);
}
