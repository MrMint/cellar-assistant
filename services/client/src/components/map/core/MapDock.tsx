"use client";

import {
  animate,
  motion,
  type PanInfo,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { feedback } from "@/lib/feedback";
import { spring, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { type DockDetent, dockHeights, dockRelease } from "./dock";

/**
 * The map's dock on a phone (Map board): a sheet resting over the lower map
 * at two and a half rows of the list, with the search row always in reach.
 * Drag the grabber between peek, rest and full (a detent tick at each); tap
 * it to go between rest and full. Not modal: the map above stays live.
 * `head` is the search row; `children` scroll under it (chips and list).
 * `above` rides 12 above the dock's top edge (the locate disc, errors).
 */
export function MapDock({
  mapHeight,
  detent,
  onDetentChange,
  head,
  above,
  hidden = false,
  children,
}: {
  /** The map's own height, measured: the detents are worked out from it. */
  mapHeight: number;
  detent: DockDetent;
  onDetentChange: (detent: DockDetent) => void;
  head: ReactNode;
  above?: ReactNode;
  /** A place's drawer or the pin drop has the bottom of the map. */
  hidden?: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const heights = useMemo(() => dockHeights(mapHeight), [mapHeight]);
  const height = useMotionValue(heights[detent]);
  const dragStart = useRef(0);
  const [dragging, setDragging] = useState(false);

  // Settle on the detent whenever it, or the map's size, changes.
  useEffect(() => {
    const controls = animate(
      height,
      heights[detent],
      reducedMotion ? tween("short") : spring.sheet,
    );
    return () => controls.stop();
  }, [height, heights, detent, reducedMotion]);

  const settle = (next: DockDetent) => {
    if (next !== detent) {
      feedback("detent");
      onDetentChange(next);
    } else {
      animate(
        height,
        heights[detent],
        reducedMotion ? tween("short") : spring.sheet,
      );
    }
  };

  const onPanStart = () => {
    dragStart.current = height.get();
    setDragging(true);
  };
  const onPan = (_: PointerEvent, info: PanInfo) => {
    const next = dragStart.current - info.offset.y;
    height.set(Math.max(heights.peek * 0.85, Math.min(heights.full, next)));
  };
  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    setDragging(false);
    settle(dockRelease(height.get(), info.velocity.y, heights));
  };

  return (
    <motion.div
      data-slot="map-dock"
      data-detent={detent}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={{ height }}
      animate={{ y: hidden ? "110%" : 0 }}
      transition={reducedMotion ? tween("short") : spring.sheet}
      className="absolute inset-x-0 bottom-0 z-[13] flex flex-col rounded-t-lg border-edge border-t bg-surface-1 shadow-dock"
    >
      {above !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex flex-col items-end gap-2 px-4 pb-3 *:pointer-events-auto">
          {above}
        </div>
      )}
      <motion.div
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        className="-mb-2 flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <button
          type="button"
          aria-label={detent === "full" ? "Show the map" : "Show the list"}
          aria-expanded={detent === "full"}
          onClick={() => {
            if (dragging) return;
            settle(detent === "full" ? "rest" : "full");
          }}
          className="flex h-11 w-24 items-center justify-center rounded-md outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
        >
          <span aria-hidden className="h-1 w-9 rounded-grabber bg-edge-2" />
        </button>
      </motion.div>
      <div className="shrink-0 px-4 pb-3">{head}</div>
      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain px-4 pb-4",
          detent === "peek" ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
