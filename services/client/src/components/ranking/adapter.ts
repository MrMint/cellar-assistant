/**
 * `/rankings` ("Top rated" on the Me hub, D1) adapters: the scope control's
 * value → the server's scope, a `RankingEntry` → a `{ item, type }` grid row,
 * and the rank numerals.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { RankingEntryFragment } from "./fragments";

/** The server's scopes. The UI offers three of them (`RANKING_SEGMENTS`). */
export type RankingScope = "EVERYONE" | "ME" | "FRIENDS" | "ME_AND_FRIENDS";

/** The `?scope=` values, one per segment. */
export type RankingSegment = "me" | "friends" | "everyone";

/**
 * Whose scores rank the board (N15): a labelled **Me · Friends · Everyone**
 * control, Me by default — the old two icon toggles left "neither pressed"
 * meaning everyone, so a new account's first sight of Top rated was a grid of
 * strangers' items under a "Your Scores" label it had not pressed
 * (observation 3). `ME_AND_FRIENDS` is still a server scope; the control does
 * not offer it.
 */
export const RANKING_SEGMENTS: readonly {
  value: RankingSegment;
  label: string;
  scope: RankingScope;
}[] = [
  { value: "me", label: "Me", scope: "ME" },
  { value: "friends", label: "Friends", scope: "FRIENDS" },
  { value: "everyone", label: "Everyone", scope: "EVERYONE" },
];

export const DEFAULT_RANKING_SEGMENT: RankingSegment = "me";

/** `?scope=`, untrusted: anything but a segment's value is the default. */
export const segmentFromParam = (
  raw: string | null | undefined,
): RankingSegment =>
  RANKING_SEGMENTS.find((segment) => segment.value === raw)?.value ??
  DEFAULT_RANKING_SEGMENT;

export const scopeOfSegment = (segment: RankingSegment): RankingScope =>
  RANKING_SEGMENTS.find((candidate) => candidate.value === segment)?.scope ??
  "ME";

export type RankingGridRow = { item: ItemCardItem; type: ApiItemType };

/**
 * One entry → one card. The card's score and review count are the entry's —
 * the scope's average and count — as the old client set them from
 * `item_scores.score`/`count`, not the item's global aggregate.
 */
export const rankingRowFromEntry = (
  node: FragmentOf<typeof RankingEntryFragment>,
): RankingGridRow => {
  const entry = readFragment(RankingEntryFragment, node);
  return {
    type: entry.itemType,
    item: {
      ...itemCardFromFragment(entry.item),
      score: entry.score,
      reviewCount: entry.reviewCount,
    } satisfies ItemCardItem,
  };
};

/**
 * The board's empty state, by scope — one line, one action (design §3.6).
 * `null` while there is nothing to say yet (the first page is loading).
 */
export const rankingsEmptyState = (
  segment: RankingSegment,
  hasFriends: boolean,
  filtered: boolean,
): {
  title: string;
  description: string;
  action: { label: string; href: string } | null;
} => {
  if (filtered) {
    return {
      title: "Nothing here for those types.",
      description: "Clear a filter to see the rest of the board.",
      action: null,
    };
  }
  if (segment === "me") {
    return {
      title: "Nothing rated yet.",
      description: "Rate what you drink and your favourites rise to the top.",
      action: { label: "Find something to rate", href: "/search" },
    };
  }
  if (segment === "friends") {
    return hasFriends
      ? {
          title: "Your friends haven't rated anything yet.",
          description: "Their scores show up here as they rate.",
          action: null,
        }
      : {
          title: "Taste is better compared.",
          description: "Add friends and their scores rank here.",
          action: { label: "Find friends", href: "/friends" },
        };
  }
  return {
    title: "No rankings yet.",
    description: "Nobody has rated anything that matches.",
    action: null,
  };
};

/** The grid's cache key, so scroll restore stays per filter. */
export const rankingsCacheKey = (
  types: readonly string[] | null | undefined,
  segment: RankingSegment,
): string => `rankings-${types?.join(",") || "all"}-${segment}`;

/** Rank numerals: the board's own order, 1-based (a global rank, not per page). */
export const withRanks = <T>(rows: readonly T[]): (T & { rank: number })[] =>
  rows.map((row, index) => ({ ...row, rank: index + 1 }));
