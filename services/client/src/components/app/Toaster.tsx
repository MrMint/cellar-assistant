"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { SHEET_INSET_PROPERTY, SHEET_OPEN_ATTRIBUTE } from "./BottomSheet";
import { TOASTER_CLASS } from "./toastLayer";

/**
 * Where a toast sits (KIT § 2 "Toast with Undo" and the fix-round
 * amendments):
 *
 * - Phone: 16 from the sides, 12 above the tab bar (76 from the bottom with
 *   the kit's 64 bar), plus the home-indicator inset.
 * - Over an open sheet: 12 above the sheet's top edge — or 12 from the top
 *   of the screen when the sheet is taller than 70 % of it. BottomSheet
 *   publishes `--sheet-inset` on `<html>` (ux-c M5): px from the viewport
 *   bottom to the topmost sheet's top edge, unset with no sheet.
 * - Desktop (`md` up): centred over the content column (beside the 88 rail),
 *   460 wide, 24 from the bottom.
 *
 * One at a time (`visibleToasts={1}`). Mounted once, in
 * `AppClientProviders`; raise one with `notify()`. Its toasts stay tappable
 * over an open sheet (`toastLayer.ts`).
 */
const TABBAR = "var(--ca-tabbar-h) + env(safe-area-inset-bottom)";

/** `tab bar + 12`, or `sheet top + 12` when a sheet rises above the bar. */
export const TOAST_OFFSET = `calc(${TABBAR} + 12px + max(0px, var(--sheet-inset, 0px) - (${TABBAR})))`;

/** A sheet taller than this share of the screen sends the toast to the top. */
export const TALL_SHEET = 0.7;

/** Whether an open sheet is tall enough that the toast goes to the top. */
export function tallSheetOpen(
  root: HTMLElement = document.documentElement,
  viewport: number = window.innerHeight,
): boolean {
  if (!root.hasAttribute(SHEET_OPEN_ATTRIBUTE)) return false;
  const inset = Number.parseFloat(
    root.style.getPropertyValue(SHEET_INSET_PROPERTY),
  );
  return Number.isFinite(inset) && inset > viewport * TALL_SHEET;
}

function useTallSheet(): boolean {
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTall(tallSheetOpen(root));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["style", SHEET_OPEN_ATTRIBUTE],
    });
    window.addEventListener("resize", read);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);
  return tall;
}

export function Toaster() {
  const desktop = useMediaQuery(breakpointUp("md"));
  const tall = useTallSheet();

  const position = !desktop && tall ? "top-center" : "bottom-center";
  const offset = desktop
    ? { bottom: "24px", left: "16px", right: "16px" }
    : tall
      ? {
          top: "calc(12px + env(safe-area-inset-top))",
          left: "16px",
          right: "16px",
        }
      : { bottom: TOAST_OFFSET, left: "16px", right: "16px" };

  return (
    <SonnerToaster
      // ui/sonner's own classes, plus the one that lets a toast be tapped
      // while a modal holds `body` at `pointer-events: none`. From `md` the
      // toaster is shifted by half the rail, so it centres on the content.
      className={`toaster group ${TOASTER_CLASS} md:ml-11`}
      position={position}
      offset={offset}
      mobileOffset={offset}
      visibleToasts={1}
      gap={8}
      style={desktop ? ({ "--width": "460px" } as CSSProperties) : undefined}
    />
  );
}
