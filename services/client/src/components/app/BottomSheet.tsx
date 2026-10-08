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

/** Snap names → vaul's fractions of the viewport height. */
export const SNAP_FRACTION: Readonly<Record<SheetSnap, number>> = {
  peek: 0.3,
  half: 0.55,
  full: 0.94,
};

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
  footer,
  className,
  children,
}: BottomSheetProps) {
  const fractions = snapPoints?.map((s) => SNAP_FRACTION[s]);
  const initial =
    fractions === undefined
      ? undefined
      : SNAP_FRACTION[initialSnap ?? snapPoints?.[0] ?? "half"];
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
        className={cn(
          "surface-glass touch-none-select rounded-t-lg border-none text-foreground outline-none",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
          fractions === undefined ? "max-h-[90dvh]" : "h-[96dvh] max-h-[96dvh]",
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
