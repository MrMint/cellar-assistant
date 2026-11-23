"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { spring } from "@/lib/motion";
import {
  dragOwner,
  overshoot,
  type PointerSample,
  releaseVelocity,
  resolveSnap,
  rubberBand,
  type ScrollMetrics,
  type SnapDecision,
  snapOffsets,
  translateYOf,
  VELOCITY_WINDOW_MS,
} from "./sheet-physics";

/** vaul's class on the drawer while it is following the finger. */
const VAUL_DRAGGING = "vaul-dragging";
/** Finger travel before a gesture is given an owner (a tap is not a drag). */
const SLOP_PX = 3;

type UseSheetDragOptions = {
  readonly open: boolean;
  readonly nodeRef: { readonly current: HTMLElement | null };
  /** vaul's snap fractions, or `undefined` for a content-sized sheet. */
  readonly fractions: readonly number[] | undefined;
  /** The fraction the sheet rests at now (`null` before vaul has one). */
  readonly activeFraction: number | null;
  readonly dismissible: boolean;
  /**
   * Where a released snapping sheet should land, decided from the release
   * velocity. Called during the `pointerup`, before vaul's own handler, so
   * `BottomSheet` can correct vaul's choice as vaul makes it.
   */
  readonly onRelease: (decision: SnapDecision) => void;
};

/** The nearest element from `target` up to `root` that scrolls vertically. */
function scrollerOf(target: Element, root: HTMLElement): ScrollMetrics | null {
  let el: Element | null = target;
  while (el !== null && el !== root.parentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        return {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        };
      }
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * The physics vaul lacks, added around it (L21): the sheet stretches past the
 * ends vaul hard-stops at, and a snapping sheet's release lands by its
 * release velocity rather than vaul's whole-drag average.
 *
 * The stretch is written to the CSS `translate` property, which composes with
 * the `transform` vaul owns rather than fighting it, so it is still
 * transform-only. It springs back with motion when the finger lifts, and
 * snaps back at once under reduced motion. A drag the content can still
 * scroll belongs to the content (`dragOwner`), so a list scrolls and never
 * stretches the sheet.
 */
export function useSheetDrag({
  open,
  nodeRef,
  fractions,
  activeFraction,
  dismissible,
  onRelease,
}: UseSheetDragOptions): void {
  const reducedMotion = useReducedMotion() ?? false;
  const latest = useRef({ fractions, activeFraction, dismissible, onRelease });
  latest.current = { fractions, activeFraction, dismissible, onRelease };

  useEffect(() => {
    if (!open) return;
    let node: HTMLElement | null = null;
    let gesture: {
      pointerId: number;
      startY: number;
      samples: PointerSample[];
      metrics: ScrollMetrics | null;
      owner: "content" | "sheet" | null;
      band: number;
    } | null = null;
    let frame = 0;
    let settle: { stop: () => void } | null = null;

    const setBand = (px: number) => {
      if (node === null) return;
      node.style.translate = px === 0 ? "" : `0 ${px}px`;
    };

    const bounds = () => {
      const { fractions: snaps, activeFraction: active } = latest.current;
      const viewport = window.innerHeight;
      if (snaps === undefined || snaps.length === 0) {
        return { start: 0, top: 0, bottom: 0, offsets: null, viewport };
      }
      const offsets = snapOffsets(snaps, viewport);
      const activeIndex = active === null ? 0 : snaps.indexOf(active);
      return {
        start: offsets[Math.max(activeIndex, 0)] ?? 0,
        top: Math.min(...offsets),
        bottom: Math.max(...offsets),
        offsets,
        viewport,
      };
    };

    const onDown = (event: PointerEvent) => {
      if (node === null || !event.isPrimary || event.button > 0) return;
      if (!(event.target instanceof Element)) return;
      settle?.stop();
      settle = null;
      setBand(0);
      gesture = {
        pointerId: event.pointerId,
        startY: event.clientY,
        samples: [{ t: event.timeStamp, y: event.clientY }],
        metrics: scrollerOf(event.target, node),
        owner: null,
        band: 0,
      };
    };

    const onMove = (event: PointerEvent) => {
      const g = gesture;
      if (g === null || event.pointerId !== g.pointerId) return;
      g.samples.push({ t: event.timeStamp, y: event.clientY });
      while (
        g.samples.length > 2 &&
        event.timeStamp - (g.samples[0]?.t ?? 0) > VELOCITY_WINDOW_MS * 2
      ) {
        g.samples.shift();
      }
      const dragged = event.clientY - g.startY;
      if (g.owner === null) {
        if (Math.abs(dragged) < SLOP_PX) return;
        g.owner = dragOwner(dragged, g.metrics);
      }
      if (g.owner !== "sheet") return;
      cancelAnimationFrame(frame);
      // After vaul's own pointermove (React's, at the root) has run.
      frame = requestAnimationFrame(() => {
        if (node === null || gesture !== g) return;
        const { start, top, bottom, offsets, viewport } = bounds();
        // Without snaps, vaul stretches an upward drag itself once it is
        // dragging; only the ends it never moves at are ours.
        if (offsets === null && node.classList.contains(VAUL_DRAGGING)) {
          g.band = 0;
          setBand(0);
          return;
        }
        const past = overshoot({
          start,
          dragged,
          top,
          bottom: latest.current.dismissible
            ? Number.POSITIVE_INFINITY
            : bottom,
        });
        g.band = rubberBand(past, viewport);
        setBand(g.band);
      });
    };

    const onUp = (event: PointerEvent) => {
      const g = gesture;
      if (g === null || event.pointerId !== g.pointerId) return;
      gesture = null;
      cancelAnimationFrame(frame);
      g.samples.push({ t: event.timeStamp, y: event.clientY });

      const { offsets, viewport } = bounds();
      if (
        event.type === "pointerup" &&
        g.owner === "sheet" &&
        offsets !== null &&
        node !== null
      ) {
        const position =
          translateYOf(node.style.transform) ??
          bounds().start + event.clientY - g.startY;
        latest.current.onRelease(
          resolveSnap({
            offsets,
            position,
            velocity: releaseVelocity(g.samples),
            dismissible: latest.current.dismissible,
            closedOffset: viewport,
          }),
        );
      }

      if (g.band === 0) return;
      if (reducedMotion) {
        setBand(0);
        return;
      }
      settle = animate(g.band, 0, {
        ...spring.sheet,
        onUpdate: setBand,
        onComplete: () => setBand(0),
      });
    };

    const listen = (): boolean => {
      if (node !== null) return true;
      node = nodeRef.current;
      if (node === null) return false;
      node.addEventListener("pointerdown", onDown);
      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
      node.addEventListener("pointercancel", onUp);
      return true;
    };
    // The content is usually mounted by now; if vaul's portal has not put it
    // there yet, try again on the next frame.
    const attach = listen() ? 0 : requestAnimationFrame(listen);

    return () => {
      cancelAnimationFrame(attach);
      cancelAnimationFrame(frame);
      settle?.stop();
      if (node !== null) {
        node.removeEventListener("pointerdown", onDown);
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        node.removeEventListener("pointercancel", onUp);
        node.style.translate = "";
      }
    };
  }, [open, nodeRef, reducedMotion]);
}
