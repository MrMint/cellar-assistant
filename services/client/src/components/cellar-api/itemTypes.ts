/**
 * `ItemType` ↔ the URL segment the per-type item pages live under.
 *
 * The new schema names the six concrete types in the singular and in caps
 * (`WINE`), the routes are plural and lowercase (`/wines`). The mapping is
 * written out rather than derived, because `SPIRIT` → `spirits` and
 * `COFFEE` → `coffees` agree with `toLowerCase() + "s"` by luck, not by rule.
 */

export const ITEM_TYPES = [
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
] as const;

export type ApiItemType = (typeof ITEM_TYPES)[number];

const SEGMENTS: Record<ApiItemType, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

const LABELS: Record<ApiItemType, string> = {
  WINE: "Wine",
  BEER: "Beer",
  SPIRIT: "Spirit",
  COFFEE: "Coffee",
  SAKE: "Sake",
  TEA: "Tea",
};

const isApiItemType = (value: string): value is ApiItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** `/cellars/<cellarId>/<segment>/<itemId>` — the item's page in this cellar. */
export const cellarItemHref = (
  cellarId: string,
  type: string,
  itemId: string,
): string =>
  isApiItemType(type)
    ? `/cellars/${cellarId}/${SEGMENTS[type]}/${itemId}`
    : `/cellars/${cellarId}/items`;

export const itemTypeLabel = (type: string): string =>
  isApiItemType(type) ? LABELS[type] : type;
