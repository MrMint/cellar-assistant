"use client";

import { useEffect, useState } from "react";

/**
 * How far an element sits from the viewport's left and bottom edges.
 *
 * The map's fixed panels (the place drawer, the search results) are placed
 * against the viewport, but they belong beside the side rail and above the
 * tab bar — whose sizes are the shell's, not the map's (the old nav was a
 * 56 px rail and a 50 px bar; the new `SideRail` is 80 px, the `TabBar`
 * 49 px plus the home-indicator inset). Measuring the map's own box gives
 * both without hard-coding either shell.
 */
export type ViewportInsets = { left: number; bottom: number };

export const measureInsets = (
  rect: Pick<DOMRect, "left" | "bottom">,
  viewportHeight: number,
): ViewportInsets => ({
  left: Math.max(0, Math.round(rect.left)),
  bottom: Math.max(0, Math.round(viewportHeight - rect.bottom)),
});

/** Pass the element itself (a callback ref's state), so a late mount is seen. */
export function useViewportInsets(
  element: HTMLElement | null,
): ViewportInsets | null {
  const [insets, setInsets] = useState<ViewportInsets | null>(null);

  useEffect(() => {
    if (!element) return;

    const update = () => {
      const next = measureInsets(
        element.getBoundingClientRect(),
        window.innerHeight,
      );
      setInsets((current) =>
        current && current.left === next.left && current.bottom === next.bottom
          ? current
          : next,
      );
    };

    update();
    window.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [element]);

  return insets;
}
