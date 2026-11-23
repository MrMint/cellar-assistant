"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { keepOpenForToasts } from "./toastLayer";
import { useReturnFocus } from "./useReturnFocus";

export type SheetSnap = "peek" | "half" | "full";

/** vaul's close transition (`TRANSITIONS.DURATION`, 0.5 s). */
const CLOSE_MS = 500;
/** vaul's open and snap transitions take the same 0.5 s. */
const SETTLE_MS = CLOSE_MS;

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

/*
 * The open-sheet signal (ux-c M5, plan L39). While at least one sheet is
 * open, `<html>` carries `data-sheet-open` and `--sheet-inset`: the px from
 * the viewport's bottom to the top edge of the topmost open sheet, measured
 * once it settles (its open or snap transition is over) and on resize. Both
 * are cleared when the last sheet closes. Sheets stack: a sheet opened over
 * another is the topmost until it closes, and the one beneath is measured
 * again then. Toasts read `var(--sheet-inset, 0px)` to sit above a sheet.
 * Only a `BottomSheet` publishes — `ResponsiveDialog`'s desktop dialog is not
 * one, so it never does.
 */
export const SHEET_OPEN_ATTRIBUTE = "data-sheet-open";
export const SHEET_INSET_PROPERTY = "--sheet-inset";

type OpenSheet = { readonly node: () => HTMLElement | null };

/** Open sheets, in the order they opened: the last is the topmost. */
const openSheets: OpenSheet[] = [];

const publishSignal = (measure: boolean): void => {
  const root = document.documentElement;
  const top = openSheets.at(-1);
  if (top === undefined) {
    root.removeAttribute(SHEET_OPEN_ATTRIBUTE);
    root.style.removeProperty(SHEET_INSET_PROPERTY);
    return;
  }
  root.setAttribute(SHEET_OPEN_ATTRIBUTE, "");
  if (!measure) return;
  const node = top.node();
  if (node === null) return;
  const inset = Math.max(
    0,
    Math.round(window.innerHeight - node.getBoundingClientRect().top),
  );
  root.style.setProperty(SHEET_INSET_PROPERTY, `${inset}px`);
};

const onSignalResize = (): void => publishSignal(true);

const pushSheet = (sheet: OpenSheet): void => {
  if (openSheets.length === 0) {
    window.addEventListener("resize", onSignalResize);
  }
  openSheets.push(sheet);
  publishSignal(false);
};

const removeSheet = (sheet: OpenSheet): void => {
  const index = openSheets.indexOf(sheet);
  if (index === -1) return;
  openSheets.splice(index, 1);
  if (openSheets.length === 0) {
    window.removeEventListener("resize", onSignalResize);
  }
  publishSignal(true);
};

/**
 * Registers this sheet in the open-sheet stack while `open`, and measures it
 * once it settles: on its own `transitionend`, or after vaul's transition
 * time if none fires. A snap change settles again.
 */
function useOpenSheetSignal(
  open: boolean,
  nodeRef: { readonly current: HTMLElement | null },
  snap: unknown,
): void {
  const entryRef = useRef<OpenSheet | null>(null);

  useEffect(() => {
    if (!open) return;
    const entry: OpenSheet = { node: () => nodeRef.current };
    entryRef.current = entry;
    pushSheet(entry);
    return () => {
      entryRef.current = null;
      removeSheet(entry);
    };
  }, [open, nodeRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `snap` is the trigger — a new snap is a new transition to settle after.
  useEffect(() => {
    if (!open) return;
    const settle = () => {
      const entry = entryRef.current;
      if (entry !== null && openSheets.at(-1) === entry) publishSignal(true);
    };
    // On the document, not the node: vaul may mount the content after this
    // effect runs, and its own transition is the one that counts.
    const onTransitionEnd = (event: Event) => {
      if (event.target !== null && event.target === nodeRef.current) settle();
    };
    document.addEventListener("transitionend", onTransitionEnd, true);
    const timer = window.setTimeout(settle, SETTLE_MS);
    return () => {
      document.removeEventListener("transitionend", onTransitionEnd, true);
      window.clearTimeout(timer);
    };
  }, [open, nodeRef, snap]);
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
  /**
   * Runs once the close animation has finished and the sheet is gone. Open
   * another modal from here, never in the same tick as closing this one: two
   * Radix/vaul modals overlapping can leave `pointer-events: none` on body.
   */
  onClosed?: () => void;
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
 * set of props. Every phone overlay — action lists, the menu place picker, the
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
  onClosed,
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
  const returnFocus = useReturnFocus(open);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useOpenSheetSignal(open, contentRef, snap);

  // `onClosed` once the close transition is over, **however** the sheet was
  // closed. vaul's own `onAnimationEnd` fires only for a close vaul started
  // (drag, backdrop, Escape): a controlled `open={false}` from the parent —
  // a row that closes the sheet and then wants a dialog — never reached it,
  // so the dialog never opened. Watching `open` covers both, once; reopening
  // before the timer cancels it.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const wasOpen = useRef(open);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closing) return;
    const timer = window.setTimeout(() => onClosedRef.current?.(), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

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
        ref={contentRef}
        data-slot="bottom-sheet"
        role={role}
        onCloseAutoFocus={returnFocus}
        onInteractOutside={keepOpenForToasts}
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
