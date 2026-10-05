/**
 * `place_menu_items` row → `PlaceMenuItemDto`, shared by its writer and its
 * readers (UI parity wave C).
 *
 * `PlaceActor` writes the table and pages a place's lines; since wave C,
 * `MenuScanActor.menuItems` (G19, one scan's lines) and
 * `MatchSuggestionsCollectionActor.menuItemsOf` (G20, the line behind each
 * suggestion) read it too — §1.1 lets an actor read any table, and §1.3 only
 * forbids *caching* rows it does not write, which neither does. Three copies
 * of one mapping are how three readers start disagreeing about what a line
 * says, so it lives here, as `ingredientRowToDto` does for recipe lines.
 */
import type {
  MenuItemMatch,
  PlaceMenuItemDto,
} from "@cellar-assistant/contracts";
import {
  isMenuItemType,
  matchableMenuItemType,
} from "@cellar-assistant/contracts";
import type { placeMenuItems } from "@cellar-assistant/db";
import { ARCS } from "./item-arcs.ts";

export type PlaceMenuItemRow = typeof placeMenuItems.$inferSelect;

/**
 * `place_menu_items`' item arc (`./item-arcs.ts`). A match names its type in
 * lower case (`MatchableMenuItemType`, the `detected_item_type` spelling).
 */
export const PLACE_MENU_ITEM_ARC = ARCS.placeMenuItems;

const num = (value: string | number | null): number | null => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The one FK column `check_single_item_type` allows, collapsed. */
export const menuItemMatchOf = (
  row: PlaceMenuItemRow,
): MenuItemMatch | null => {
  const ref = PLACE_MENU_ITEM_ARC.refOf(row);
  return ref === null
    ? null
    : { type: matchableMenuItemType(ref.type), id: ref.id };
};

export const menuItemRowToDto = (row: PlaceMenuItemRow): PlaceMenuItemDto => ({
  id: row.id,
  placeId: row.placeId,
  placeMenuId: row.placeMenuId,
  menuScanId: row.menuScanId,
  name: row.menuItemName,
  description: row.menuItemDescription,
  price: num(row.menuItemPrice),
  menuCategory: row.menuCategory,
  detectedItemType:
    row.detectedItemType !== null && isMenuItemType(row.detectedItemType)
      ? row.detectedItemType
      : null,
  confidenceScore: num(row.confidenceScore),
  extractedAttributes: asRecord(row.extractedAttributes),
  matchedItem: menuItemMatchOf(row),
  matchVerifiedById: row.matchVerifiedBy,
  matchVerifiedAt: iso(row.matchVerifiedAt),
  isAvailable: row.isAvailable ?? true,
  seasonal: row.seasonal ?? false,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});
