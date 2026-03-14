/**
 * Placeholder detection for AI-extracted data.
 *
 * The AI sometimes fills fields with generic placeholders ("N/A", "Unknown", etc.)
 * instead of returning null. These utilities detect and filter those values.
 */

/** Placeholder strings the AI uses when it can't extract real data. Matched case-insensitively. */
export const PLACEHOLDER_VALUES = new Set([
  "n/a",
  "na",
  "none",
  "unknown",
  "not available",
  "not specified",
  "unspecified",
]);

/**
 * Check whether a value represents meaningful extracted data.
 * Returns false for null, undefined, empty strings, placeholder strings,
 * and numeric zero (which the AI uses as a default when no real value exists).
 */
export function isMeaningfulValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") return false;
    if (PLACEHOLDER_VALUES.has(normalized)) return false;
    // Reject all-zero barcodes (e.g. "00000000000000")
    if (/^0+$/.test(normalized)) return false;
  }
  return true;
}
