/**
 * From the new API's shapes to the old tier-list props (`types.ts`), plus the
 * one rule the old board did not need: a reorder names a band's **full**
 * membership.
 *
 * Everything the old `[tierListId]/page.tsx` resolved inline — six id buckets,
 * a review-score map, a seven-branch `getItemHref`, the per-type subtitle —
 * lives here as plain functions so it can be tested without a server.
 */

import { formatVintage } from "@/utilities";
import { BANDS, type TierListEntityType } from "./constants";
import type {
  TierListAIInsights,
  TierListData,
  TierListInsightsData,
  TierListInsightsItem,
  TierListItemDisplay,
} from "./types";
import { formatCategoryName } from "./utils";

/** The unmasked `TierListItem` fragment, as the page reads it. */
export type TierListItemNode = {
  id: string;
  band: number;
  position: number;
  entryType: string;
  place: {
    id: string;
    name: string;
    displayName: string | null;
    primaryCategory: string | null;
    locality: string | null;
    region: string | null;
    countryCode: string | null;
    myInteraction: { rating: number | null } | null;
    enrichment: {
      googleRating: number | null;
      googleUserRatingsTotal: number | null;
    } | null;
  } | null;
  item: {
    __typename?: string;
    id: string;
    type: string;
    name: string;
    country: string | null;
    myReview: { score: number } | null;
    wineVariety?: string | null;
    wineVintage?: string | null;
    wineRegion?: string | null;
    beerStyle?: string | null;
    spiritKind?: string | null;
    sakeCategory?: string | null;
    sakeRegion?: string | null;
    teaCategory?: string | null;
    teaRegion?: string | null;
  } | null;
};

export type TierListCoreNode = {
  id: string;
  name: string;
  description: string | null;
  createdById: string;
  privacy: string;
  listType: string;
  isEditingLocked: boolean;
  aiInsights: unknown;
  contentUpdatedAt: string | null;
};

const joinParts = (parts: ReadonlyArray<string | number | null | undefined>) =>
  parts
    .filter(
      (part): part is string | number =>
        part !== null && part !== undefined && part !== "",
    )
    .join(" · ");

/** `/wines/<id>`, `/places/<id>`, … — the old `getItemHref`. */
export function entryHref(node: TierListItemNode): string {
  if (node.place !== null) return `/places/${node.place.id}`;
  if (node.item !== null)
    return `/${node.item.type.toLowerCase()}s/${node.item.id}`;
  return "#";
}

/**
 * One board row, exactly as the old page resolved it: the viewer's own score
 * (item review, or place rating) and, for places, Google's rating and count.
 * The old page showed a vintage as the stored date; it is the year here.
 */
export function itemDisplayFromNode(
  node: TierListItemNode,
): TierListItemDisplay {
  let name = "Unknown item";
  let subtitle = "";
  let reviewScore: number | null = null;
  let publicRating: number | null = null;
  let publicRatingCount: number | null = null;

  const { place, item } = node;
  if (place !== null) {
    name = place.displayName ?? place.name;
    subtitle = joinParts([
      place.primaryCategory ? formatCategoryName(place.primaryCategory) : null,
      place.locality,
      place.countryCode,
    ]);
    reviewScore = place.myInteraction?.rating ?? null;
    publicRating = place.enrichment?.googleRating ?? null;
    publicRatingCount = place.enrichment?.googleUserRatingsTotal ?? null;
  } else if (item !== null) {
    name = item.name;
    reviewScore = item.myReview?.score ?? null;
    switch (item.type) {
      case "WINE":
        subtitle = joinParts([
          item.wineVariety,
          item.wineVintage ? formatVintage(item.wineVintage) : null,
          item.country,
        ]);
        break;
      case "BEER":
        subtitle = item.beerStyle ?? "";
        break;
      case "SPIRIT":
        subtitle = item.spiritKind ?? "";
        break;
      case "COFFEE":
        subtitle = item.country ?? "";
        break;
      case "SAKE":
        subtitle = joinParts([item.sakeCategory, item.sakeRegion]);
        break;
      case "TEA":
        subtitle = joinParts([item.teaCategory, item.teaRegion]);
        break;
    }
  }

  return {
    id: node.id,
    band: node.band,
    position: node.position,
    name,
    subtitle,
    href: entryHref(node),
    reviewScore,
    publicRating,
    publicRatingCount,
  };
}

/**
 * The insights panel's rows. The old page built them from **places only**, so
 * a wine list read "Add items to your tier list to see insights" even with AI
 * insights generated for it — a data bug, not the design. Items count here
 * for the band chart and the AI text; their `country` is free text, not an
 * ISO code, so they carry no country/region/category and the place-only
 * cards (passport, heatmap, category donut) stay hidden for item lists.
 */
export function insightsItemsFromNodes(
  nodes: readonly TierListItemNode[],
): TierListInsightsItem[] {
  return nodes.map((node) =>
    node.place !== null
      ? {
          id: node.id,
          band: node.band,
          name: node.place.displayName ?? node.place.name,
          countryCode: node.place.countryCode,
          region: node.place.region,
          primaryCategory: node.place.primaryCategory,
        }
      : {
          id: node.id,
          band: node.band,
          name: node.item?.name ?? "Unknown",
          countryCode: null,
          region: null,
          primaryCategory: null,
        },
  );
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * `aiInsights` is JSON, null until generated. The old gate required
 * `palateProfile` **and** `blindSpots`; `blindSpots` is optional in the
 * current prompt (`services/actors/src/lib/ai/prompts.ts`), so the gate is
 * `palateProfile` alone and the Blind Spots card hides when it is absent.
 */
export function aiInsightsFromJson(raw: unknown): TierListAIInsights | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const palateProfile = asString(record.palateProfile);
  if (palateProfile === undefined) return null;
  return {
    palateProfile,
    blindSpots: asString(record.blindSpots),
    hotTake: asString(record.hotTake),
    archetype: asString(record.archetype),
    archetypeDescription: asString(record.archetypeDescription),
    recommendation: asString(record.recommendation),
    generatedAt: asString(record.generatedAt) ?? "",
  };
}

export function tierListDataFrom(
  core: TierListCoreNode,
  nodes: readonly TierListItemNode[],
  viewerId: string | null,
): { data: TierListData; insightsData: TierListInsightsData } {
  const items = nodes.map(itemDisplayFromNode);
  return {
    data: {
      id: core.id,
      name: core.name,
      description: core.description ?? null,
      privacy: core.privacy,
      listType: core.listType,
      isOwner: viewerId !== null && core.createdById === viewerId,
      isEditingLocked: core.isEditingLocked,
      itemCount: items.length,
      items,
    },
    insightsData: {
      items: insightsItemsFromNodes(nodes),
      aiInsights: aiInsightsFromJson(core.aiInsights),
      contentUpdatedAt: core.contentUpdatedAt ?? null,
      showPlaceStats: core.listType === "place",
    },
  };
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export type BandMap = Record<number, string[]>;

/**
 * The single `reorderTierListBand` call a finished drag needs, or null when
 * nothing moved.
 *
 * The old board sent a per-row diff of `(id, band, position)` for both bands
 * (`reorderBandAction`, non-atomic `allSettled`). The API takes one band's
 * **complete** order and refuses an omission; a cross-band arrival is named in
 * the destination band, and the server renumbers the band it left in the same
 * transaction — so the destination band alone is sent. (Sending the source
 * band too would be redundant, and an emptied band cannot be sent at all.)
 */
export function reorderCallFor(
  before: BandMap,
  after: BandMap,
  sourceBand: number,
  destBand: number,
): { band: number; orderedIds: string[] } | null {
  const bandsToCheck =
    sourceBand === destBand ? [destBand] : [sourceBand, destBand];
  const changed = bandsToCheck.some((band) => {
    const a = before[band] ?? [];
    const b = after[band] ?? [];
    return a.length !== b.length || a.some((id, i) => b[i] !== id);
  });
  if (!changed) return null;
  const orderedIds = after[destBand] ?? [];
  if (orderedIds.length === 0) return null;
  return { band: destBand, orderedIds: [...orderedIds] };
}

export function bandMapOf(
  items: readonly { id: string; band: number }[],
): BandMap {
  const bands: BandMap = {};
  for (const band of BANDS) bands[band] = [];
  for (const item of items) bands[item.band]?.push(item.id);
  return bands;
}

// ---------------------------------------------------------------------------
// "Add to Tier List" modal
// ---------------------------------------------------------------------------

export type TierListOption = {
  id: string;
  name: string;
  /** The entity's band on this list, or null when it is not on it. */
  alreadyInBand: number | null;
};

/**
 * The old `GetTierListsForItem`: the viewer's **own** lists of the entity's
 * type, each marked with the entity's band if it is already there. The API
 * returns every visible list (`myTierLists` takes no filter), so ownership and
 * type are narrowed here; membership comes from the entity's
 * `tierListEntries`, which only ever names lists the viewer may see.
 */
export function tierListOptionsFor(
  lists: readonly {
    id: string;
    name: string;
    listType: string;
    createdById: string;
  }[],
  entries: readonly { band: number; tierListId: string }[],
  viewerId: string | null,
  entityType: TierListEntityType,
): TierListOption[] {
  if (viewerId === null) return [];
  const bandByList = new Map<string, number>();
  for (const entry of entries) {
    if (!bandByList.has(entry.tierListId)) {
      bandByList.set(entry.tierListId, entry.band);
    }
  }
  return lists
    .filter(
      (list) => list.listType === entityType && list.createdById === viewerId,
    )
    .map((list) => ({
      id: list.id,
      name: list.name,
      alreadyInBand: bandByList.get(list.id) ?? null,
    }));
}

/** `place` → `PLACE`, `wine` → `WINE` — the API's `TierListEntryType`. */
export const entryTypeOf = (
  entityType: TierListEntityType,
): "BEER" | "COFFEE" | "PLACE" | "SAKE" | "SPIRIT" | "TEA" | "WINE" =>
  entityType.toUpperCase() as
    | "BEER"
    | "COFFEE"
    | "PLACE"
    | "SAKE"
    | "SPIRIT"
    | "TEA"
    | "WINE";
