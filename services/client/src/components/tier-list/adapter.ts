/**
 * From the new API's shapes to the old tier-list props (`types.ts`), plus the
 * one rule the old board did not need: a reorder names a band's **full**
 * membership.
 *
 * Everything the old `[tierListId]/page.tsx` resolved inline — six id buckets,
 * a review-score map, a seven-branch `getItemHref`, the per-type subtitle —
 * lives here as plain functions so it can be tested without a server.
 */

import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import type { ActorErrorReason } from "@/lib/api/errors";
import { formatItemVintage } from "@/utilities";
import {
  formatBeerStyle,
  formatCountry,
  formatPlaceCategory,
  formatSakeCategory,
  formatSpiritType,
  formatTeaCategory,
  formatWineVariety,
} from "@/utilities/formatters";
import { displayItemName } from "@/utilities/smart-title-case";
import { BANDS, type TierListEntityType } from "./constants";
import type { InsightsStatus } from "./insights/insights-view";
import type {
  TierListAIInsights,
  TierListData,
  TierListInsightsData,
  TierListInsightsItem,
  TierListItemDisplay,
} from "./types";

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
  /** N07; optional so a fixture written before it still adapts. */
  insightsStatus?: InsightsStatus | null;
  insightsFailureReason?: ActorErrorReason | null;
  insightsRetryAt?: string | null;
};

const joinParts = (parts: ReadonlyArray<string | number | null | undefined>) =>
  parts
    .filter(
      (part): part is string | number =>
        part !== null && part !== undefined && part !== "",
    )
    .join(" · ");

/** The place fields a board row or a picker row describes a place with. */
export type EntryPlaceFields = {
  primaryCategory: string | null;
  locality: string | null;
  countryCode: string | null;
};

/** The item fields a board row or a picker row describes an item with. */
export type EntryItemFields = Pick<
  NonNullable<TierListItemNode["item"]>,
  | "type"
  | "country"
  | "wineVariety"
  | "wineVintage"
  | "beerStyle"
  | "spiritKind"
  | "sakeCategory"
  | "sakeRegion"
  | "teaCategory"
  | "teaRegion"
>;

/** `Wine Bar · Austin · US`. */
export function placeEntrySubtitle(place: EntryPlaceFields): string {
  return joinParts([
    formatPlaceCategory(place.primaryCategory),
    place.locality,
    place.countryCode,
  ]);
}

/**
 * The per-type line under an item's name, the old board's fields — formatted
 * through `utilities/formatters.ts` (N17), so `PINOT_NOIR` reads `Pinot Noir`
 * and `UNITED_STATES` reads `United States`, as on the item page. The board
 * and the Add entry picker both call this, so they cannot disagree.
 */
export function itemEntrySubtitle(item: EntryItemFields): string {
  switch (item.type) {
    case "WINE":
      return joinParts([
        formatWineVariety(item.wineVariety),
        formatItemVintage("WINE", item.wineVintage) ?? null,
        formatCountry(item.country),
      ]);
    case "BEER":
      return formatBeerStyle(item.beerStyle) ?? "";
    case "SPIRIT":
      return formatSpiritType(item.spiritKind) ?? "";
    case "COFFEE":
      return formatCountry(item.country) ?? "";
    case "SAKE":
      return joinParts([
        formatSakeCategory(item.sakeCategory),
        item.sakeRegion,
      ]);
    case "TEA":
      return joinParts([formatTeaCategory(item.teaCategory), item.teaRegion]);
    default:
      return "";
  }
}

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
    subtitle = placeEntrySubtitle(place);
    reviewScore = place.myInteraction?.rating ?? null;
    publicRating = place.enrichment?.googleRating ?? null;
    publicRatingCount = place.enrichment?.googleUserRatingsTotal ?? null;
  } else if (item !== null) {
    name = displayItemName(item.name);
    reviewScore = item.myReview?.score ?? null;
    subtitle = itemEntrySubtitle(item);
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
          name: displayItemName(node.item?.name) ?? "Unknown",
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
      status: core.insightsStatus ?? null,
      failureReason: core.insightsFailureReason ?? null,
      retryAt: core.insightsRetryAt ?? null,
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

/**
 * The board href a picker candidate would get once added — `entryHref`'s
 * rule, from the candidate's side — so the picker can tell what is already
 * on the list without a second query.
 */
export const candidateHref = (candidate: {
  id: string;
  entityType: TierListEntityType;
}): string =>
  candidate.entityType === "place"
    ? `/places/${candidate.id}`
    : `/${candidate.entityType}s/${candidate.id}`;

/** The hrefs of everything on the board, for {@link candidateHref}. */
export const onListHrefs = (
  items: readonly Pick<TierListItemDisplay, "href">[],
): ReadonlySet<string> => new Set(items.map((item) => item.href));

/**
 * What the in-page add says when `addTierListItem` refuses. Never the actor's
 * `message`: that is written for a log ("WINE <uuid> is already in tier list
 * <uuid>"), not for a person. The one `CONFLICT` `addItem` can raise for a
 * caller is the entry already being on the list (the others are invariant
 * breaches its own comments call unreachable).
 */
export function addEntryFailureMessage(failure: {
  code: string;
  message: string;
}): string {
  switch (failure.code) {
    case "CONFLICT":
      return "That's already on this list.";
    case "FORBIDDEN":
      return "Only the list's owner can add to it.";
    case "NOT_FOUND":
      return "That list or entry isn't available any more.";
    case "TRANSPORT":
      // `lib/api/result.ts`'s own words for no answer, already for a person.
      return failure.message;
    default:
      return "Couldn't add that. Try again.";
  }
}

/**
 * A list's item type, for what only an item list offers (X08's "Try This
 * Next" catalog lookup); `null` for a place list or an unknown type.
 */
export const itemTypeOfList = (listType: string): ApiItemType | null => {
  const upper = listType.toUpperCase();
  return (ITEM_TYPES as readonly string[]).includes(upper)
    ? (upper as ApiItemType)
    : null;
};
