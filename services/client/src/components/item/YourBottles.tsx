"use client";

import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { LEVEL_FILL } from "@/components/cellar/BottleCard";
import { bottleState } from "@/components/cellar/bottle-state";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  containerCountLabel,
  typeWords,
  yourContainersLabel,
} from "@/components/drink-log/type-words";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bottleHref } from "./adapter";
import { BottleFreshnessFields } from "./BottleFreshnessFields";
import { HeldBackNote } from "./HeldBackNote";
import { useItemActions } from "./ItemActions";
import { ItemRemainingSlider } from "./ItemRemainingSlider";
import { bottleStateLine, type YourBottle } from "./item-page-model";

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
 * - **Pour** is X03's Pour sheet: open + log + level in one action, with
 *   glass presets; the first pour opens a sealed bottle, and the last asks
 *   "Finished?" (N13a's Undo), then the rating and your tier-list bands.
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

  // Nothing to list. (A bottle that leaves the list while it is being
  // poured keeps its sheet: that lives in `ItemActionsProvider`.)
  if (bottles.length === 0) return null;

  // W-20: a tin of tea is steeped, a bag of coffee brewed.
  const words = typeWords(itemType);
  const logFrom = (bottle: YourBottle) =>
    actions?.logDrink({ cellarId: bottle.cellarId, cellarItemId: bottle.id });

  return (
    <InsetSection
      id="your-bottles"
      label={yourContainersLabel(itemType)}
      action={
        <span className="type-footnote tabular">
          {containerCountLabel(itemType, total ?? bottles.length)}
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
                    aria-haspopup="dialog"
                    onClick={() =>
                      actions?.pour({
                        cellarId: bottle.cellarId,
                        cellarItemId: bottle.id,
                        openAt: bottle.openAt,
                        percentageRemaining: bottle.percentageRemaining,
                      })
                    }
                    aria-label={`${words.pour} from ${cellar}`}
                    className="relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
                  >
                    {words.pour}
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
              // The bottle the URL names: its level, Mark as opened,
              // Finished, Restore — inline, as the old bottle page had them.
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
                <BottleFreshnessFields
                  cellarId={bottle.cellarId}
                  cellarItemId={bottle.id}
                />
              </div>
            )}
          </div>
        );
      })}
      <HeldBackNote
        shown={bottles.length}
        total={total}
        noun={words.containers}
        order="first"
      />
    </InsetSection>
  );
}
