import type { Variants } from "motion/react";
import { distance, tween } from "@/lib/motion";

/**
 * The search page's motion, on the `@/lib/motion` tokens. It replaces
 * `./motion-variants.ts` (framer-motion era: literal 0.25 s / 0.12 s tweens,
 * `easeOut` / `easeIn`), which nothing imports any more:
 *
 * - enters run `dur.medium` on `ease.enter` (was 0.20–0.25 s ease-out);
 * - exits run `dur.short` on `ease.exit`, two thirds of the enter (was
 *   0.12 s ease-in);
 * - the list entrance slides `distance.list` (8 px; was 12) and the card
 *   expand scales from `distance.press` (.97, unchanged).
 *
 * The stagger steps are not motion tokens — a cadence, not a duration —
 * and stay the old values.
 */

/** Seconds between staggered children, and before the first. */
export const STAGGER = {
  /** The landing hero's quick links (`AnimateIn`'s `StaggerIn`). */
  step: 0.04,
  delay: 0.03,
  /** The discovery grids, which can hold more cards. */
  stepFast: 0.03,
  delayFast: 0.02,
} as const;

/** Grid container: staggers its children in, fades out as a whole. */
export const staggerContainerFast: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: STAGGER.stepFast,
      delayChildren: STAGGER.delayFast,
    },
  },
  exit: { opacity: 0, transition: tween("short", "exit") },
};

/** A card in a staggered list (activity feed, nearby places). */
export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -distance.list },
  show: { opacity: 1, x: 0, transition: tween("medium", "enter") },
  exit: { opacity: 0, transition: tween("short", "exit") },
};

/** The search box ⇄ scanner / camera card swap. */
export const modalScale: Variants = {
  initial: { opacity: 0, scale: distance.press },
  animate: { opacity: 1, scale: 1, transition: tween("medium", "enter") },
  exit: {
    opacity: 0,
    scale: distance.press,
    transition: tween("short", "exit"),
  },
};

/** A list's empty line crossfading in and out. */
export const fadeShort = tween("short");
