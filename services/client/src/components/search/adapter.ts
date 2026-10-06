/**
 * New API shapes → the old `/search` page's props and copy
 * (`82450ad1:src/app/(authenticated)/search/page.tsx`).
 *
 * Pure, so the page's decisions — which branch renders, what the stats line
 * says, what a hit becomes on a card — are tested without a server.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { richTextFromReviewText } from "@/components/common/rich-text";
import { itemCardFromItem } from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import {
  type FragmentOf,
  type ResultOf,
  readFragment,
} from "@/lib/api/graphql";
import { formatVintage } from "@/utilities";
import {
  RECENT_ACTIVITY_CAP,
  type SearchNearbyPlacesQuery,
  type SearchRecentActivityQuery,
} from "./queries";

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
  image?: string | string[];
  image_results?: string | string[];
  image_no_results?: string | string[];
  activity?: string | string[];
};

export type SearchState = {
  /** The trimmed text query, or null. */
  query: string | null;
  /** The scanned code, or null. */
  barcode: string | null;
  /** The uploaded search photo's file id (`?image=`, G32), or null. */
  imageFileId: string | null;
  /**
   * An old `?image_results=<JSON>` / `?image_no_results=` link, which carried
   * whole result rows rather than a photo — nothing to search again.
   */
  legacyImageLink: boolean;
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
 * - `?image=<fileId>` replaces the old `?image_results=<JSON>` the same way
 *   (G32): the Photo button uploads the capture and the URL carries only the
 *   file id; the server searches with it. Anything that is not a uuid is
 *   ignored rather than sent.
 * - `?image_results=` / `?image_no_results=` are old image-search links with
 *   no photo behind them; the page asks for a new one.
 *   The old `?barcode_no_results=` came only from the stub and is ignored.
 */
export const searchStateFromParams = (params: SearchParams): SearchState => {
  const q = single(params.q)?.trim() ?? "";
  const code = single(params.barcode)?.trim() ?? "";
  const barcode =
    code !== "" && code.length <= MAX_BARCODE_LENGTH ? code : null;
  const image = single(params.image)?.trim().toLowerCase() ?? "";
  const imageFileId = UUID.test(image) ? image : null;
  const legacyImageLink =
    single(params.image_results) !== undefined ||
    single(params.image_no_results) === "true";
  const query = q === "" ? null : q;
  return {
    query,
    barcode,
    imageFileId,
    legacyImageLink,
    hasActiveSearch:
      query !== null ||
      barcode !== null ||
      imageFileId !== null ||
      legacyImageLink,
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Where an uploaded search photo goes: `/search?image=<fileId>` (G32). */
export const imageSearchHref = (fileId: string): string | null => {
  const id = fileId.trim().toLowerCase();
  return UUID.test(id) ? `/search?image=${encodeURIComponent(id)}` : null;
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

/* -------------------------------------------------------------------------- */
/* Discovery — Recent Activity (UI parity G31)                                 */
/* -------------------------------------------------------------------------- */

/**
 * The old feed's filter ids, which are also its `?activity=` values
 * (`82450ad1:src/components/search/RecentActivity.tsx`).
 */
export type ActivityKind = "added" | "reviewed" | "tier-listed";

type ApiActivityKind = "ADDED" | "REVIEWED" | "TIER_LISTED";

const API_KIND: Record<ActivityKind, ApiActivityKind> = {
  added: "ADDED",
  reviewed: "REVIEWED",
  "tier-listed": "TIER_LISTED",
};

/**
 * `?activity=reviewed,tier-listed` → the selected kinds, as the old page
 * parsed it: unknown values dropped, nothing (or nothing valid) is no filter.
 */
export const activityKindsFromParams = (
  params: SearchParams,
): ActivityKind[] => {
  const raw = single(params.activity);
  if (raw === undefined || raw === "") return [];
  return raw
    .split(",")
    .filter((kind): kind is ActivityKind => kind in API_KIND)
    .filter((kind, index, all) => all.indexOf(kind) === index);
};

/** The selected kinds as `recentActivity(kinds:)`; empty means all three. */
export const apiActivityKinds = (
  kinds: readonly ActivityKind[],
): ApiActivityKind[] => kinds.map((kind) => API_KIND[kind]);

type ActivityBase = {
  id: string;
  timestamp: string;
  itemName: string;
  /** `BEER` … `TEA`, or `PLACE` for a tier-listed place. */
  itemType: string;
  /** A presigned read for the thumbnail, where the old feed had a file id. */
  itemImageUrl?: string;
  itemPlaceholder?: string | null;
  itemHref: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
};

/** The old `ActivityEntry`, one image URL in place of the file id. */
export type ActivityEntry =
  | (ActivityBase & { kind: "added"; cellarName: string })
  | (ActivityBase & {
      kind: "reviewed";
      score: number | null;
      reviewText: string | null;
    })
  | (ActivityBase & {
      kind: "tier-listed";
      tierListName: string;
      rank: number;
    });

type ActivityNode = NonNullable<
  ResultOf<typeof SearchRecentActivityQuery>["me"]
>["recentActivity"]["edges"][number]["node"];

const ITEM_ROUTE: Record<string, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

/** The old extractors' name: wine and sake carry their vintage in front. */
const itemDisplayName = (item: NonNullable<ActivityNode["item"]>): string => {
  const vintage =
    item.__typename === "Wine"
      ? formatVintage(item.vintage)
      : item.__typename === "Sake"
        ? formatVintage(item.vintageYear)
        : undefined;
  return vintage === undefined ? item.name : `${vintage} ${item.name}`;
};

/**
 * One API entry → the old `ActivityEntry`, or `null` for a row whose edge the
 * server nulled (an item or list that stopped being visible between reads),
 * which the old extractors skipped the same way (`if (!item) continue`).
 */
export const activityEntryFromNode = (
  node: ActivityNode,
): ActivityEntry | null => {
  const user = {
    userId: node.user?.id ?? "",
    userName: node.user?.displayName ?? "",
    userAvatar: node.user?.avatarUrl ?? null,
  };
  const base = { timestamp: node.occurredAt as string, ...user };

  if (node.kind === "TIER_LISTED") {
    const list = node.tierListItem?.tierList;
    const entry = node.tierListItem;
    if (list === null || list === undefined || entry === null) return null;
    let subject: Pick<
      ActivityBase,
      "itemName" | "itemType" | "itemImageUrl" | "itemPlaceholder"
    > | null = null;
    if (node.item !== null) {
      const image = node.item.images.edges[0]?.node;
      subject = {
        itemName: itemDisplayName(node.item),
        itemType: node.item.type,
        itemImageUrl: image?.file.url ?? undefined,
        itemPlaceholder: image?.placeholder ?? null,
      };
    } else if (node.place !== null) {
      subject = {
        itemName: node.place.displayName ?? node.place.name,
        itemType: "PLACE",
        itemImageUrl: node.place.photos.edges[0]?.node.file?.url ?? undefined,
        itemPlaceholder: undefined,
      };
    }
    if (subject === null) return null;
    return {
      ...base,
      ...subject,
      kind: "tier-listed",
      id: `tier-${entry.id}`,
      itemHref: `/tier-lists/${list.id}?item=${entry.id}`,
      tierListName: list.name,
      rank: node.rank ?? 1,
    };
  }

  if (node.item === null) return null;
  const image = node.item.images.edges[0]?.node;
  const item = {
    itemName: itemDisplayName(node.item),
    itemType: node.item.type,
    itemImageUrl: image?.file.url ?? undefined,
    itemPlaceholder: image?.placeholder ?? null,
    itemHref: `/${ITEM_ROUTE[node.item.type] ?? "wines"}/${node.item.id}`,
  };

  if (node.kind === "REVIEWED") {
    if (node.review === null) return null;
    return {
      ...base,
      ...item,
      kind: "reviewed",
      id: `review-${node.review.id}`,
      score: node.review.score,
      reviewText: richTextFromReviewText(node.review.text),
    };
  }

  if (node.cellar === null || node.cellarItemId === null) return null;
  return {
    ...base,
    ...item,
    kind: "added",
    id: `added-${node.cellarItemId}`,
    cellarName: node.cellar.name,
  };
};

/**
 * The old `buildActivityFeed`: entries newest first, capped at eight. The
 * server already merged and ordered them; the sort is kept so the order never
 * depends on that.
 */
export const activityFeedFromNodes = (
  nodes: readonly ActivityNode[],
): ActivityEntry[] =>
  nodes
    .map(activityEntryFromNode)
    .filter((entry): entry is ActivityEntry => entry !== null)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, RECENT_ACTIVITY_CAP);

/* -------------------------------------------------------------------------- */
/* Discovery — Nearby Places (UI parity G31)                                   */
/* -------------------------------------------------------------------------- */

/**
 * The old `PlaceResult` fields the strip read plus its `PlaceSummary`
 * (`82450ad1:src/app/(authenticated)/map/place-actions.ts`), flattened.
 */
export type NearbyPlace = {
  id: string;
  name: string;
  primaryCategory: string;
  /** `[lng, lat]`, as the old `location.coordinates`. */
  coordinates: [number, number];
  distanceMeters: number;
  photoUrl: string | null;
  /** The summary's Google rating, else the place's own (the old `??`). */
  rating: number | null;
  /** The summary's Google price level, else the place's own. */
  priceLevel: number | null;
  openingHours: unknown;
};

type NearbyNode = NonNullable<
  ResultOf<typeof SearchNearbyPlacesQuery>["me"]
>["nearbyPlaces"]["edges"][number]["node"];

export const nearbyPlacesFromNodes = (
  nodes: readonly NearbyNode[],
): NearbyPlace[] =>
  nodes.map(({ distanceMeters, place }) => ({
    id: place.id,
    name: place.name,
    primaryCategory: place.primaryCategory ?? "",
    coordinates: [place.location.lng, place.location.lat],
    distanceMeters,
    photoUrl: place.photos.edges[0]?.node.file?.url ?? null,
    rating: place.enrichment?.googleRating ?? place.rating ?? null,
    priceLevel: place.enrichment?.googlePriceLevel ?? place.priceLevel ?? null,
    openingHours: place.enrichment?.googleOpeningHours ?? null,
  }));
