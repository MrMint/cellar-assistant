/**
 * `/favorites` adapters: the URL's type filter → `favorites(types:)`, and a
 * favourited `Item` → the old `FavoritesClient`'s `{ item, type }` grid row.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { FAVORITES_PAGE_SIZE } from "./fragments";

export type FavoriteGridRow = { item: ItemCardItem; type: ApiItemType };

/** One favourited item → one card, keyed and linked by the item's id. */
export const favoriteRowFromNode = (
  node: FragmentOf<typeof ItemCardFragment>,
): FavoriteGridRow => ({
  type: readFragment(ItemCardFragment, node).type,
  item: itemCardFromFragment(node),
});

/**
 * The variables for one page. No filter (or every type, which the old hook
 * also collapsed to none) is `types: null` — all six, sake and tea included.
 */
export const favoritesVariables = (
  types: readonly ApiItemType[] | null | undefined,
  after: string | null,
) => ({
  first: FAVORITES_PAGE_SIZE,
  after,
  types:
    types === null || types === undefined || types.length === 0
      ? null
      : [...types],
});

/** The old grid's cache key, so scroll restore stays per filter. */
export const favoritesCacheKey = (
  types: readonly string[] | null | undefined,
): string => `favorites-${types?.join(",") || "all"}`;
