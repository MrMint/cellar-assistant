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
 * The board's empty state (Social-Recap boards 26 and rankings-empty): kit
 * wording, a title and one action. A kind with nothing in it comes first, and
 * its action shows every kind again.
 */
export const rankingsEmptyState = (
  segment: RankingSegment,
  hasFriends: boolean,
  kind: string | null,
): {
  title: string;
  action: { label: string; href: string } | "all-kinds" | null;
} => {
  if (kind !== null) {
    return {
      title: `No ${kind.toLowerCase()} ${segment === "friends" ? "rated by friends yet" : "rated yet"}`,
      action: "all-kinds",
    };
  }
  if (segment === "me") {
    return {
      title: "Nothing rated yet",
      action: { label: "Find drinks", href: "/search" },
    };
  }
  if (segment === "friends") {
    return hasFriends
      ? { title: "Nothing rated by friends yet", action: null }
      : {
          title: "No friends yet",
          action: { label: "Add friend", href: "/friends" },
        };
  }
  return { title: "Nothing rated yet", action: null };
};

/** The grid's cache key, so scroll restore stays per filter. */
export const rankingsCacheKey = (
  types: readonly string[] | null | undefined,
  segment: RankingSegment,
): string => `rankings-${types?.join(",") || "all"}-${segment}`;

/** Rank numerals: the board's own order, 1-based (a global rank, not per page). */
export const withRanks = <T>(rows: readonly T[]): (T & { rank: number })[] =>
  rows.map((row, index) => ({ ...row, rank: index + 1 }));

/** The kinds in the owner's order (KIT amendments): Beer, Wine, Spirit, Coffee, Tea, Sake. */
export const RANKING_KINDS: readonly ApiItemType[] = [
  "BEER",
  "WINE",
  "SPIRIT",
  "COFFEE",
  "TEA",
  "SAKE",
];

/** A count the board's cap may have cut: never a limit shown as a total. */
export const rankingCount = (n: number, cap: number): string =>
  n >= cap ? `${cap}+` : String(n);

/**
 * The line over the rows: "190 rated", "12 rated by friends", "Top 200 by
 * everyone" (SR-1). `null` while the count is unknown.
 */
export const rankingCountLine = (
  segment: RankingSegment,
  total: number | null,
  filtered: boolean,
  cap: number,
): string | null => {
  if (segment === "everyone") {
    return filtered || total === null
      ? "Highest rated by everyone"
      : `Top ${Math.min(total, cap)} by everyone`;
  }
  if (total === null) return null;
  const n = rankingCount(total, cap);
  return segment === "me" ? `${n} rated` : `${n} rated by friends`;
};

/**
 * The crown sits beside the owner's own #1 only (CROSS-LOT ruling 1): their
 * own board, unfiltered, first row. Every other rank is a plain numeral: no
 * band exists on a board ranked by stars.
 */
export const wearsCrown = (
  segment: RankingSegment,
  filtered: boolean,
  rank: number,
): boolean => segment === "me" && !filtered && rank === 1;
