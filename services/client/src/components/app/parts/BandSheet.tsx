"use client";

import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { BottomSheet } from "../BottomSheet";
import { Check, Delete, ICON_STROKE, Ranked } from "../icons";
import { BANDS, type Band, BandMarker, bandName } from "./Rank";

export type BandSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is ranked: the sheet's title. */
  subject: string;
  rank: number;
  band: Band;
  listName: string;
  /** How many sit in each band now. */
  counts: Readonly<Partial<Record<Band, number>>>;
  /** A band was chosen (not the current one). The caller moves and toasts. */
  onChoose: (band: Band) => void;
  /** "Exact position…": the caller opens the pairwise placement. */
  onExactPosition?: () => void;
  /** "Remove from list": the caller confirms (a list entry is the owner's). */
  onRemove?: () => void;
};

/**
 * The band sheet (CROSS-LOT: Social-Lists 23): the subject as its title,
 * "#27 · Very Good · Cafe List" under it, five band rows (marker, name, count,
 * a check on the current one), then "Exact position…" and "Remove from list".
 * Choosing ticks and closes; the caller raises "Moved to Very Good · #27 ·
 * <subject>" with Undo.
 */
export function BandSheet({
  open,
  onOpenChange,
  subject,
  rank,
  band,
  listName,
  counts,
  onChoose,
  onExactPosition,
  onRemove,
}: BandSheetProps) {
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
          #{rank} · {bandName(band)} · {listName}
        </span>
      }
    >
      <div
        role="radiogroup"
        aria-label="Band"
        data-slot="band-sheet"
        className="flex flex-col"
      >
        {BANDS.map(({ band: b, name }) => {
          const current = b === band;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a sheet row, not a native radio: it closes the sheet on tap.
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={current}
              onClick={() => {
                feedback("tick");
                close();
                if (!current) onChoose(b);
              }}
              className={row}
            >
              <BandMarker band={b} />
              <span className="t-head min-w-0 flex-1 truncate text-ink">
                {name}
              </span>
              <span className="t-cap tabular text-ink-3">{counts[b] ?? 0}</span>
              <Check
                aria-hidden
                strokeWidth={ICON_STROKE}
                className={cn(
                  "size-5 shrink-0 text-act-ink",
                  !current && "invisible",
                )}
              />
            </button>
          );
        })}
      </div>
      {(onExactPosition !== undefined || onRemove !== undefined) && (
        <div className="mt-1.5 flex flex-col border-rule border-t pt-1.5">
          {onExactPosition !== undefined && (
            <button
              type="button"
              className={cn(row, "text-ink")}
              onClick={() => {
                feedback("press");
                close();
                onExactPosition();
              }}
            >
              <Ranked
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-5 text-act-ink"
              />
              <span className="t-body">Exact position…</span>
            </button>
          )}
          {onRemove !== undefined && (
            <button
              type="button"
              className={cn(row, "text-danger")}
              onClick={() => {
                feedback("press");
                close();
                onRemove();
              }}
            >
              <Delete
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-5"
              />
              <span className="t-body">Remove from list</span>
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
