/**
 * Routing and labelling for the six concrete item types (D3).
 *
 * Built on D2's `cellar-api/itemTypes.ts` rather than beside it: that module
 * already owns the `ItemType` ↔ URL-segment mapping and the cellar-scoped href,
 * and two copies of the same table is how the two lanes drift. This adds the
 * *item-scoped* hrefs (`/wines/[itemId]`, `/add/wines`) and the reverse lookup
 * a route segment needs to turn `"wines"` back into `WINE`.
 */

import {
  type ApiItemType,
  cellarItemHref,
  ITEM_TYPES,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";

export type { ApiItemType };
export { cellarItemHref, ITEM_TYPES, itemTypeLabel };

/** The route segment each type lives under. Plural, lowercase. */
export const ITEM_TYPE_SEGMENTS: Record<ApiItemType, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

const BY_SEGMENT: Record<string, ApiItemType> = Object.fromEntries(
  (Object.entries(ITEM_TYPE_SEGMENTS) as [ApiItemType, string][]).map(
    ([type, segment]) => [segment, type],
  ),
);

export const isApiItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** `"wines"` → `WINE`; anything else → `null`, which the page turns into a 404. */
export const itemTypeFromSegment = (segment: string): ApiItemType | null =>
  BY_SEGMENT[segment] ?? null;

/** `/wines/<itemId>` — the item's own page, independent of any cellar. */
export const itemHref = (type: string, itemId: string): string =>
  isApiItemType(type) ? `/${ITEM_TYPE_SEGMENTS[type]}/${itemId}` : "/search";

/** `/add/wines` — the onboarding wizard for one type. */
export const addItemHref = (type: ApiItemType, cellarId?: string): string => {
  const segment = ITEM_TYPE_SEGMENTS[type];
  return cellarId === undefined
    ? `/add/${segment}`
    : `/cellars/${cellarId}/${segment}/add`;
};

/** The plural noun the UI says out loud. */
export const ITEM_TYPE_PLURAL: Record<ApiItemType, string> = {
  WINE: "Wines",
  BEER: "Beers",
  SPIRIT: "Spirits",
  COFFEE: "Coffees",
  SAKE: "Sakes",
  TEA: "Teas",
};
