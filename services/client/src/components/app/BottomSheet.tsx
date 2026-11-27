"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { distance, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { tapOrigin, watchTaps } from "./overlays/tap-origin";
import { type SnapDecision, settleMs, VAUL_SETTLE_MS } from "./sheet-physics";
import { keepOpenForToasts } from "./toastLayer";
import { useReturnFocus } from "./useReturnFocus";
import { useSheetDrag } from "./useSheetDrag";

export type SheetSnap = "peek" | "half" | "full";

/**
 * vaul's close transition (`TRANSITIONS.DURATION`, 0.5 s). vaul keeps the
 * sheet mounted that long under reduced motion too, so `onClosed` waits it out
 * either way.
 */
const CLOSE_MS = VAUL_SETTLE_MS;

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
  settleAfterMs: number,
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
    const timer = window.setTimeout(settle, settleAfterMs);
    return () => {
      document.removeEventListener("transitionend", onTransitionEnd, true);
      window.clearTimeout(timer);
    };
  }, [open, nodeRef, snap, settleAfterMs]);
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
  /**
   * ux-c M6: runs when the sheet settles on a different snap point than the
   * one it rested at — after a drag or a fling, once the snap transition is
   * over. Never for a sheet without `snapPoints`, never on close, and not for
   * the `initialSnap` it opens at.
   */
  onSnapChange?: (snap: SheetSnap) => void;
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
  onSnapChange,
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
  const reducedMotion = useReducedMotion() ?? false;
  const settleAfterMs = settleMs(reducedMotion);
  useOpenSheetSignal(open, contentRef, snap, settleAfterMs);
  useEffect(watchTaps, []);
  // SPEC movement 9: the sheet rises from .94 at the tap's x. vaul owns the
  // rise from 100 %; the scale is the content's, read once per open.
  const [origin, setOrigin] = useState("50% 100%");
  useEffect(() => {
    if (!open) return;
    const width = typeof window === "undefined" ? 0 : window.innerWidth;
    setOrigin(tapOrigin(0, width));
  }, [open]);

  // A close vaul starts (drag, fling, backdrop, Escape) passes through here,
  // and vaul may still pick a snap in the same release: from then on, nothing
  // is a snap change (M6: never on close).
  const closingRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const onVaulOpenChange = useCallback((next: boolean) => {
    if (!next) closingRef.current = true;
    onOpenChangeRef.current(next);
  }, []);

  // The release decision from `useSheetDrag`, made from the release velocity
  // during the pointerup, before vaul's handler. vaul's own pick uses the
  // whole drag's average speed; ours replaces it as vaul reports it. vaul
  // reports nothing when it picks the snap it is already on (a controlled
  // value it does not change), so a decision still pending a tick later is
  // applied then. A close vaul started always wins.
  const releaseRef = useRef<SnapDecision | null>(null);
  const fractionsRef = useRef(fractions);
  fractionsRef.current = fractions;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const applyRelease = useCallback(
    (decision: SnapDecision, fallback: number | string | null | undefined) => {
      if (decision.kind === "dismiss" && dismissibleRef.current) {
        onVaulOpenChange(false);
        return;
      }
      const index = decision.kind === "snap" ? decision.index : 0;
      setSnap(fractionsRef.current?.[index] ?? fallback);
    },
    [onVaulOpenChange],
  );
  const onRelease = useCallback(
    (decision: SnapDecision) => {
      releaseRef.current = decision;
      window.setTimeout(() => {
        if (releaseRef.current !== decision) return;
        releaseRef.current = null;
        if (!closingRef.current) applyRelease(decision, undefined);
      }, 0);
    },
    [applyRelease],
  );
  const onVaulSnap = useCallback(
    (next: number | string | null) => {
      const decision = releaseRef.current;
      releaseRef.current = null;
      if (closingRef.current || decision === null) {
        setSnap(next);
        return;
      }
      applyRelease(decision, next);
    },
    [applyRelease],
  );

  useSheetDrag({
    open,
    nodeRef: contentRef,
    fractions,
    activeFraction: typeof snap === "number" ? snap : null,
    dismissible,
    onRelease,
  });

  // M6: report a new resting snap once it has settled, unless the sheet is
  // closing by then. `settledRef` is the snap it last rested at, reset to
  // `initialSnap` on every open.
  const onSnapChangeRef = useRef(onSnapChange);
  onSnapChangeRef.current = onSnapChange;
  const settledRef = useRef<number | string | null | undefined>(initial);
  // Set while a re-open's reset to `initialSnap` has not rendered yet: the
  // snap left over from last time is not a change.
  const resettingRef = useRef(false);

  // Re-opening starts from the declared snap, not wherever it was left.
  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    settledRef.current = initial;
    resettingRef.current = true;
    setSnap(initial);
  }, [open, initial]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `fractions` and `snapPoints` are new arrays each render; `snap` is one of `fractions`, so it is the trigger.
  useEffect(() => {
    if (resettingRef.current) {
      if (snap === settledRef.current) resettingRef.current = false;
      return;
    }
    if (!open || fractions === undefined || snapPoints === undefined) return;
    if (snap === settledRef.current || typeof snap !== "number") return;
    const index = fractions.indexOf(snap);
    const name = snapPoints[index];
    if (name === undefined) return;
    const timer = window.setTimeout(() => {
      if (closingRef.current) return;
      settledRef.current = snap;
      onSnapChangeRef.current?.(name);
    }, settleAfterMs);
    return () => window.clearTimeout(timer);
  }, [open, snap, settleAfterMs]);

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

  const snapProps =
    fractions === undefined
      ? {}
      : {
          snapPoints: fractions,
          activeSnapPoint: snap ?? null,
          setActiveSnapPoint: onVaulSnap,
        };

  return (
    <Drawer
      open={open}
      onOpenChange={onVaulOpenChange}
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
          // KIT § 2: r16 tops, the 36 × 4 grabber (ui/drawer), sh-pop, at
          // most 788 tall; a hairline edge where it meets the page.
          "touch-none-select rounded-t-lg border-x-0 border-t border-b-0 border-hair bg-surface-1 text-ink shadow-pop outline-none",
          "pb-[max(1rem,env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-[788px]",
          // Written with ui/drawer's own `data-[vaul-drawer-direction=bottom]:`
          // variant so tailwind-merge replaces its 80vh cap; a bare `max-h-*`
          // loses to that variant's higher specificity. A snapping sheet is
          // exactly `full` tall (94dvh = SNAP_FRACTION.full) and only moves.
          fractions === undefined
            ? "data-[vaul-drawer-direction=bottom]:max-h-[min(90dvh,788px)]"
            : "h-[94dvh] data-[vaul-drawer-direction=bottom]:max-h-[94dvh]",
          className,
        )}
      >
        <motion.div
          data-slot="bottom-sheet-body"
          className="flex min-h-0 flex-1 flex-col"
          style={{ transformOrigin: origin }}
          initial={reducedMotion ? false : { scale: distance.sheetFrom }}
          animate={{ scale: 1 }}
          transition={spring.sheet}
        >
          <DrawerHeader
            className={cn("px-4 pt-3 pb-2", hideTitle && "sr-only")}
          >
            <DrawerTitle className="t-title text-left">{title}</DrawerTitle>
            {description !== undefined && (
              <DrawerDescription className="t-body text-left text-ink-2">
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
        </motion.div>
      </DrawerContent>
    </Drawer>
  );
}
