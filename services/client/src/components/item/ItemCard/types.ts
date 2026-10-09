/**
 * The old card's props (`82450ad1:src/components/item/ItemCard/index.tsx`,
 * `ItemCardItem`), in their own plain module so adapters and server code can
 * name the type without importing a `"use client"` file.
 *
 * Two fields changed shape, because what fed them changed:
 *
 * - `displayImageId` → `displayImageUrl`. The old card turned a Nhost file id
 *   into a public URL itself; the new API hands back a presigned
 *   `ItemImage.file.url` instead, so the adapter supplies the URL.
 * - `favoriteId` → `isFavorite`. The old toggle deleted a favourite *row* by
 *   id; `toggleFavorite` is keyed on the item, so a boolean is all it needs.
 *
 * Everything else is the old field with the old meaning, including the rule
 * that a `null`/`undefined` count hides its section.
 */
import type { LabelPlateData } from "@/lib/items/label-plate";

export type ItemCardItem = {
  /** What `onClick` receives: the cellar-item id in a cellar, else the item id. */
  id: string;
  /** The catalog item's id — what favouriting is keyed on. */
  itemId: string;
  name: string;
  vintage?: string;
  subtitle?: string;
  displayImageUrl?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
  reviewed?: boolean | null;
  favoriteCount?: number | null;
  isFavorite?: boolean | null;
  /**
   * The viewer's own score (G7 `myReview.score`) — "your stars" on a
   * BottleCard. Absent when not selected or not reviewed.
   */
  myScore?: number | null;
  /**
   * What the LabelPlate prints when there is no photo (N28). Absent: the
   * card builds a name-only plate.
   */
  plate?: LabelPlateData;
};
