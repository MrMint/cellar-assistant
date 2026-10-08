"use client";

import { Toaster as SonnerToaster } from "@/components/ui/sonner";

/**
 * Toasts sit **above** the tab bar, never on it (obs 41; design §4.6): the
 * bottom offset is the bar's height, the home-indicator inset and 12 pt.
 * Mounted once, in `AppClientProviders`; raise one with `notify()`.
 */
export const TOAST_OFFSET =
  "calc(var(--ca-tabbar-h) + env(safe-area-inset-bottom) + 12px)";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={{ bottom: TOAST_OFFSET }}
      mobileOffset={{ bottom: TOAST_OFFSET }}
      gap={8}
    />
  );
}
