"use client";

import { Stack } from "@mui/joy";
import type { ReactNode } from "react";

/**
 * Far below the search/filter panel (1000+); the cards inside no longer need
 * z-indexes of their own to decide which one shows.
 */
export const MAP_BOTTOM_STACK_Z_INDEX = 12;

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
    <Stack
      spacing={1}
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 40,
        transform: "translateX(-50%)",
        zIndex: MAP_BOTTOM_STACK_Z_INDEX,
        width: "min(420px, calc(100% - 32px))",
        pointerEvents: "none",
        "& > *": { pointerEvents: "auto" },
      }}
    >
      {children}
    </Stack>
  );
}
