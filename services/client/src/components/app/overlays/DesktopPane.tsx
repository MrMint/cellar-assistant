"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { distance, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Close, Expand } from "../icons";
import { GlassDisc } from "./GlassDisc";
import { useOverlayLayer } from "./layers";

export type DesktopPaneProps = {
  open: boolean;
  onClose: () => void;
  /** Its name, for the region's label. */
  title: string;
  /** The 320 photo the discs sit on. */
  photo?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Expand to the full page. */
  onExpand?: () => void;
  /** The ⋯ disc (a menu trigger the owner draws with `GlassDisc`). */
  more?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * The desktop pane (KIT § 3; kit-desktop): 440 wide beside the grid,
 * replacing the quick look from `md` up. A 320 photo with glass discs (close,
 * previous, next (left, right) on the left; expand, more on the right), then the owner's body.
 * Esc or back closes it when it is on top, and focus goes back to the tile
 * it opened from. The owner places it in its row (C1, P1).
 */
export function DesktopPane({
  open,
  onClose,
  title,
  photo,
  onPrevious,
  onNext,
  onExpand,
  more,
  className,
  children,
}: DesktopPaneProps) {
  const reducedMotion = useReducedMotion() ?? false;
  useOverlayLayer(open, onClose, { escape: true });

  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  useEffect(() => {
    if (open) return;
    const element = opener.current;
    opener.current = null;
    if (element?.isConnected) element.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  return (
    <motion.aside
      data-slot="desktop-pane"
      aria-label={title}
      initial={
        reducedMotion ? { opacity: 0 } : { opacity: 0, x: distance.list * 3 }
      }
      animate={{ opacity: 1, x: 0 }}
      transition={tween("short", "enter")}
      className={cn(
        "flex h-full w-110 shrink-0 flex-col overflow-y-auto border-l border-hair bg-surface-1 text-ink",
        className,
      )}
    >
      <div className="relative h-80 shrink-0 overflow-hidden bg-raised">
        {photo}
        <div className="absolute inset-x-3 top-3 flex items-center gap-2">
          <GlassDisc aria-label="Close" onClick={onClose}>
            <Close aria-hidden />
          </GlassDisc>
          <GlassDisc
            aria-label="Previous"
            disabled={onPrevious === undefined}
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden />
          </GlassDisc>
          <GlassDisc
            aria-label="Next"
            disabled={onNext === undefined}
            onClick={onNext}
          >
            <ChevronRight aria-hidden />
          </GlassDisc>
          <span className="flex-1" />
          {onExpand !== undefined && (
            <GlassDisc aria-label="Open page" onClick={onExpand}>
              <Expand aria-hidden />
            </GlassDisc>
          )}
          {more}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">{children}</div>
    </motion.aside>
  );
}
