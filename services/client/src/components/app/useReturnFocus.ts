"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Hands focus back to whatever opened a modal once it closes.
 *
 * Radix `Dialog` (and vaul, which is built on it) returns focus only to its
 * own `DialogTrigger`: its close handler prevents the focus scope's restore
 * and focuses `triggerRef`, which is null for every controlled modal here —
 * `ResponsiveDialog`, `BottomSheet` and `ConfirmSheet` take `open`, not a
 * trigger. So closing one dropped focus on `<body>`, measured in Chromium on
 * the lane for the check-in friend picker, phone and desktop alike.
 *
 * The opener is read in a layout effect when `open` turns true, which runs
 * before the focus scope's own (passive) mount effect moves focus inside.
 * Pass the returned handler as the content's `onCloseAutoFocus`; it does
 * nothing (Radix's default runs) when the opener has left the document.
 */
export function useReturnFocus(open: boolean): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  return useCallback((event: Event) => {
    const element = opener.current;
    opener.current = null;
    if (element === null || !element.isConnected) return;
    event.preventDefault();
    element.focus({ preventScroll: true });
  }, []);
}
