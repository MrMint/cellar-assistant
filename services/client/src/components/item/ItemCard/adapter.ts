/**
 * New API shapes → the old `ItemCard` props.
 *
 * The input types are **structural**, not `ResultOf<typeof ItemCardFragment>`,
 * so any domain's own fragment can feed a card as long as it selected the
 * fields — `/favorites`' `FavoriteItem`, search hits, ranking rows. Every field
 * is optional: a field the caller did not select simply leaves its card
 * section hidden, exactly as a `null` aggregate did in the old card.
 *
 * `favoriteCount` (G6) and `myReview` (G7) are optional for the same reason:
 * `ItemCardFragment` selects both, but a domain fragment that does not gets a
 * card without the heart count and without the gold star, rather than a lie.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { buildItemSubtitle, formatVintage } from "@/utilities";
import { ItemCardFragment } from "./fragments";
import type { ItemCardItem } from "./types";

type Connection<T> = { edges: readonly { node: T }[] } | null | undefined;

export type ItemCardSource = {
  id: string;
  type: ApiItemType;
  name: string;
  isFavorite?: boolean | null;
  score?: { average?: number | null; count: number } | null;
  images?: Connection<{
    fileId?: string | null;
    placeholder?: string | null;
    file?: { url: string } | null;
  }>;
  brands?: Connection<{
    isPrimary?: boolean | null;
    brand?: { name: string } | null;
  }>;
  /** Wine, beer, spirit: an ISO day. */
  vintage?: string | null;
  /** Sake: an integer year. */
  vintageYear?: number | null;
  /** Wine's subtitle descriptor. */
  variety?: string | null;
  beerStyle?: string | null;
  spiritStyle?: string | null;
  roastLevel?: string | null;
  /** Sake and tea's subtitle descriptor. */
  category?: string | null;
  /** G6. */
  favoriteCount?: number | null;
  /** G7. Non-null means the viewer reviewed it. */
  myReview?: { score?: number | null } | null;
};

/**
 * The per-type descriptor the old fragments aliased as `subtitle_field`:
 * wine variety, beer/spirit style, coffee roast level, sake/tea category.
 */
export const subtitleDescriptor = (
  item: ItemCardSource,
): string | null | undefined => {
  switch (item.type) {
    case "WINE":
      return item.variety;
    case "BEER":
      return item.beerStyle;
    case "SPIRIT":
      return item.spiritStyle;
    case "COFFEE":
      return item.roastLevel;
    case "SAKE":
    case "TEA":
      return item.category;
  }
};

/**
 * The one brand the old card showed: `order_by: { is_primary: desc }, limit: 1`.
 * The new connection has no order argument, so the primary is chosen here
 * from whatever page the caller selected, falling back to the first.
 */
const primaryBrandName = (item: ItemCardSource): string | undefined => {
  const nodes = item.brands?.edges.map((edge) => edge.node) ?? [];
  const chosen = nodes.find((node) => node.isPrimary === true) ?? nodes[0];
  return chosen?.brand?.name ?? undefined;
};

/** `"reviewed"` only means something when the caller selected `myReview`. */
const reviewedFrom = (item: ItemCardSource): boolean | undefined =>
  "myReview" in item
    ? item.myReview !== null && item.myReview !== undefined
    : undefined;

/**
 * An `Item` → card props. `id` and `itemId` are both the item's id: off a
 * cellar there is no bottle to distinguish.
 */
export const itemCardFromItem = (item: ItemCardSource): ItemCardItem => {
  const image = item.images?.edges[0]?.node;
  // Coffee and tea had no vintage in the old card (`vintage: undefined`).
  const hasVintage = item.type !== "COFFEE" && item.type !== "TEA";
  return {
    id: item.id,
    itemId: item.id,
    name: item.name,
    vintage: hasVintage
      ? formatVintage(item.vintage ?? item.vintageYear)
      : undefined,
    subtitle: buildItemSubtitle({
      brandName: primaryBrandName(item),
      descriptor: subtitleDescriptor(item),
    }),
    displayImageUrl: image?.file?.url ?? undefined,
    placeholder: image?.placeholder ?? null,
    score: item.score?.average ?? null,
    reviewCount: item.score?.count ?? null,
    reviewed: reviewedFrom(item),
    favoriteCount: item.favoriteCount ?? null,
    isFavorite: item.isFavorite ?? false,
  } satisfies ItemCardItem;
};

export type CellarItemCardSource = {
  id: string;
  item: ItemCardSource;
};

/**
 * A `CellarItem` (one bottle) → card props. `id` is the **bottle's** id, as
 * the old `transformCellarItems` set it, so the cellar-item URL keeps its
 * production meaning (decision 1); `itemId` is the catalog item's, which is
 * what favouriting is keyed on.
 */
export const itemCardFromCellarItem = (
  cellarItem: CellarItemCardSource,
): ItemCardItem => ({
  ...itemCardFromItem(cellarItem.item),
  id: cellarItem.id,
});

/**
 * The common case: a query spread `...ItemCard`. Also the compile-time proof
 * that the fragment's result type fits `ItemCardSource` — if a selection ever
 * drifts from what the adapter reads, this stops type-checking.
 */
export const itemCardFromFragment = (
  data: FragmentOf<typeof ItemCardFragment>,
): ItemCardItem => itemCardFromItem(readFragment(ItemCardFragment, data));
