"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type SheetSnap = "peek" | "half" | "full";

/** Snap names → how much of the viewport height the sheet shows. */
export const SNAP_FRACTION: Readonly<Record<SheetSnap, number>> = {
  peek: 0.3,
  half: 0.55,
  full: 0.94,
};

/**
 * The fraction vaul needs for a snap. vaul translates the drawer down by
 * `(1 - fraction) × viewport` from where it rests fully open, so with a
 * drawer `full` tall the visible height is `fraction - (1 - full)`: `full`
 * is vaul's 1, and the smaller snaps are lifted by the same 6%. Passing the
 * visible fractions straight through showed 24% for "peek".
 */
export function vaulSnapPoint(snap: SheetSnap): number {
  const fraction = SNAP_FRACTION[snap] + (1 - SNAP_FRACTION.full);
  return Math.round(fraction * 1000) / 1000;
}

export type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Required: it is the dialog's accessible name. Pass `hideTitle` when the
   * content already shows a heading and a second visible one would repeat it.
   */
  title: string;
  hideTitle?: boolean;
  description?: ReactNode;
  /**
   * Where the sheet may rest. Omit for a sheet sized to its content (most
   * action lists and confirms); pass names for a resizable one (the map).
   */
  snapPoints?: readonly SheetSnap[];
  /** Which of `snapPoints` it opens at; defaults to the first. */
  initialSnap?: SheetSnap;
  /** `false`: no drag-down or backdrop dismiss (a blocking step). */
  dismissible?: boolean;
  /** `alertdialog` for a confirm (`ConfirmSheet`); a plain dialog otherwise. */
  role?: "dialog" | "alertdialog";
  /** Pinned under the content, above the home indicator. */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * The one bottom sheet (N27; design-direction.md §4.6), on vaul's Drawer:
 * drag with velocity snaps, a focus trap, Escape and a backdrop, from one
 * set of props. Every phone overlay — action lists, the ＋ chooser, the
 * AppBar overflow, confirms, the install prompt — is one of these.
 * `ResponsiveDialog` swaps it for a centred dialog from `md` up.
 *
 * Background scaling is off (it fights the inner scroller); the bottom
 * padding includes the home-indicator inset.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  snapPoints,
  initialSnap,
  dismissible = true,
  role = "dialog",
  footer,
  className,
  children,
}: BottomSheetProps) {
  const fractions = snapPoints?.map(vaulSnapPoint);
  const initial =
    fractions === undefined
      ? undefined
      : vaulSnapPoint(initialSnap ?? snapPoints?.[0] ?? "half");
  const [snap, setSnap] = useState<number | string | null | undefined>(initial);

  // Re-opening starts from the declared snap, not wherever it was left.
  useEffect(() => {
    if (open) setSnap(initial);
  }, [open, initial]);

  const snapProps =
    fractions === undefined
      ? {}
      : {
          snapPoints: fractions,
          activeSnapPoint: snap ?? null,
          setActiveSnapPoint: setSnap,
        };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
      shouldScaleBackground={false}
      {...snapProps}
    >
      <DrawerContent
        data-slot="bottom-sheet"
        role={role}
        className={cn(
          "surface-glass touch-none-select rounded-t-lg border-none text-foreground outline-none",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
          // Written with ui/drawer's own `data-[vaul-drawer-direction=bottom]:`
          // variant so tailwind-merge replaces its 80vh cap; a bare `max-h-*`
          // loses to that variant's higher specificity. A snapping sheet is
          // exactly `full` tall (94dvh = SNAP_FRACTION.full) and only moves.
          fractions === undefined
            ? "data-[vaul-drawer-direction=bottom]:max-h-[90dvh]"
            : "h-[94dvh] data-[vaul-drawer-direction=bottom]:max-h-[94dvh]",
          className,
        )}
      >
        <DrawerHeader className={cn("px-4 pt-3 pb-2", hideTitle && "sr-only")}>
          <DrawerTitle className="type-title-2 text-left">{title}</DrawerTitle>
          {description !== undefined && (
            <DrawerDescription className="type-callout text-left text-ink-2">
              {description}
            </DrawerDescription>
          )}
        </DrawerHeader>
        {description === undefined && (
          // vaul (Radix Dialog) warns without a description; an empty one
          // tells assistive tech there is none rather than leaving it unset.
          <DrawerDescription className="sr-only" />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        {footer !== undefined && (
          <DrawerFooter className="px-4 pt-3 pb-0">{footer}</DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
