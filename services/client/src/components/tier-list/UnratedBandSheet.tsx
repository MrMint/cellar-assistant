"use client";

import { BottomSheet } from "@/components/app/BottomSheet";
import { Delete, ICON_STROKE } from "@/components/app/icons";
import { BANDS, type Band, BandMarker } from "@/components/app/parts/Rank";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * F-176: "Move to band…" for an Unrated entry. F2b's `BandSheet` takes a
 * ranked band as the current one, so an Unrated row's sheet is drawn here
 * the same way — subject as title, "#n · Unrated · list" under it, the five
 * bands with their counts (none checked: it is in none yet), and Remove from
 * list — rather than leaving the button doing nothing.
 */
export function UnratedBandSheet({
  open,
  onOpenChange,
  subject,
  rank,
  listName,
  counts,
  onChoose,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  rank: number;
  listName: string;
  counts: Readonly<Partial<Record<Band, number>>>;
  onChoose: (band: Band) => void;
  onRemove: () => void;
}) {
  const close = () => onOpenChange(false);
  const row =
    "-mx-4 flex h-[52px] w-[calc(100%+2rem)] items-center gap-3 px-4 text-left outline-none active:bg-raised focus-visible:bg-raised";
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={subject}
      description={
        <span className="t-cap tabular text-ink-2">
          #{rank} · Unrated · {listName}
        </span>
      }
    >
      <div
        role="radiogroup"
        aria-label="Band"
        data-slot="band-sheet"
        className="flex flex-col"
      >
        {BANDS.map(({ band, name }) => (
          // biome-ignore lint/a11y/useSemanticElements: a sheet row, not a native radio: it closes the sheet on tap.
          <button
            key={band}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => {
              feedback("tick");
              close();
              onChoose(band);
            }}
            className={row}
          >
            <BandMarker band={band} />
            <span className="t-head min-w-0 flex-1 truncate text-ink">
              {name}
            </span>
            <span className="t-cap tabular text-ink-3">
              {counts[band] ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-col border-rule border-t pt-1.5">
        <button
          type="button"
          className={cn(row, "text-danger")}
          onClick={() => {
            feedback("press");
            close();
            onRemove();
          }}
        >
          <Delete aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
          <span className="t-body">Remove from list</span>
        </button>
      </div>
    </BottomSheet>
  );
}
