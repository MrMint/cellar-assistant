"use client";

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
