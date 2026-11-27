import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import {
  itemCardFromItem,
  primaryBrandName,
  subtitleDescriptor,
} from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { itemHref } from "@/components/item-api/itemTypes";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import type { LabelPlateData } from "@/lib/items/label-plate";
import { BrandItemLinkFragment } from "./queries";

/** One drink on a brand's page (lot-cellars-shelves-16): a kit tile. */
export type BrandTile = {
  key: string;
  itemId: string;
  type: ApiItemType;
  name: string;
  maker: string | null;
  style: string | null;
  photoUrl: string | null;
  plate: LabelPlateData | null;
  rating: number | null;
  favorite: boolean;
  href: string;
  /** Your cellars holding a bottle of it (never anyone else's). */
  cellars: { id: string; name: string }[];
};

/** An `ItemBrand` link → its tile. */
export const brandTileFromLink = (
  data: FragmentOf<typeof BrandItemLinkFragment>,
): BrandTile => {
  const link = readFragment(BrandItemLinkFragment, data);
  const source = readFragment(ItemCardFragment, link.item);
  const card = itemCardFromItem(source);
  const seen = new Set<string>();
  const cellars = (link.item.myBottles?.edges ?? []).flatMap(({ node }) => {
    const cellar = node.cellar;
    if (cellar === null || cellar === undefined || seen.has(cellar.id)) {
      return [];
    }
    seen.add(cellar.id);
    return [{ id: cellar.id, name: cellar.name }];
  });
  return {
    key: link.id,
    itemId: link.item.id,
    type: link.item.type,
    name: card.name,
    maker: primaryBrandName(source) ?? null,
    style: subtitleDescriptor(source) ?? null,
    photoUrl: card.displayImageUrl ?? null,
    plate: card.plate ?? null,
    rating: card.myScore ?? null,
    favorite: card.isFavorite ?? false,
    href: itemHref(link.item.type, link.item.id),
    cellars,
  };
};

/**
 * The segment's cells: All, then "In <cellar>" for each of your cellars
 * holding any of the brand, most first.
 */
export const shelfCellars = (
  tiles: readonly BrandTile[],
): { id: string; name: string; count: number }[] => {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const tile of tiles) {
    for (const cellar of tile.cellars) {
      const entry = counts.get(cellar.id) ?? { ...cellar, count: 0 };
      entry.count += 1;
      counts.set(cellar.id, entry);
    }
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
};

/** "Beer · 23 drinks": the kinds it makes, then how many drinks. */
export const brandSubtitle = (
  tiles: readonly Pick<BrandTile, "type">[],
  total: number,
): string => {
  const kinds = Array.from(new Set(tiles.map((t) => t.type))).map(
    itemTypeLabel,
  );
  const drinks = `${total.toLocaleString("en-US")} ${total === 1 ? "drink" : "drinks"}`;
  return [...kinds.slice(0, 2), drinks].join(" · ");
};
