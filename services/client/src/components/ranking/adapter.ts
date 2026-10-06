/**
 * `/rankings` adapters: the restored filter's value → the server's scope, and
 * a `RankingEntry` → the old `RankingsClient`'s `{ item, type }` grid row.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemCardFromFragment } from "@/components/item/ItemCard/adapter";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { RankingEntryFragment } from "./fragments";

/** The four states of the two-button filter, one-for-one. */
export type RankingScope = "EVERYONE" | "ME" | "FRIENDS" | "ME_AND_FRIENDS";

/** `RankingsFilterValue`'s members, as strings. */
export type RankingReviewer = "ME" | "FRIENDS";

/**
 * The old reviewer toggles → `RankingScope`. Neither pressed is everyone,
 * exactly as an empty reviewer set was in the old native query; the one
 * difference is `FRIENDS` with no friends, which is now empty rather than
 * everyone.
 */
export const scopeFromReviewers = (
  reviewers: readonly string[] | null | undefined,
): RankingScope => {
  const me = reviewers?.includes("ME") ?? false;
  const friends = reviewers?.includes("FRIENDS") ?? false;
  if (me && friends) return "ME_AND_FRIENDS";
  if (me) return "ME";
  if (friends) return "FRIENDS";
  return "EVERYONE";
};

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
 * The grid's empty message. One string, as the old `VirtualGrid` took, but
 * it names which empty this is when a friends scope is on: `FRIENDS` no longer
 * falls back to everyone's scores, so "no friends yet" and "friends have not
 * reviewed this" must not read the same.
 */
export const rankingsEmptyMessage = (
  scope: RankingScope,
  hasFriends: boolean,
): string => {
  const friendsScope = scope === "FRIENDS" || scope === "ME_AND_FRIENDS";
  if (!friendsScope) return "No rankings found";
  if (!hasFriends) {
    return scope === "FRIENDS"
      ? "No rankings found — you have no friends yet, so there are no friends' scores to rank"
      : "No rankings found — you have no friends yet, and you have not reviewed anything that matches";
  }
  return "No rankings found — your friends have not reviewed anything that matches yet";
};

/** The old grid's cache key, so scroll restore stays per filter. */
export const rankingsCacheKey = (
  types: readonly string[] | null | undefined,
  reviewers: readonly string[] | null | undefined,
): string =>
  `rankings-${types?.join(",") || "all"}-${reviewers?.join(",") || "all"}`;
