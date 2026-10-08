"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { distance, exitOf, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedPlaceholderProps {
  examples: string[];
  enabled?: boolean;
  holdDuration?: number;
  /**
   * The input's inner padding, so the text lines up with what the person
   * types. The default matches a Joy `Input` with a start decorator (its own
   * CSS variables, falling back to `ui/input`'s 12 px) for unconverted hosts.
   */
  className?: string;
}

/**
 * What the old overlay read from a Joy `Input` (its padding and placeholder
 * colour), each with `ui/input`'s value as the fallback. Dropped as soon as a
 * converted host passes `className`.
 */
const JOY_INPUT_HOST = {
  paddingLeft:
    "calc(var(--Input-paddingInline, 12px) + var(--Input-decoratorChildHeight, 0px) + var(--Input-gap, 0px))",
  paddingRight: "var(--Input-paddingInline, 12px)",
  color: "var(--Input-placeholderColor, var(--color-muted-foreground))",
} as const;

export function AnimatedPlaceholder({
  examples,
  enabled = true,
  holdDuration = 3000,
  className,
}: AnimatedPlaceholderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled || examples.length <= 1 || prefersReducedMotion) {
      return;
    }

    // Reset to first example when re-enabled
    setCurrentIndex(0);

    const advance = () => {
      setCurrentIndex((prev) => (prev + 1) % examples.length);
      timerRef.current = setTimeout(advance, holdDuration);
    };

    timerRef.current = setTimeout(advance, holdDuration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, examples, holdDuration, prefersReducedMotion]);

  if (!enabled || examples.length === 0) {
    return null;
  }

  const text = examples[currentIndex] ?? examples[0];
  const enter = tween("medium");
  const leave = { ...enter, duration: exitOf(enter.duration) };

  return (
    <div
      data-slot="animated-placeholder"
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center overflow-hidden text-muted-foreground",
        className,
      )}
      style={className === undefined ? JOY_INPUT_HOST : undefined}
    >
      {/* `initial={false}`: the first example is there at first paint
          (visible at rest, and the same markup on server and client); only
          the swaps animate. Under reduced motion the root MotionConfig drops
          the slide and keeps the fade, and the effect above stops cycling. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentIndex}
          initial={{ opacity: 0, y: distance.list }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -distance.list, transition: leave }}
          transition={enter}
          className="w-full truncate"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
