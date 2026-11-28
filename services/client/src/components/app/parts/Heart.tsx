"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ICON_STROKE, Love } from "../icons";

/** SPEC § Movements 13: the heart pops from .6 to 1. */
export const HEART_POP_FROM = 0.6;

export type HeartProps = {
  on: boolean;
  onToggle: (next: boolean) => void;
  /** `tile`: an 18 glyph in a 44 target; `page`: a 24 glyph in a 44 disc. */
  size?: "tile" | "page";
  /** The control's name; the state is `aria-pressed`. */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * KIT § 2 "Heart": a 44 target, an outline in the glyph colour, filled in
 * heart when on. Turning it on is the person's moment: the glyph springs from
 * .6 (`spring.celebrate`) with the success cue; turning it off ticks and only
 * the fill changes. Under reduced motion the root `MotionConfig` drops the
 * scale, so only the fill changes (SPEC row 13). Only a tap pops it: a heart
 * that mounts on, or that data turns on, does not.
 */
export function Heart({
  on,
  onToggle,
  size = "tile",
  label = "Favourite",
  disabled = false,
  className,
}: HeartProps) {
  const tapped = useRef(false);
  const pop = on && tapped.current;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      data-slot="heart"
      data-state={on ? "on" : "off"}
      onClick={() => {
        tapped.current = true;
        feedback(on ? "tick" : "success");
        onToggle(!on);
      }}
      className={cn(
        "group/heart relative inline-flex size-11 shrink-0 items-center justify-center rounded-disc outline-none focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 disabled:opacity-40",
        on ? "text-heart" : "text-glyph",
        className,
      )}
    >
      <motion.span
        key={on ? "on" : "off"}
        className="inline-flex transition-transform duration-(--ca-dur-micro) ease-standard group-active/heart:scale-[.82] motion-reduce:group-active/heart:scale-100"
        initial={pop ? { scale: HEART_POP_FROM } : false}
        animate={{ scale: 1 }}
        transition={spring.celebrate}
      >
        <Love
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={cn(
            size === "tile" ? "size-[18px]" : "size-6",
            on && "fill-current",
          )}
        />
      </motion.span>
      <HapticOverlay />
    </button>
  );
}
