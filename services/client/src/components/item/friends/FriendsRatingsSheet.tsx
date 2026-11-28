"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useQuery } from "urql";
import { Link } from "@/components/app/Link";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { feedback } from "@/lib/feedback";
import {
  type FriendReview,
  friendRatingRows,
  ItemFriendsRatingsQuery,
} from "./friends-ratings";

/**
 * F-154, Cellars-Pour "Friends' ratings": the taste header's Friends cell as
 * a button, and the sheet it opens — one row per friend who rated it, their
 * stars (ink, not gold: gold is yours alone) and score, each to the friend.
 * Nothing is read until the sheet is first asked for.
 */
export function FriendsRatingsCell({
  itemId,
  itemType,
  label,
  className,
  children,
}: {
  itemId: string;
  itemType: ApiItemType;
  /** What a screen reader hears for the cell (`tasteCellLabel`). */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        data-cell="friends"
        className={className}
        onClick={() => {
          feedback("tick");
          setAsked(true);
          setOpen(true);
        }}
      >
        {children}
      </button>
      {asked && (
        <FriendsRatingsSheet
          open={open}
          onOpenChange={setOpen}
          itemId={itemId}
          itemType={itemType}
        />
      )}
    </>
  );
}

function FriendsRatingsSheet({
  open,
  onOpenChange,
  itemId,
  itemType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemType: ApiItemType;
}) {
  const [reviews] = useQuery({
    query: ItemFriendsRatingsQuery,
    variables: { itemId, type: itemType },
    pause: !open,
  });

  const rows = useMemo(() => {
    const item = reviews.data?.item;
    if (item?.__typename !== "QueryItemSuccess") return null;
    const list: FriendReview[] = item.data.friendsReviews.edges.map(
      (edge) => edge.node,
    );
    return friendRatingRows(list);
  }, [reviews.data]);

  const failed =
    reviews.error !== undefined ||
    (reviews.data !== undefined &&
      reviews.data.item.__typename !== "QueryItemSuccess");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Friends’ ratings"
    >
      {rows === null ? (
        <p className="t-body py-4 text-ink-2">
          {failed ? "Couldn’t load your friends’ ratings." : "Loading…"}
        </p>
      ) : rows.length === 0 ? (
        <p className="t-body py-4 text-ink-2">No friends have rated it yet.</p>
      ) : (
        <ul className="-mx-4 flex flex-col">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                onClick={() => feedback("tick")}
                className="flex min-h-14 items-center gap-3 px-4 outline-none transition-colors duration-(--ca-dur-short) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-raised"
              >
                <UserAvatar
                  avatarUrl={row.avatarUrl}
                  displayName={row.name}
                  aria-hidden
                />
                <span className="t-head min-w-0 flex-1 truncate text-ink">
                  {row.name}
                </span>
                <Stars value={row.score} tone="other" size="sm" />
                <span className="t-head tabular w-7 text-right text-ink">
                  {formatKitScore(row.score)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  );
}
