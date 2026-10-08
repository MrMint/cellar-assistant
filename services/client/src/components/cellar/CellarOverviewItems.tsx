"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import { ItemCard } from "@/components/item/ItemCard";
import { type CellarGridItem, cellarBottleHref } from "./adapter";
import { cellarItemsGridClass } from "./CellarItemsGridSkeleton";

/**
 * The overview's "Open and recent" preview: restored `ItemCard`s in the old
 * items grid's breakpoints, each with the one bottle action this page keeps —
 * "Check in" — because the cellar's check-in history is what the page is for
 * and the bottle page that will own check-ins (wave 3) is not restored yet.
 * Open / pour / empty / remove go with decision 2's "per-card bottle
 * controls"; they return on the bottle page.
 *
 * A check-in re-renders the server page, so the history below updates.
 */
export function CellarOverviewItems({
  cellarId,
  items,
  viewerId,
}: {
  cellarId: string;
  items: CellarGridItem[];
  viewerId: string | null;
}) {
  const router = useRouter();
  const onCheckedIn = useCallback(() => router.refresh(), [router]);

  if (items.length === 0) {
    return (
      <p className="type-body py-8 text-center">No items in this cellar</p>
    );
  }

  return (
    <div className={cellarItemsGridClass(items.length)}>
      {items.map((x) => (
        <div key={x.item.id} className="min-w-0">
          <div className="flex flex-col gap-2">
            <ItemCard
              item={x.item}
              type={x.type}
              href={cellarBottleHref(cellarId, x)}
            />
            <CheckInButton
              cellarId={cellarId}
              cellarItemId={x.item.id}
              itemName={x.item.name}
              viewerId={viewerId}
              onCheckedIn={onCheckedIn}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
