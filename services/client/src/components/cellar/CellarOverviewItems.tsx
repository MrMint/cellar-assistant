"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Pour } from "@/components/app/icons";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import {
  type PourBottle,
  PourSheet,
  type PourSubject,
} from "@/components/pour/PourSheet";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { type CellarGridItem, cellarBottleHref } from "./adapter";
import { BottleCard } from "./BottleCard";
import { cellarItemsGridClass } from "./CellarItemsGridSkeleton";

type PourTarget = { bottle: PourBottle; subject: PourSubject };

/**
 * The overview's "Open and recent" preview: `BottleCard`s (N13b) in the
 * items grid's columns, each with its one bottle action:
 *
 * - **Pour** (X03) for the cellar's owners while the bottle is not finished —
 *   open, log and level in one sheet, the first pour opening a sealed bottle;
 * - **Check in** (X02's log sheet) for a visitor, or a finished bottle.
 *
 * One Pour sheet serves the whole grid, held here rather than in a card: a
 * pour re-renders the server page, and the last pour can move the bottle out
 * of this preview (finished sorts last) — the sheet, its rating step and its
 * Undo toasts must not go with the card.
 */
export function CellarOverviewItems({
  cellarId,
  items,
  asOf,
  canPour = false,
}: {
  cellarId: string;
  items: CellarGridItem[];
  /** The server's request time: the first render's "now" (`useNow`). */
  asOf: number | null;
  /** The viewer owns (or co-owns) the cellar, so may change its bottles. */
  canPour?: boolean;
}) {
  const router = useRouter();
  const now = useNow(asOf);
  const onCheckedIn = useCallback(() => router.refresh(), [router]);
  const [target, setTarget] = useState<PourTarget | null>(null);
  const [pouring, setPouring] = useState(false);

  if (items.length === 0) {
    return (
      <p className="type-body py-8 text-center">No items in this cellar</p>
    );
  }

  return (
    <>
      <div className={cellarItemsGridClass()}>
        {items.map((x) => (
          <div key={x.item.id} className="min-w-0">
            <div className="flex flex-col gap-2">
              <BottleCard
                cell={x}
                now={now}
                href={cellarBottleHref(cellarId, x)}
              />
              {canPour && x.bottle.emptyAt === null ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  aria-haspopup="dialog"
                  aria-label={`Pour ${x.item.name}`}
                  onClick={() => {
                    setTarget({
                      bottle: {
                        cellarId,
                        cellarItemId: x.item.id,
                        openAt: x.bottle.openAt,
                        percentageRemaining:
                          x.bottle.percentageRemaining ?? 100,
                      },
                      subject: {
                        itemType: x.type,
                        itemId: x.item.itemId,
                        itemName: x.item.name,
                      },
                    });
                    setPouring(true);
                  }}
                >
                  <Pour aria-hidden />
                  Pour
                </Button>
              ) : (
                <CheckInButton
                  cellarId={cellarId}
                  cellarItemId={x.item.id}
                  itemType={x.type}
                  itemId={x.item.itemId}
                  itemName={x.item.name}
                  onCheckedIn={onCheckedIn}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {target !== null && (
        <PourSheet
          // One bottle's finish state and toasts are that bottle's.
          key={target.bottle.cellarItemId}
          open={pouring}
          onOpenChange={setPouring}
          bottle={target.bottle}
          subject={target.subject}
          onChanged={onCheckedIn}
        />
      )}
    </>
  );
}
