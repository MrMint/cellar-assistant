/**
 * K2 · the place picker's words (Capture-Place 01 to 05).
 *
 * Distances name their origin (Capture-Place lead's ruling 1, CROSS-LOT):
 * the picker measures from the person, so "63 m from you", and "Here" only
 * within 25 m. Kinds are the map's (P1's `placeKind`), so a place reads the
 * same in the picker as on the map.
 *
 * Pure — `place-words.test.ts`.
 */
import {
  categoryWords,
  distanceWords,
  type PlaceKind,
  placeKind,
} from "@/components/map/core/map-places";

/** "Here" within 25 m, else "63 m from you"; empty when unknown. */
export const distanceFromYou = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined) return "";
  if (!Number.isFinite(meters) || meters < 0) return "";
  const words = distanceWords(meters);
  return words === "Here" ? words : `${words} from you`;
};

/** A category's map kind (coffee, food, bar, other). */
export const kindOf = (category: string | null | undefined): PlaceKind =>
  placeKind({ primary_category: category ?? "unknown", categories: [] });

/** The row's line: "Wine bar · 63 m from you", "Coffee shop · Here". */
export const nearbyLine = (
  category: string | null | undefined,
  meters: number | null | undefined,
): string =>
  [category ? categoryWords(category) : null, distanceFromYou(meters) || null]
    .filter((part): part is string => part !== null)
    .join(" · ");

/** A search result's line: "Wine bar · Wauwatosa" (no fix to measure from). */
export const foundLine = (
  category: string | null | undefined,
  locality: string | null | undefined,
): string =>
  [category ? categoryWords(category) : null, locality || null]
    .filter((part): part is string => part !== null)
    .join(" · ");

/** The kit's no-match wording: `No place matches "ruby"`. */
export const noMatchLine = (query: string): string =>
  `No place matches “${query}”`;
