/**
 * A friend row's second line (F-51, the Friends board): the newest thing you
 * may see them do, "Ranked Demo Pinot #1 · 2h ago". Null with none, and the
 * row falls back to "Friends since".
 */
import { formatDistance } from "@/lib/items/distance";

export type FriendActivity = {
  readonly kind: "ADDED" | "CHECKED_IN" | "REVIEWED" | "TIER_LISTED";
  readonly occurredAt: string;
  readonly rank: number | null;
  readonly item: { readonly name: string } | null;
  readonly place: {
    readonly name: string;
    readonly displayName?: string | null;
  } | null;
};

const VERB = {
  ADDED: "Added",
  CHECKED_IN: "Logged",
  REVIEWED: "Reviewed",
  TIER_LISTED: "Ranked",
} as const;

export const friendActivityLine = (
  activity: FriendActivity | null,
  now: number | null,
): string | null => {
  if (activity === null) return null;
  const subject =
    activity.item?.name ??
    (activity.place === null
      ? null
      : (activity.place.displayName ?? activity.place.name));
  const what = [
    VERB[activity.kind],
    subject,
    activity.kind === "TIER_LISTED" && activity.rank !== null
      ? `#${activity.rank}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  const ago = now === null ? "" : formatDistance(activity.occurredAt, now);
  return ago === "" ? what : `${what} · ${ago} ago`;
};
