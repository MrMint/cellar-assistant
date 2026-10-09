"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import { useNow } from "@/hooks/useNow";
import { type CellarGridItem, cellarBottleHref } from "./adapter";
import { BottleCard } from "./BottleCard";
import { cellarItemsGridClass } from "./CellarItemsGridSkeleton";

/**
 * The overview's "Open and recent" preview: `BottleCard`s (N13b) in the
 * items grid's columns, each with the one bottle action this page keeps —
 * "Check in", which opens the drink-log sheet (X02) with that bottle.
 * Open / pour / empty / remove go with decision 2's "per-card bottle
 * controls"; they return on the bottle page.
 *
 * A check-in re-renders the server page, so the history below updates.
 */
export function CellarOverviewItems({
  cellarId,
  items,
  asOf,
}: {
  cellarId: string;
  items: CellarGridItem[];
  /** The server's request time: the first render's "now" (`useNow`). */
  asOf: number | null;
}) {
  const router = useRouter();
  const now = useNow(asOf);
  const onCheckedIn = useCallback(() => router.refresh(), [router]);

  if (items.length === 0) {
    return (
      <p className="type-body py-8 text-center">No items in this cellar</p>
    );
  }

  return (
    <div className={cellarItemsGridClass()}>
      {items.map((x) => (
        <div key={x.item.id} className="min-w-0">
          <div className="flex flex-col gap-2">
            <BottleCard
              cell={x}
              now={now}
              href={cellarBottleHref(cellarId, x)}
            />
            <CheckInButton
              cellarId={cellarId}
              cellarItemId={x.item.id}
              itemType={x.type}
              itemId={x.item.itemId}
              itemName={x.item.name}
              onCheckedIn={onCheckedIn}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
