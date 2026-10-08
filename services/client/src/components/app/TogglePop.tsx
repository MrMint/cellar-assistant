"use client";

import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** The pop's peak (design §4.5: scale 1 → 1.18 → 1). */
export const TOGGLE_POP_SCALE = 1.18;

/**
 * The toggle pop (design §4.5, X24): when a toggle turns **on** — a heart, a
 * "Visited" check — its glyph jumps to 1.18× and settles back on
 * `spring.celebrate`. Turning off is only the colour change: the pop is for
 * the moment the user owns, not for undoing it.
 *
 * Keyed on the state, so each turn-on starts a fresh pop, and it starts on
 * the tap itself because the state it follows is the optimistic one
 * (`useOptimisticToggle`). A toggle that is already on when it mounts does
 * not pop. Under reduced motion the root `MotionConfig` drops the transform
 * and only the colour changes.
 */
export function TogglePop({
  on,
  className,
  children,
}: {
  on: boolean;
  className?: string;
  children: ReactNode;
}) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <motion.span
      key={on ? "on" : "off"}
      data-slot="toggle-pop"
      data-state={on ? "on" : "off"}
      className={cn("inline-flex shrink-0", className)}
      initial={on && mounted.current ? { scale: TOGGLE_POP_SCALE } : false}
      animate={{ scale: 1 }}
      transition={spring.celebrate}
    >
      {children}
    </motion.span>
  );
}
