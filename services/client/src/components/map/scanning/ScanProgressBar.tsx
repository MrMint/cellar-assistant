"use client";

import { motion } from "motion/react";
import { tween } from "@/lib/motion";

/**
 * An indeterminate bar for the menu scan (Joy's `LinearProgress` without a
 * value). Reading and matching a menu is AI work, so it runs in the AI teal.
 * Under reduced motion the root `MotionConfig` holds the sweep still.
 */
export function ScanProgressBar({ label }: { label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-busy
      className="relative h-1 w-full overflow-hidden rounded-full bg-ai/20"
    >
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
    </div>
  );
}
