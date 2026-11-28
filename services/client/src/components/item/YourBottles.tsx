"use client";

import { type ReactNode, useState, useTransition } from "react";
import { useMutation } from "urql";
import { Add, Pour } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { LEVEL_FILL } from "@/components/cellar/BottleCard";
import { bottleState } from "@/components/cellar/bottle-state";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Timestamp } from "@/components/common/Timestamp";
import { DeleteDrinkLogMutation } from "@/components/drink-log/queries";
import {
  containerCountLabel,
  typeWords,
  yourContainersLabel,
} from "@/components/drink-log/type-words";
import { Button } from "@/components/ui/button";
import { CheckInMutation } from "@/lib/api/cellars";
import { cn } from "@/lib/utils";
import { AddToCellarSheet } from "./AddToCellarActions";
import { bottleHref } from "./adapter";
import { BottleFreshnessFields } from "./BottleFreshnessFields";
import { HeldBackNote } from "./HeldBackNote";
import { useItemActions } from "./ItemActions";
import { ItemRemainingSlider } from "./ItemRemainingSlider";
import { bottleStateLine, type YourBottle } from "./item-page-model";
import { checkInBottle } from "./parts/item-writes";
import { useRefreshAfterWrite } from "./parts/pane-refresh";

export type YourBottlesProps = {
  itemId: string;
  itemType: ApiItemType;
  itemName: string;
  bottles: readonly YourBottle[];
  /** `myBottles.totalCount`, when the API held some back. */
  total?: number | null;
  /** The bottle the URL names (the bottle route), when it is yours. */
  selectedId?: string | null;
  /** Your cellars "Add" files into; none hides Add. */
  addableCellars?: readonly { id: string; name: string }[];
};

/** A bottle's level as a small upright bottle — dashed once it is finished. */
function LevelGauge({
  type,
  bottle,
}: {
  type: ApiItemType;
  bottle: YourBottle;
}) {
  const state = bottleState(bottle, null);
  const finished = bottle.emptyAt !== null;
  return (
    <span
      aria-hidden
      data-slot="bottle-gauge"
      className={cn(
        "relative flex h-10 w-5 shrink-0 overflow-hidden rounded-md",
        finished ? "border border-dash border-dashed" : "bg-raised",
      )}
    >
      {!finished && (
        <span
          className={cn(
            "absolute inset-0 origin-bottom transition-transform duration-(--ca-dur-medium) ease-standard motion-reduce:transition-none",
            state.kind === "open" ? LEVEL_FILL[type] : "bg-ink-3",
          )}
          style={{ transform: `scaleY(${state.level / 100})` }}
        />
      )}
    </span>
  );
}

/** "Opened Apr 25, 2024": the row's date door, through `Timestamp` (the one
 * place allowed to format a date for a human — no hydration mismatch). */
const dateLine = (bottle: YourBottle): ReactNode => {
  const at = bottle.emptyAt ?? bottle.openAt;
  if (at === null) return null;
  return (
    <>
      {bottle.emptyAt !== null ? "Finished " : "Opened "}
      <Timestamp iso={at} precision="date" />
    </>
  );
};

/**
 * "3 in Home" when every bottle is in one cellar; "3 bottles" otherwise.
 * Only bottles still in the cellar count (F-152): a finished one the URL
 * names is listed, but it is no longer "in Home".
 */
const countLine = (
  type: ApiItemType,
  bottles: readonly YourBottle[],
  total: number | null | undefined,
): string | null => {
  const inCellar = bottles.filter((bottle) => bottle.emptyAt === null);
  const count = total ?? inCellar.length;
  if (count === 0 || inCellar.length === 0) return null;
  const names = inCellar.map((bottle) => bottle.cellarName);
  const only = names[0];
  return names.every((name) => name === only) &&
    only !== null &&
    only !== undefined
    ? `${count} in ${only}`
    : containerCountLabel(type, count);
};

/**
 * "Your bottles" (Cellars-Bottles 01–02): every bottle of this item in your
 * cellars, open first, as a card of rows with a drawn gauge. The next bottle
 * — the one the URL names, else the first still in the cellar — is open in
 * place with **Check in** (the page's one primary: a standard serve, then a
 * toast with Undo) and **Pour…** (X03's Pour sheet, for an exact amount). The
 * URL's bottle also carries its level and freshness inline (C3's controls).
 *
 * Header: the count ("3 in Home") and **Add** (the add sheet). With none:
 * "None in your cellar" and Add to cellar as the card's one action.
 */
export function YourBottles({
  itemId,
  itemType,
  itemName,
  bottles,
  total,
  selectedId = null,
  addableCellars = [],
}: YourBottlesProps) {
  const actions = useItemActions();
  // F-156: `changed()` refreshes the page; in the desktop pane this re-reads
  // the pane's own query too.
  const refreshAfterWrite = useRefreshAfterWrite();
  const changed = () => {
    actions?.changed();
    refreshAfterWrite();
  };
  const [adding, setAdding] = useState(false);
  const [checking, startCheckIn] = useTransition();
  const [, checkIn] = useMutation(CheckInMutation);
  const [, deleteLog] = useMutation(DeleteDrinkLogMutation);

  const words = typeWords(itemType);
  const canAdd = addableCellars.length > 0;
  const openId =
    selectedId ?? bottles.find((bottle) => bottle.emptyAt === null)?.id ?? null;

  const onCheckIn = (bottle: YourBottle) =>
    startCheckIn(async () => {
      const result = await checkInBottle(
        { checkIn, deleteLog },
        { ...bottle, isOwner: true },
      );
      if (!result.ok) {
        notify("Couldn’t check in", {
          tone: "error",
          description: result.message,
        });
        return;
      }
      changed();
      notify("Checked in", {
        undo: () => {
          void result.undo().then((undone) => {
            if (!undone.ok) {
              notify("Couldn’t undo that", {
                tone: "error",
                description: undone.message,
              });
            }
            changed();
          });
        },
      });
    });

  const addSheet = (
    <AddToCellarSheet
      open={adding}
      onOpenChange={setAdding}
      itemId={itemId}
      itemType={itemType}
      cellars={addableCellars}
    />
  );

  return (
    <section
      id="your-bottles"
      data-slot="your-bottles"
      className="flex flex-col gap-2"
    >
      <div className="flex min-h-11 items-center gap-2">
        <h2 className="t-head text-ink">{yourContainersLabel(itemType)}</h2>
        <span className="t-body tabular min-w-0 flex-1 truncate text-ink-2">
          {countLine(itemType, bottles, total)}
        </span>
        {canAdd && bottles.length > 0 && (
          <Button variant="quiet" onClick={() => setAdding(true)}>
            <Add aria-hidden />
            Add
          </Button>
        )}
      </div>

      {bottles.length === 0 ? (
        <div
          data-slot="your-bottles-empty"
          className="flex flex-col items-center gap-3 rounded-lg border border-edge bg-card px-4 py-6 text-center"
        >
          <span className="t-body text-ink">None in your cellar</span>
          {canAdd && (
            <Button onClick={() => setAdding(true)}>Add to cellar</Button>
          )}
          {!canAdd && (
            <Button variant="outline" asChild>
              <Link href="/cellars" underline="none">
                Make a cellar
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge bg-card">
          {bottles.map((bottle, i) => {
            const selected = bottle.id === selectedId;
            const expanded = bottle.id === openId;
            const finished = bottle.emptyAt !== null;
            const cellar = bottle.cellarName ?? "Your cellar";
            const date = dateLine(bottle);
            return (
              <div
                key={bottle.id}
                data-slot="your-bottle"
                data-selected={selected || undefined}
                data-open={expanded || undefined}
                className={cn(
                  i > 0 && "border-hair border-t",
                  expanded && "bg-sel",
                )}
              >
                <div className="relative flex min-h-16 items-center gap-3 px-4 py-3">
                  <LevelGauge type={itemType} bottle={bottle} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={bottleHref(bottle.cellarId, itemType, bottle.id)}
                      overlay
                      underline="none"
                      aria-current={selected ? "page" : undefined}
                      aria-label={`${bottleStateLine(bottle)}, ${cellar}`}
                      className={cn(
                        "line-clamp-2 text-ink",
                        expanded ? "t-title" : "t-head",
                      )}
                    >
                      {bottleStateLine(bottle)}
                    </Link>
                    <span className="t-cap line-clamp-2 text-ink-2">
                      {cellar}
                      {date !== null && <> · {date}</>}
                    </span>
                  </div>
                  {expanded && !finished && (
                    <Button
                      className="relative z-10 shrink-0"
                      disabled={checking}
                      onClick={() => onCheckIn(bottle)}
                    >
                      <Pour aria-hidden />
                      Check in
                    </Button>
                  )}
                </div>
                {expanded && !finished && (
                  <div className="flex items-center justify-end gap-1 px-2 pb-2">
                    <Button
                      variant="quiet"
                      aria-haspopup="dialog"
                      aria-label={`${words.pour} from ${cellar}`}
                      onClick={() =>
                        actions?.pour({
                          cellarId: bottle.cellarId,
                          cellarItemId: bottle.id,
                          openAt: bottle.openAt,
                          percentageRemaining: bottle.percentageRemaining,
                        })
                      }
                    >
                      {words.pour}…
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() =>
                        actions?.logDrink({
                          cellarId: bottle.cellarId,
                          cellarItemId: bottle.id,
                        })
                      }
                      aria-label={`Log a drink from ${cellar}`}
                    >
                      Log…
                    </Button>
                  </div>
                )}
                {selected && (
                  // The bottle the URL names: its level, Mark as opened,
                  // Finished, Restore and freshness, inline (C3's controls).
                  <div className="px-4 pb-4">
                    <ItemRemainingSlider
                      itemId={bottle.id}
                      cellarId={bottle.cellarId}
                      isCellarOwner
                      percentageRemaining={bottle.percentageRemaining}
                      opened={bottle.openAt}
                      emptied={bottle.emptyAt}
                      itemName={itemName}
                      cellarName={bottle.cellarName ?? undefined}
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
        </div>
      )}
      {canAdd && addSheet}
    </section>
  );
}

/** Kept for callers that only need the gauge (the visitor's bottle card). */
export { LevelGauge };
