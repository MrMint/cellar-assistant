"use client";

import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TOASTER_CLASS } from "./toastLayer";

/**
 * Toasts sit **above** the tab bar, never on it (obs 41; design §4.6): the
 * bottom offset is the bar's height, the home-indicator inset and 12 pt.
 *
 * While a mobile sheet is open they sit **above the sheet** instead, so a
 * toast never covers its action area (leftovers 3: the "Finished" Undo over
 * the rating sheet's Save). BottomSheet publishes `--sheet-inset` on `<html>`
 * (ux-c M5): px from the viewport bottom to the topmost sheet's top edge,
 * unset when no sheet is open, so the `max` falls back to the tab bar. A
 * near-full-height sheet is capped so the toast stays on screen, over the
 * sheet's header rather than its actions.
 *
 * Mounted once, in `AppClientProviders`; raise one with `notify()`. Its
 * toasts stay tappable over an open sheet (`toastLayer.ts`).
 */
const TABBAR = "var(--ca-tabbar-h) + env(safe-area-inset-bottom)";

/**
 * `max(tab bar + 12, sheet top + 12)`, written as the tab bar's offset plus
 * however far an open sheet rises above the bar (zero with no sheet), and
 * that rise capped so the whole offset stays at most `100dvh - 96px`.
 */
export const TOAST_OFFSET =
  `calc(${TABBAR} + 12px + min(` +
  `max(0px, var(--sheet-inset, 0px) - (${TABBAR})), ` +
  `100dvh - 108px - (${TABBAR})))`;

export function Toaster() {
  return (
    <SonnerToaster
      // ui/sonner's own classes, plus the one that lets a toast be tapped
      // while a modal holds `body` at `pointer-events: none`.
      className={`toaster group ${TOASTER_CLASS}`}
      position="bottom-center"
      offset={{ bottom: TOAST_OFFSET }}
      mobileOffset={{ bottom: TOAST_OFFSET }}
      gap={8}
    />
  );
}
