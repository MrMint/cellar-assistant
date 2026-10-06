import { Box } from "@mui/joy";
import type { ReactNode } from "react";

/**
 * `82450ad1:src/components/search/AnimateIn.tsx` — the same entrance, done in
 * CSS so the content is **visible at rest without JavaScript**.
 *
 * The old wrappers were framer-motion `motion.div`s with `initial="hidden"`,
 * which server-render `style="opacity:0;transform:translateY(10px)"` and rely
 * on hydration to animate it away. Until then — a slow bundle, a stalled
 * hydration, a tab opened in the background — the greeting, the quick-link
 * chips and the collection line were invisible, and stayed so if hydration
 * never finished.
 *
 * Here the markup carries no hidden state at all; a CSS animation plays the
 * old variants (`fadeUp`: opacity 0 → 1, 10px → 0, 0.25s ease-out; the
 * container's `staggerChildren: 0.04` / `delayChildren: 0.03`) and ends on the
 * element's own, visible style. It runs from the first paint, needs no
 * hydration, and `prefers-reduced-motion: reduce` turns it off.
 */

interface AnimateInProps {
  children: ReactNode;
  className?: string;
}

/** `fadeUp`'s duration and easing. */
const FADE_UP = "searchFadeUp 0.25s ease-out both";

const fadeUpKeyframes = {
  "@keyframes searchFadeUp": {
    from: { opacity: 0, transform: "translateY(10px)" },
    to: { opacity: 1, transform: "none" },
  },
};

const reducedMotion = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
};

/** `staggerContainer`'s timing, for the first {@link STAGGER_SLOTS} items. */
const STAGGER_DELAY_S = 0.03;
const STAGGER_STEP_S = 0.04;
const STAGGER_SLOTS = 12;

const staggerDelays = Object.fromEntries(
  Array.from({ length: STAGGER_SLOTS }, (_, index) => [
    `& [data-stagger-item]:nth-of-type(${index + 1})`,
    {
      animationDelay: `${(STAGGER_DELAY_S + index * STAGGER_STEP_S).toFixed(2)}s`,
    },
  ]),
);

/**
 * Fade-up entrance for a single element.
 * Wraps server components to add the animation.
 */
export function FadeIn({ children, className }: AnimateInProps) {
  return (
    <Box
      className={className}
      sx={{ ...fadeUpKeyframes, animation: FADE_UP, ...reducedMotion }}
    >
      {children}
    </Box>
  );
}

/**
 * Stagger container — staggers its StaggerItem children.
 */
export function StaggerIn({ children, className }: AnimateInProps) {
  return (
    <Box className={className} sx={{ ...fadeUpKeyframes, ...staggerDelays }}>
      {children}
    </Box>
  );
}

/**
 * Child of StaggerIn — participates in the stagger sequence.
 */
export function StaggerItem({ children }: { children: ReactNode }) {
  return (
    <Box
      data-stagger-item=""
      sx={{ ...fadeUpKeyframes, animation: FADE_UP, ...reducedMotion }}
    >
      {children}
    </Box>
  );
}
