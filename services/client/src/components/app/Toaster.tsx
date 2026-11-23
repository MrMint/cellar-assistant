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
export const TOAST_TABBAR_OFFSET =
  "calc(var(--ca-tabbar-h) + env(safe-area-inset-bottom) + 12px)";

export const TOAST_OFFSET = `min(max(${TOAST_TABBAR_OFFSET}, calc(var(--sheet-inset, 0px) + 12px)), calc(100dvh - 96px))`;

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
