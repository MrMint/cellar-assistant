"use client";

import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TOASTER_CLASS } from "./toastLayer";

/**
 * Toasts sit **above** the tab bar, never on it (obs 41; design §4.6): the
 * bottom offset is the bar's height, the home-indicator inset and 12 pt.
 * Mounted once, in `AppClientProviders`; raise one with `notify()`. Its
 * toasts stay tappable over an open sheet (`toastLayer.ts`).
 */
export const TOAST_OFFSET =
  "calc(var(--ca-tabbar-h) + env(safe-area-inset-bottom) + 12px)";

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
