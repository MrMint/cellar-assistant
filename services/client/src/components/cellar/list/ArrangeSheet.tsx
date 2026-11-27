"use client";

import { useState } from "react";
import { Arrange, Check } from "@/components/app/icons";
import { AnchoredSheet } from "@/components/app/overlays/AnchoredSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { CELLAR_STATUSES, type CellarStatus } from "../cellarItemsQuery";
import { ARRANGEMENTS, type Arrangement, arrangementOf } from "./model";

export type ArrangeSheetProps = {
  arrangement: Arrangement;
  onArrangementChange: (next: Arrangement) => void;
  status: CellarStatus;
  onStatusChange: (next: CellarStatus) => void;
  /** Bottles per Show segment: In cellar, Finished, All. */
  statusCounts: Record<CellarStatus, number>;
  onJump: () => void;
  /** A search orders by match: the sorts step aside, the Show strip stays. */
  searching: boolean;
};

/**
 * The Arrange sheet (lot-cellars-shelves-12; combined-02): Show (In cellar,
 * Finished, All, with counts), then Group (A–Z, Maker, Style, Shelves) and
 * Sort (Newest, Top rated, Unrated, Least left), and "Jump to a letter".
 * Group headers only, no hint lines (Shelves ruling 5: 25 words). A bottom
 * sheet on a phone, a 280 popover at the button from `md`.
 */
export function ArrangeSheet({
  arrangement,
  onArrangementChange,
  status,
  onStatusChange,
  statusCounts,
  onJump,
  searching,
}: ArrangeSheetProps) {
  const [open, setOpen] = useState(false);
  const current = arrangementOf(arrangement);
  const choose = (next: Arrangement) => {
    if (next !== arrangement) feedback("detent");
    onArrangementChange(next);
    setOpen(false);
  };
  const row = (entry: (typeof ARRANGEMENTS)[number]) => {
    const on = entry.value === arrangement;
    return (
      <button
        key={entry.value}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        aria-label={entry.label}
        onClick={() => choose(entry.value)}
        className={cn(
          "t-body flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-2 text-left outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink active:bg-raised [@media(hover:hover)]:hover:bg-raised",
          on ? "text-ink" : "text-ink-2",
        )}
      >
        {entry.short}
        {on && <Check aria-hidden className="size-5 text-act-ink" />}
      </button>
    );
  };
  return (
    <AnchoredSheet
      open={open}
      onOpenChange={setOpen}
      title="Arrange"
      align="end"
      tooltip={{ label: "Arrange" }}
      trigger={
        <Button
          variant="outline"
          aria-label={`Arrange: ${current.label}`}
          data-slot="cellar-arrange"
          className="tabular"
        >
          <Arrange aria-hidden />
          {searching ? "Match" : current.short}
        </Button>
      }
    >
      <div
        className="flex flex-col gap-3 pb-2"
        data-slot="cellar-arrange-sheet"
      >
        <div className="flex justify-end">
          <Button
            variant="quiet"
            onClick={() => {
              setOpen(false);
              onJump();
            }}
          >
            Jump to a letter
          </Button>
        </div>
        <SegmentedControl
          aria-label="Show"
          value={status}
          onValueChange={(next) => {
            onStatusChange(next);
            setOpen(false);
          }}
          options={CELLAR_STATUSES.map((entry) => ({
            value: entry.value,
            label: entry.label,
            count: statusCounts[entry.value],
          }))}
        />
        <div role="menu" aria-label="Group" className="flex flex-col">
          <p className="t-cap px-2 pt-1 text-ink-2">Group</p>
          {ARRANGEMENTS.filter((entry) => entry.group === "order").map(row)}
        </div>
        <div role="menu" aria-label="Sort" className="flex flex-col">
          <p className="t-cap px-2 pt-1 text-ink-2">Sort</p>
          {ARRANGEMENTS.filter((entry) => entry.group === "sort").map(row)}
        </div>
      </div>
    </AnchoredSheet>
  );
}
