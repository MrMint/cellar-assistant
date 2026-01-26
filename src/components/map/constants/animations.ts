/**
 * Shared animation constants for map components
 * Centralized Framer Motion configurations to avoid duplication
 */

import type { AnimationTransition, AnimationVariants } from "../types";

// Default marker animation variants
export const MARKER_ANIMATION_VARIANTS: AnimationVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
  },
};

// Default transition configuration
export const MARKER_ANIMATION_TRANSITION: AnimationTransition = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1] as const,
};

// Specialized animation variants for different marker types
export const CLUSTER_ANIMATION_VARIANTS: AnimationVariants = {
  hidden: {
    opacity: 0,
    scale: 0.6,
  },
  visible: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.6,
  },
};

export const PLACE_ANIMATION_VARIANTS: AnimationVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
  },
};

// Hover animation configurations
export const HOVER_SCALE = 1.1;
export const HOVER_TRANSITION = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const,
};
