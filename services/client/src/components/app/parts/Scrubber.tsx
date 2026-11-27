"use client";

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { BAND_FILL, type Band, bandName } from "./Rank";

export type ScrubberBand = { band: Band; count: number };

/** Which band holds the rank at `index` (0-based), best band first. */
export function bandAt(
  bands: readonly ScrubberBand[],
  index: number,
): Band | undefined {
  let seen = 0;
  for (const b of bands) {
    seen += b.count;
    if (index < seen) return b.band;
  }
  return bands.at(-1)?.band;
}

/** The first index of each band after the first: where the detents sit. */
export function bandStarts(bands: readonly ScrubberBand[]): number[] {
  const starts: number[] = [];
  let seen = 0;
  for (const b of bands) {
    if (b.count === 0) continue;
    starts.push(seen);
    seen += b.count;
  }
  return starts;
}

/** The index a pointer at `fraction` (0 top, 1 bottom) of the rail points at. */
export function indexAtFraction(total: number, fraction: number): number {
  if (total <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.min(total - 1, Math.floor(clamped * total));
}

/**
 * KIT § 2 / § 4: the tier list's scrubber, on the left, never moving. A rail
 * of the bands in proportion (k5 at the top), with a thumb at the current
 * rank. Dragging or tapping jumps the list; crossing into another band is a
 * detent (haptic and sound). A slider to assistive tech: arrows step one
 * rank, Page Up / Page Down jump a band, Home / End the ends.
 */
export function Scrubber({
  bands,
  value,
  onValueChange,
  "aria-label": ariaLabel = "Jump to a rank",
  className,
}: {
  bands: readonly ScrubberBand[];
  /** The current rank's index, 0-based. */
  value: number;
  onValueChange: (index: number) => void;
  "aria-label"?: string;
  className?: string;
}) {
  const total = bands.reduce((n, b) => n + b.count, 0);
  const rail = useRef<HTMLDivElement>(null);
  const last = useRef(value);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(0, next), Math.max(0, total - 1));
    if (clamped === last.current) return;
    if (bandAt(bands, clamped) !== bandAt(bands, last.current)) {
      feedback("detent");
    }
    last.current = clamped;
    onValueChange(clamped);
  };

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = rail.current?.getBoundingClientRect();
    if (box === undefined || box.height === 0) return;
    go(indexAtFraction(total, (event.clientY - box.top) / box.height));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const starts = bandStarts(bands);
    const next = (() => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          return value + 1;
        case "ArrowUp":
        case "ArrowLeft":
          return value - 1;
        case "PageDown":
          return starts.find((s) => s > value) ?? total - 1;
        case "PageUp":
          return [...starts].reverse().find((s) => s < value) ?? 0;
        case "Home":
          return 0;
        case "End":
          return total - 1;
        default:
          return undefined;
      }
    })();
    if (next === undefined) return;
    event.preventDefault();
    last.current = value;
    go(next);
  };

  const band = bandAt(bands, value);
  const thumbTop = total > 0 ? ((value + 0.5) / total) * 100 : 0;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={1}
      aria-valuemax={Math.max(1, total)}
      aria-valuenow={value + 1}
      aria-valuetext={`#${value + 1}${band === undefined ? "" : `, ${bandName(band)}`}`}
      data-slot="scrubber"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        last.current = value;
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          fromPointer(event);
        }
      }}
      className={cn(
        "touch-none-select relative flex w-11 shrink-0 touch-none justify-center rounded-md py-2 outline-none focus-visible:outline-2 focus-visible:outline-act-ink",
        className,
      )}
    >
      <div ref={rail} className="relative flex h-full w-1.5 flex-col gap-0.5">
        {bands
          .filter((b) => b.count > 0)
          .map((b) => (
            <span
              key={b.band}
              aria-hidden
              className={cn(
                "w-full rounded-[3px] ring-1 ring-band-edge ring-inset",
                BAND_FILL[b.band],
              )}
              style={{ flexGrow: b.count, flexBasis: 0 }}
            />
          ))}
        {total > 0 && (
          <span
            aria-hidden
            data-slot="scrubber-thumb"
            className="t-micro tabular absolute left-1/2 flex h-6 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-edge-2 bg-card px-1 text-ink shadow-pop"
            style={{ top: `${thumbTop}%` }}
          >
            {value + 1}
          </span>
        )}
      </div>
    </div>
  );
}
