"use client";

import { animate } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { feedback } from "@/lib/feedback";
import { gesture, refreshMs, spring, tween } from "@/lib/motion";

/**
 * The installed app's own gestures (SPEC movements 5 and 15, § Gestures;
 * "Native, PWA and fallbacks"): in a Safari tab the browser owns the left
 * edge and the pull at the top, so both run only standalone. Everywhere else
 * Back and the browser's own refresh do the job.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (navigator as { standalone?: boolean }).standalone === true;
  return (
    ios ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  );
}

/** Whether a touch at `x` starts an edge swipe (within 20 px of the left). */
export const startsEdgeSwipe = (x: number): boolean => x <= gesture.edgePx;

/**
 * Where an edge swipe lands: back past 35 % of the width or on a fling to
 * the right (`vx` px/ms, capped at 5), else it springs home.
 */
export function edgeRelease(
  dx: number,
  vx: number,
  width: number,
): "back" | "stay" {
  const v = Math.min(vx, gesture.vmaxPxPerMs);
  if (dx <= 0) return "stay";
  return dx > width * gesture.backAt || v > gesture.flingPxPerMs
    ? "back"
    : "stay";
}

/** How far the list follows a pull of `dy` px: half, never above. */
export const pullDistance = (dy: number): number =>
  Math.max(0, dy) * gesture.pullK;

/** Whether a pull of `dy` has armed the refresh (64 px of travel shown). */
export const pullArmed = (dy: number): boolean =>
  pullDistance(dy) >= gesture.pullPx;

type Track = { x: number; y: number; t: number; claimed: boolean };

/** px/ms between two samples of a drag. */
const velocity = (from: Track, to: Track): number =>
  (to.x - from.x) / Math.max(1, to.t - from.t);

/**
 * Edge swipe back (movement 5): a touch from the left 20 px drags `target`
 * with the finger, and a release past 35 % or a fling goes back. Gesture
 * motion follows the finger, so reduced motion changes only the settle (a
 * 120 fade instead of the spring home).
 */
export function useEdgeSwipeBack(
  target: RefObject<HTMLElement | null>,
  { enabled, onBack }: { enabled: boolean; onBack: () => void },
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const el = target.current;
    if (!enabled || el === null || !isStandalone()) return;
    let start: Track | null = null;
    let prev: Track | null = null;
    let last: Track | null = null;
    let dx = 0;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch === undefined) return;
      if (!startsEdgeSwipe(touch.clientX)) return;
      start = {
        x: touch.clientX,
        y: touch.clientY,
        t: event.timeStamp,
        claimed: false,
      };
      prev = start;
      last = start;
      dx = 0;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (start === null || touch === undefined) return;
      const mx = touch.clientX - start.x;
      const my = touch.clientY - start.y;
      if (!start.claimed) {
        if (Math.hypot(mx, my) < gesture.claimPx) return;
        // Axis lock on the first claim: a vertical start is the list's.
        if (Math.abs(my) > Math.abs(mx)) {
          start = null;
          return;
        }
        start.claimed = true;
      }
      event.preventDefault();
      dx = Math.max(0, mx);
      el.style.transform = `translateX(${dx}px)`;
      prev = last;
      last = {
        x: touch.clientX,
        y: touch.clientY,
        t: event.timeStamp,
        claimed: true,
      };
    };
    const onEnd = () => {
      if (start === null || !start.claimed || last === null || prev === null) {
        start = null;
        return;
      }
      const result = edgeRelease(dx, velocity(prev, last), el.clientWidth);
      start = null;
      if (result === "back") {
        feedback("tick");
        el.style.transform = "";
        onBackRef.current();
        return;
      }
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      animate(dx, 0, {
        ...(reduced ? tween("micro") : spring.snappy),
        onUpdate: (x) => {
          el.style.transform = `translateX(${x}px)`;
        },
        onComplete: () => {
          el.style.transform = "";
        },
      });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.style.transform = "";
    };
  }, [target, enabled]);
}

export type PullState = {
  /** px the content has followed the finger (0 at rest). */
  pull: number;
  armed: boolean;
  refreshing: boolean;
};

/**
 * Pull to refresh (movement 15): at the top of `scroller`, a downward pull
 * moves the content at half the finger, arms at 64 px with the detent, and
 * on release holds there at least 900 ms while `onRefresh` runs, then ends
 * with the success cue and springs back.
 */
export function usePullToRefresh(
  scroller: RefObject<HTMLElement | null>,
  {
    enabled,
    onRefresh,
  }: { enabled: boolean; onRefresh: () => Promise<unknown> | undefined },
): PullState {
  const [state, setState] = useState<PullState>({
    pull: 0,
    armed: false,
    refreshing: false,
  });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scroller.current;
    if (!enabled || el === null || !isStandalone()) return;
    let startY: number | null = null;
    let claimed = false;
    let armed = false;
    let busy = false;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (busy || event.touches.length !== 1 || touch === undefined) return;
      if (el.scrollTop > 0) return;
      startY = touch.clientY;
      claimed = false;
      armed = false;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (startY === null || touch === undefined) return;
      const dy = touch.clientY - startY;
      if (!claimed) {
        if (dy < gesture.claimPx) {
          if (dy < 0) startY = null;
          return;
        }
        claimed = true;
      }
      event.preventDefault();
      const nowArmed = pullArmed(dy);
      if (nowArmed && !armed) feedback("detent");
      armed = nowArmed;
      setState({ pull: pullDistance(dy), armed, refreshing: false });
    };
    const onEnd = () => {
      if (startY === null || !claimed) {
        startY = null;
        return;
      }
      startY = null;
      if (!armed) {
        setState({ pull: 0, armed: false, refreshing: false });
        return;
      }
      busy = true;
      setState({ pull: gesture.pullPx, armed: true, refreshing: true });
      const held = new Promise((r) => window.setTimeout(r, refreshMs));
      Promise.all([Promise.resolve(onRefreshRef.current()), held])
        .then(() => feedback("success"))
        .catch(() => feedback("refuse"))
        .finally(() => {
          busy = false;
          setState({ pull: 0, armed: false, refreshing: false });
        });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scroller, enabled]);

  return state;
}
