"use client";

import { ArrowUp, ICON_STROKE } from "@/components/app/icons";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type Edges, mainEdge } from "./own-places";

const TURN = { up: 0, right: 90, down: 180, left: 270 } as const;

/**
 * F-33 (Map board): "12 of yours beyond this view", its arrow pointing the
 * way most of them lie. A tap takes the map to them.
 */
export function BeyondChip({
  total,
  edges,
  onShow,
  className,
}: {
  total: number;
  edges: Edges;
  onShow: () => void;
  className?: string;
}) {
  if (total === 0) return null;
  const edge = mainEdge(edges);
  return (
    <button
      type="button"
      data-slot="map-beyond"
      aria-label={`${total} of your places beyond this view, show them`}
      onClick={() => {
        feedback("tick");
        onShow();
      }}
      className={cn(
        "t-cap inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full border border-edge bg-surface-1 px-3 text-ink outline-none active:bg-raised focus-visible:outline-2 focus-visible:outline-act-ink",
        className,
      )}
    >
      <ArrowUp
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-4 text-act-ink"
        style={{ transform: `rotate(${edge === null ? 0 : TURN[edge]}deg)` }}
      />
      <span className="tabular">{total} of yours beyond this view</span>
    </button>
  );
}
