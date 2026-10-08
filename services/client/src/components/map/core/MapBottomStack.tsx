"use client";

import type { ReactNode } from "react";

/**
 * Far below the search/filter panel (1000+); the cards inside no longer need
 * z-indexes of their own to decide which one shows. The map's overlays all
 * live inside `MapLibreRenderer`'s isolated stacking context, so these
 * numbers only order the map's own layers.
 */
export const MAP_BOTTOM_STACK_Z_INDEX = 12;

/**
 * Above the map's bottom edge (and so above the tab bar, which the map no
 * longer runs under), clear of the attribution. Inline, not a class: the
 * offset is the contract `n22-markup.test.tsx` reads.
 */
export const MAP_BOTTOM_STACK_BOTTOM = 40;

/**
 * The map's bottom cards — the error card, "Not on the map yet", the
 * location pre-prompt — in one column above the attribution. Each used to be
 * absolutely placed at the same `bottom: 40`, so when two showed at once the
 * error card sat on top of the pre-prompt and hid its Continue and Not now
 * (UX lane, 2026-10-08). Stacked, the error reads above the card it would
 * have covered. Only the cards take pointer events, never the gap between.
 */
export function MapBottomStack({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="map-bottom-stack"
      style={{ bottom: MAP_BOTTOM_STACK_BOTTOM }}
      className="pointer-events-none absolute left-1/2 z-[12] flex w-[min(420px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2 *:pointer-events-auto"
    >
      {children}
    </div>
  );
}
