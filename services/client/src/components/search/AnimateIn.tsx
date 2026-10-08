import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAGGER } from "./search-motion";

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
 * Here the markup carries no hidden state at all: `tw-animate-css`'s
 * `animate-in` plays the old `fadeUp` (opacity 0 → 1, a short rise) on the
 * motion tokens (`--ca-dur-medium`, the enter curve, the 8 px list distance) and ends on the
 * element's own, visible style. It runs from the first paint and needs no
 * hydration. Under reduced motion `globals.css` drops the slide and keeps
 * the fade (design §4.9).
 */

interface AnimateInProps {
  children: ReactNode;
  className?: string;
}

/** `fadeUp`: an 8 px rise (`distance.list`; was 10) and a fade. */
const FADE_UP =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-(--ca-dur-medium) ease-enter";

/**
 * Fade-up entrance for a single element.
 * Wraps server components to add the animation.
 */
export function FadeIn({ children, className }: AnimateInProps) {
  return <div className={cn(FADE_UP, className)}>{children}</div>;
}

/**
 * Stagger container — its {@link StaggerItem}s enter one after another.
 */
export function StaggerIn({ children, className }: AnimateInProps) {
  return <div className={className}>{children}</div>;
}

/**
 * Child of StaggerIn — participates in the stagger sequence: item `index`
 * starts `STAGGER.delay + index × STAGGER.step` seconds in, the old
 * `staggerContainer`'s timing.
 */
export function StaggerItem({
  children,
  index = 0,
}: {
  children: ReactNode;
  /** The item's position in the sequence (0-based). */
  index?: number;
}) {
  const delay = STAGGER.delay + index * STAGGER.step;
  return (
    <div
      data-stagger-item=""
      className={FADE_UP}
      // Computed per item at render: the one value here that is not a class.
      style={{ animationDelay: `${delay.toFixed(2)}s` }}
    >
      {children}
    </div>
  );
}
