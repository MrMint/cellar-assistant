"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * `false` for the server's render and the hydration pass, `true` from the
 * first effect on.
 *
 * The discovery cards' framer-motion entrances (`initial="hidden"`) would
 * otherwise server-render `opacity:0` and depend on hydration to show the
 * content at all — the defect `./AnimateIn.tsx` fixes for the hero. With
 * this, the first paint is the at-rest state and a later mount (a filter
 * change re-keys the grid) still animates as it did.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

/**
 * motion's `useReducedMotion`, held at `false` until hydration is done.
 *
 * motion reads the media query on the browser's very first render, while the
 * server always reads `null`. A component that picks its variants from it
 * would then hydrate with different markup for a reduced-motion viewer:
 * the server writes the `show` variant's `opacity:1;transform:none`, the
 * browser's first pass (no variants) writes no style at all. Holding the
 * answer until the first effect keeps the hydration pass identical to the
 * server's; the setting applies from then on, before any entrance can play
 * (entrances only run on a later mount — see {@link useHasMounted}).
 */
export function useHydratedReducedMotion(): boolean {
  const mounted = useHasMounted();
  const reduce = useReducedMotion();
  return mounted && reduce === true;
}
