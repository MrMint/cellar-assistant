import type { Variants } from "framer-motion";

/**
 * Container variant that staggers its children.
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.03,
    },
  },
};

/**
 * Faster stagger for grids with many items.
 */
export const staggerContainerFast: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
};

/**
 * Child variant: fade up from below.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

/**
 * Child variant: slide in from the left with fade.
 * Used for staggered card lists (activity feed, nearby places).
 */
export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

/**
 * Child variant: fade in with a subtle scale pop.
 */
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
};

/**
 * Modal/card expand transition.
 */
export const modalScale: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.12, ease: "easeIn" },
  },
};
