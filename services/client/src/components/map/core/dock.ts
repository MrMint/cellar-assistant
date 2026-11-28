import { gesture } from "@/lib/motion";

/**
 * The map's dock (Map board): the sheet that rests over the lower part of
 * the map, at three heights. Peek is the search row alone (the map almost
 * full screen); rest shows two and a half rows of the list (40e), so the
 * half row says "there is more"; full keeps a strip of map above it.
 */
export type DockDetent = "peek" | "rest" | "full";

/** The grabber's 44 target (less 8 of overlap) + the search row (44) + 12. */
export const DOCK_PEEK_PX = 92;
/** Peek + the chip row (56) + "In view" (40) + 2.5 rows of 64. */
export const DOCK_REST_PX = 348;
/** The map left showing above a full dock. */
export const DOCK_MAP_STRIP_PX = 56;

export function dockHeights(mapHeight: number): Record<DockDetent, number> {
  const full = Math.max(DOCK_PEEK_PX, mapHeight - DOCK_MAP_STRIP_PX);
  const rest = Math.min(DOCK_REST_PX, Math.round(mapHeight * 0.6), full);
  return { peek: DOCK_PEEK_PX, rest, full };
}

const ORDER: readonly DockDetent[] = ["peek", "rest", "full"];

/**
 * Where a released dock settles: the detent nearest the height projected
 * `gesture.projectMs` ahead (the release velocity, capped, in px/s with
 * down positive), so a fling carries past the next detent.
 */
export function dockRelease(
  height: number,
  velocityY: number,
  heights: Record<DockDetent, number>,
): DockDetent {
  const vmax = gesture.vmaxPxPerMs * 1000;
  const v = Math.max(-vmax, Math.min(vmax, velocityY));
  const projected = height - (v * gesture.projectMs) / 1000;
  let best: DockDetent = "rest";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const detent of ORDER) {
    const d = Math.abs(heights[detent] - projected);
    if (d < bestDistance) {
      best = detent;
      bestDistance = d;
    }
  }
  return best;
}
