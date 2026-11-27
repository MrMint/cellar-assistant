"use client";

import { motion, type PanInfo, useReducedMotion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useRef } from "react";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { distance, gesture, spring, tween, tweenOut } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Close } from "../icons";
import { Link } from "../Link";
import { pauseToasts } from "../notify";
import { keepOpenForToasts } from "../toastLayer";
import { useReturnFocus } from "../useReturnFocus";
import { GlassDisc } from "./GlassDisc";
import { useOverlayLayer } from "./layers";
import { PRESS_CLASS, pressFeedback } from "./press";

/** One card in a quick look: what the tile it was held on shows, and more. */
export type QuickLookItem = {
  id: string;
  /** The name, `t-title`. */
  title: string;
  /** The line under it: "Red · 2019 · Home Cellar". */
  meta?: ReactNode;
  /** The photo, square (an `<img>`, `next/image` or the label plate). */
  photo?: ReactNode;
  /** Stars, and for a place its own Directions row. */
  extra?: ReactNode;
  /** The page "Open page" goes to. */
  href: string;
};

export type QuickLookProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly QuickLookItem[];
  index: number;
  onIndexChange: (index: number) => void;
  /** How many there are in all, when `items` is a window onto a longer list. */
  total?: number;
  /** Where `items[0]` sits in that longer list (for the counter). */
  offset?: number;
};

/** The counter's words: "3 of 240". */
export const counterLabel = (position: number, total: number): string =>
  `${position} of ${total}`;

/**
 * Where a release lands (SPEC § Gestures): a step past 30 % of the width or
 * a sideways fling, a dismiss past 30 % of the height or a downward fling,
 * else back to rest. `velocity` is px/s, as motion reports it.
 */
export function quickLookRelease(
  offset: { x: number; y: number },
  velocity: { x: number; y: number },
  size: { width: number; height: number },
): "next" | "previous" | "dismiss" | "rest" {
  const vx = velocity.x / 1000;
  const vy = velocity.y / 1000;
  const sideways = Math.abs(offset.x) >= Math.abs(offset.y);
  if (sideways) {
    if (
      Math.abs(offset.x) > size.width * gesture.swipeAt ||
      Math.abs(vx) > gesture.flingPxPerMs
    ) {
      return (offset.x === 0 ? vx : offset.x) < 0 ? "next" : "previous";
    }
    return "rest";
  }
  if (offset.y > size.height * gesture.dismissAt || vy > gesture.flingPxPerMs) {
    return "dismiss";
  }
  return "rest";
}

/**
 * Quick look (SPEC movement 6; KIT § 2): peek without losing your place. A
 * full-bleed card over a blurred scrim, the counter on a glass disc, X;
 * swipe for the next, down or Esc or back to close; Open page always one tap
 * away. It opens on a 400 ms hold (`useHoldToPeek`), and a toast pauses
 * while it is open. Desktop uses `DesktopPane` instead.
 */
export function QuickLook({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
  total = items.length,
  offset = 0,
}: QuickLookProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const item = items[index];
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  const returnFocus = useReturnFocus(open);
  useEffect(() => (open ? pauseToasts() : undefined), [open]);
  // Back closes it; Radix answers its own Escape.
  useOverlayLayer(open, () => onOpenChange(false));

  const step = (by: -1 | 1) => {
    const next = index + by;
    if (next < 0 || next >= items.length) return;
    feedback("tick");
    onIndexChange(next);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const rect = cardRef.current?.getBoundingClientRect();
    const result = quickLookRelease(info.offset, info.velocity, {
      width: rect?.width ?? window.innerWidth,
      height: rect?.height ?? window.innerHeight,
    });
    if (result === "next") step(1);
    else if (result === "previous") step(-1);
    else if (result === "dismiss") onOpenChange(false);
  };

  if (item === undefined) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="quick-look-scrim"
          className="fixed inset-0 z-50 bg-scrim backdrop-blur-md data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          data-slot="quick-look"
          aria-describedby={undefined}
          onInteractOutside={keepOpenForToasts}
          onCloseAutoFocus={returnFocus}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") step(1);
            else if (event.key === "ArrowLeft") step(-1);
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+64px)] pb-[calc(env(safe-area-inset-bottom)+16px)] outline-none"
        >
          <span
            data-slot="quick-look-counter"
            className="t-cap absolute top-[calc(env(safe-area-inset-top)+12px)] left-4 flex h-11 items-center rounded-disc bg-glass px-4 text-on-glass backdrop-blur-md"
          >
            {counterLabel(offset + index + 1, total)}
          </span>
          <DialogPrimitive.Close asChild>
            <GlassDisc
              aria-label="Close"
              className="absolute top-[calc(env(safe-area-inset-top)+12px)] right-4"
            >
              <Close aria-hidden />
            </GlassDisc>
          </DialogPrimitive.Close>

          <motion.div
            ref={cardRef}
            key={item.id}
            data-slot="quick-look-card"
            drag
            dragDirectionLock
            dragSnapToOrigin
            dragElastic={{
              left: hasNext ? 1 : gesture.rubber,
              right: hasPrevious ? 1 : gesture.rubber,
              top: gesture.rubber,
              bottom: 1,
            }}
            onDragEnd={onDragEnd}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: distance.sheetFrom }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: tweenOut("short") }}
            transition={reducedMotion ? tween("short") : spring.snappy}
            className="flex w-full max-w-sm touch-none flex-col overflow-hidden rounded-lg border border-edge bg-surface-1 text-ink shadow-dlg"
          >
            {item.photo !== undefined && (
              <div className="aspect-square w-full overflow-hidden bg-raised">
                {item.photo}
              </div>
            )}
            <div className="flex flex-col gap-1 p-4">
              <DialogPrimitive.Title className="t-title text-ink">
                {item.title}
              </DialogPrimitive.Title>
              {item.meta !== undefined && (
                <p className="t-body text-ink-2">{item.meta}</p>
              )}
              {item.extra}
            </div>
            <div className="flex items-center gap-2 border-t border-hair p-2">
              <QuickLookStep
                label="Previous"
                disabled={!hasPrevious}
                onSelect={() => step(-1)}
              >
                <ChevronLeft aria-hidden />
              </QuickLookStep>
              <Link
                href={item.href}
                underline="none"
                {...pressFeedback("primary")}
                onClick={() => feedback("tick")}
                className={cn(
                  "t-head relative flex h-11 flex-1 items-center justify-center rounded-md bg-act text-on-act",
                  PRESS_CLASS,
                )}
              >
                Open page
                <HapticOverlay />
              </Link>
              <QuickLookStep
                label="Next"
                disabled={!hasNext}
                onSelect={() => step(1)}
              >
                <ChevronRight aria-hidden />
              </QuickLookStep>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function QuickLookStep({
  label,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  disabled: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...pressFeedback()}
      onClick={onSelect}
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center rounded-md text-ink outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring disabled:text-ink-3 disabled:opacity-40 [&_svg]:size-5",
        PRESS_CLASS,
      )}
    >
      {children}
      <HapticOverlay />
    </button>
  );
}
