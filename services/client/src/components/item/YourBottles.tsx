"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/app/BottomSheet";
import { Cocktail } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { LEVEL_FILL } from "@/components/cellar/BottleCard";
import { bottleState } from "@/components/cellar/bottle-state";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bottleHref } from "./adapter";
import { HeldBackNote } from "./HeldBackNote";
import { type LogBottle, useItemActions } from "./ItemActions";
import { ItemRemainingSlider } from "./ItemRemainingSlider";
import {
  bottleStateLine,
  bottlesCountLabel,
  type YourBottle,
} from "./item-page-model";

export type YourBottlesProps = {
  itemType: ApiItemType;
  itemName: string;
  bottles: readonly YourBottle[];
  /** `myBottles.totalCount`, when the API held some back. */
  total?: number | null;
  /** The bottle the URL names (the bottle route), when it is yours. */
  selectedId?: string | null;
};

/** A bottle's level as a small upright gauge — the BottleCard's bar, stood up. */
function LevelGauge({
  type,
  bottle,
}: {
  type: ApiItemType;
  bottle: YourBottle;
}) {
  const state = bottleState(bottle, null);
  return (
    <span
      aria-hidden
      data-slot="bottle-gauge"
      className="relative flex h-9 w-3 overflow-hidden rounded-full bg-surface-3"
    >
      <span
        className={cn(
          "absolute inset-0 origin-bottom rounded-full transition-transform duration-(--ca-dur-medium) ease-standard motion-reduce:transition-none",
          state.kind === "open" ? LEVEL_FILL[type] : "bg-ink-3/40",
        )}
        style={{ transform: `scaleY(${state.level / 100})` }}
      />
    </span>
  );
}

/**
 * X09 — "Your bottles": every bottle of this item in your own cellars, open
 * first, each with **Pour** and **Log** under the thumb.
 *
 * - **Pour** opens a sheet with the bottle's level (the restored remaining
 *   slider: Open it, drag the level, 0% asks "Finished it?" with Undo), and
 *   "Log this drink" from there.
 * - **Log** opens the page's one "Log a drink" sheet with this bottle.
 * - The cellar name links to the bottle's own URL — the item page with that
 *   bottle selected (D-gating answer 1: a bottle id keeps meaning a bottle).
 *   The selected bottle is marked and carries its level control inline.
 *
 * Renders nothing when you have none: the ActionBar's "Add to cellar" is the
 * way to get one, and an empty section would only repeat it.
 */
export function YourBottles({
  itemType,
  itemName,
  bottles,
  total,
  selectedId = null,
}: YourBottlesProps) {
  const actions = useItemActions();
  const [pouring, setPouring] = useState<YourBottle | null>(null);
  // "Log this drink" from the Pour sheet waits for that sheet to finish
  // closing before the log sheet opens (two modals overlapping can leave
  // `pointer-events: none` on the body — BottomSheet's `onClosed`).
  const logAfterClose = useRef<LogBottle | null>(null);

  // The bottle being poured as the server last read it: a write refreshes the
  // page, and the sheet follows the new level rather than the tapped row's.
  const found =
    pouring === null
      ? undefined
      : bottles.find((bottle) => bottle.id === pouring.id);
  // Finishing it in the sheet ("Finished it?" → Finished) takes it out of
  // this list — it holds bottles still in the cellar — on the refresh that
  // follows. The sheet must not then fall back to the tapped row's snapshot
  // (open, at its old level: a slider that writes to a finished bottle), and
  // must stay mounted, or the finish's Undo toast goes with it. So a bottle
  // that leaves the list while it is being poured reads as finished from
  // that moment, with Restore, until Undo or Restore brings it back.
  const [leftAt, setLeftAt] = useState<string | null>(null);
  const gone = pouring !== null && found === undefined;
  useEffect(() => {
    setLeftAt((at) => (gone ? (at ?? new Date().toISOString()) : null));
  }, [gone]);
  const livePouring =
    pouring === null
      ? null
      : (found ??
        (leftAt === null ? pouring : { ...pouring, emptyAt: leftAt }));

  // Nothing to list, and no sheet still showing one that just left it.
  if (bottles.length === 0 && pouring === null) return null;

  const logFrom = (bottle: YourBottle) =>
    actions?.logDrink({ cellarId: bottle.cellarId, cellarItemId: bottle.id });

  return (
    <>
      {bottles.length > 0 && (
        <InsetSection
          id="your-bottles"
          label="Your bottles"
          action={
            <span className="type-footnote tabular">
              {bottlesCountLabel(total ?? bottles.length)}
            </span>
          }
        >
          {bottles.map((bottle) => {
            const selected = bottle.id === selectedId;
            const finished = bottle.emptyAt !== null;
            const cellar = bottle.cellarName ?? "Your cellar";
            return (
              <div
                key={bottle.id}
                data-slot="your-bottle"
                data-selected={selected || undefined}
                className={cn(selected && "bg-surface-2")}
              >
                <div className="relative flex min-h-14 items-center gap-3 px-4 py-2.5">
                  <LevelGauge type={itemType} bottle={bottle} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={bottleHref(bottle.cellarId, itemType, bottle.id)}
                      overlay
                      underline="none"
                      aria-current={selected ? "page" : undefined}
                      className="type-body truncate text-ink-1"
                    >
                      {cellar}
                    </Link>
                    <span className="type-footnote truncate">
                      {bottleStateLine(bottle)}
                    </span>
                  </div>
                  {!finished && (
                    <div className="relative z-10 flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPouring(bottle)}
                        aria-label={`Pour from ${cellar}`}
                        className="relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
                      >
                        Pour
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => logFrom(bottle)}
                        aria-label={`Log a drink from ${cellar}`}
                        className="relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
                      >
                        Log
                      </Button>
                    </div>
                  )}
                </div>
                {selected && (
                  // The bottle the URL names: its level, Open it, Finished,
                  // Restore — inline, as the old bottle page had them.
                  <div className="px-4 pb-4">
                    <ItemRemainingSlider
                      itemId={bottle.id}
                      cellarId={bottle.cellarId}
                      isCellarOwner
                      percentageRemaining={bottle.percentageRemaining}
                      opened={bottle.openAt}
                      emptied={bottle.emptyAt}
                      itemName={itemName}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <HeldBackNote
            shown={bottles.length}
            total={total}
            noun="bottles"
            order="first"
          />
        </InsetSection>
      )}

      <BottomSheet
        open={pouring !== null}
        onOpenChange={(open) => {
          if (!open) setPouring(null);
        }}
        onClosed={() => {
          const bottle = logAfterClose.current;
          logAfterClose.current = null;
          if (bottle !== null) actions?.logDrink(bottle);
        }}
        title="Pour"
        description={
          pouring === null
            ? undefined
            : `${itemName} · ${pouring.cellarName ?? "Your cellar"}`
        }
        footer={
          pouring === null ? undefined : (
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  logAfterClose.current = {
                    cellarId: pouring.cellarId,
                    cellarItemId: pouring.id,
                  };
                  setPouring(null);
                }}
              >
                <Cocktail aria-hidden />
                Log this drink
              </Button>
              <Button variant="ghost" onClick={() => setPouring(null)}>
                Done
              </Button>
            </div>
          )
        }
      >
        {pouring !== null && (
          <ItemRemainingSlider
            // Keyed by bottle: the slider's local level must not carry over
            // from the bottle poured last.
            key={pouring.id}
            itemId={pouring.id}
            cellarId={pouring.cellarId}
            isCellarOwner
            percentageRemaining={livePouring?.percentageRemaining ?? 100}
            opened={livePouring?.openAt ?? null}
            emptied={livePouring?.emptyAt ?? null}
            itemName={itemName}
          />
        )}
      </BottomSheet>
    </>
  );
}
