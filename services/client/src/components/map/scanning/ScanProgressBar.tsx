"use client";

import { motion, useReducedMotion } from "motion/react";
import { tween } from "@/lib/motion";

/**
 * An indeterminate bar for the menu scan (Joy's `LinearProgress` without a
 * value). Reading and matching a menu is AI work, so it runs in the AI teal.
 *
 * Under reduced motion the sweep does not run, and the segment is drawn
 * still in the middle of the track: the root `MotionConfig` alone would
 * leave it parked at its start, `-100%`, i.e. off the track entirely, and
 * the bar would read as empty.
 */
export function ScanProgressBar({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-busy
      className="relative h-1 w-full overflow-hidden rounded-full bg-ai/20"
    >
      {reduceMotion ? (
        <div className="absolute inset-y-0 left-1/3 w-1/3 rounded-full bg-ai" />
      ) : (
        <motion.div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-ai"
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{
            ...tween("long", "standard"),
            repeat: Number.POSITIVE_INFINITY,
            repeatDelay: tween("short").duration,
          }}
        />
      )}
    </div>
  );
}
