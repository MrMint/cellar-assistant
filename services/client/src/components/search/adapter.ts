/**
 * New API shapes → the old `/search` page's props and copy
 * (`82450ad1:src/app/(authenticated)/search/page.tsx`).
 *
 * Pure, so the page's decisions — which branch renders, what the stats line
 * says, what a hit becomes on a card — are tested without a server.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemCardFromItem } from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";

/**
 * One card in the results grid — the old `BarcodeSearchResult`, which was an
 * `ItemCardItem` plus its `type`.
 */
export type SearchResultItem = ItemCardItem & { type: ApiItemType };

/** Any node spread with `...ItemCard` → a card that knows its type. */
export const searchResultFromCard = (
  node: FragmentOf<typeof ItemCardFragment>,
): SearchResultItem => {
  const item = readFragment(ItemCardFragment, node);
  return { ...itemCardFromItem(item), type: item.type };
};

/**
 * `itemSearch` / `barcode.items` edges → cards, in the server's order (by
 * distance, for a text search).
 */
export const searchResultsFromNodes = (
  nodes: readonly FragmentOf<typeof ItemCardFragment>[],
): SearchResultItem[] => nodes.map(searchResultFromCard);

/**
 * The old `CollectionStats` line, verbatim: the six per-type counts summed,
 * and the cellar count.
 */
export const collectionStatsLine = (stats: {
  cellarCount: number;
  itemCounts: {
    wine: number;
    beer: number;
    spirit: number;
    coffee: number;
    sake: number;
    tea: number;
  };
}): string => {
  const { itemCounts: c, cellarCount } = stats;
  const totalItems = c.beer + c.wine + c.spirit + c.coffee + c.sake + c.tea;
  const cellars = `${cellarCount} ${cellarCount === 1 ? "cellar" : "cellars"}`;
  if (totalItems === 0) {
    return "Your collection awaits. Start by adding your first item.";
  }
  return totalItems === 1
    ? `1 item across ${cellars}`
    : `${totalItems} items across ${cellars}`;
};

/** The longest code `?barcode=` accepts; real symbologies stop well short. */
export const MAX_BARCODE_LENGTH = 64;

export type SearchParams = {
  q?: string | string[];
  barcode?: string | string[];
  image_results?: string | string[];
  image_no_results?: string | string[];
};

export type SearchState = {
  /** The trimmed text query, or null. */
  query: string | null;
  /** The scanned code, or null. */
  barcode: string | null;
  /** An old `?image_results=` / `?image_no_results=` link (G32). */
  imageSearch: boolean;
  /** The old `hasActiveSearch`: any of the above hides the landing view. */
  hasActiveSearch: boolean;
};

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The URL → which branch of the old page renders.
 *
 * - `?q=` is the old text search, unchanged.
 * - `?barcode=<code>` replaces the old `?barcode_results=<JSON>`: the old page
 *   serialized whole result rows into the URL (forgeable and unbounded, §7);
 *   now the URL carries only the code, and the server looks it up. A code that
 *   is blank or implausibly long is ignored rather than sent.
 * - `?image_results=` / `?image_no_results=` are old image-search links. Image
 *   search is a chosen drop (G32); the page says so instead of a landing view.
 *   The old `?barcode_no_results=` came only from the stub and is ignored.
 */
export const searchStateFromParams = (params: SearchParams): SearchState => {
  const q = single(params.q)?.trim() ?? "";
  const code = single(params.barcode)?.trim() ?? "";
  const barcode =
    code !== "" && code.length <= MAX_BARCODE_LENGTH ? code : null;
  const imageSearch =
    single(params.image_results) !== undefined ||
    single(params.image_no_results) === "true";
  const query = q === "" ? null : q;
  return {
    query,
    barcode,
    imageSearch,
    hasActiveSearch: query !== null || barcode !== null || imageSearch,
  };
};

/**
 * Where a scanned code goes: `/search?barcode=<code>`, or null for a code
 * {@link searchStateFromParams} would ignore anyway.
 */
export const barcodeSearchHref = (code: string): string | null => {
  const trimmed = code.trim();
  if (trimmed === "" || trimmed.length > MAX_BARCODE_LENGTH) return null;
  return `/search?barcode=${encodeURIComponent(trimmed)}`;
};
