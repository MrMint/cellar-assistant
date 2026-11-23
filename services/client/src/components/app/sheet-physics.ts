/**
 * The pure maths behind `BottomSheet`'s physics (ux-c B04, design §4.6, §4.9).
 * vaul moves the sheet; these decide what vaul cannot: where a release with
 * velocity lands, how far an end stretches, and whether a drag belongs to the
 * sheet or to the list inside it. No DOM, no React: `useSheetDrag` feeds them
 * pointer samples and the sheet's measurements, and the tests feed them
 * numbers.
 *
 * Coordinates are vaul's: a sheet's position is its `translateY` in px, 0 when
 * it rests fully open and growing as it moves down. Velocity is px/ms,
 * positive downward.
 */

/**
 * A release at or above this speed is a fling: it always travels at least to
 * the next snap point in its direction. vaul's own `VELOCITY_THRESHOLD`, kept
 * equal so the two engines agree on what a flick is.
 */
export const FLING_VELOCITY = 0.4;

/**
 * How far ahead a release is projected, in ms of its own velocity, before the
 * nearest snap point is chosen. A plain "nearest to where the finger let go"
 * ignores the throw; UIKit's full deceleration projection (≈ 500 ms) throws a
 * sheet two snaps on an ordinary flick. 200 ms lands one snap per flick.
 */
export const PROJECTION_MS = 200;

/** How long a pointer sample stays in the release-velocity window. */
export const VELOCITY_WINDOW_MS = 100;

/** UIKit's scroll-view rubber-band coefficient. */
export const RUBBER_BAND_COEFFICIENT = 0.55;

/** vaul's snap fractions → the sheet's `translateY` at each, in px. */
export function snapOffsets(
  fractions: readonly number[],
  viewport: number,
): number[] {
  return fractions.map((fraction) => (1 - fraction) * viewport);
}

export type PointerSample = { readonly t: number; readonly y: number };

/**
 * The speed at release, from the samples of the last `VELOCITY_WINDOW_MS`.
 * Not vaul's average over the whole drag: a slow drag that ends in a flick is
 * a flick, and a fast drag that stops before letting go is not.
 */
export function releaseVelocity(
  samples: readonly PointerSample[],
  windowMs: number = VELOCITY_WINDOW_MS,
): number {
  const last = samples.at(-1);
  if (last === undefined) return 0;
  const first = samples.find((sample) => last.t - sample.t <= windowMs) ?? last;
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (last.y - first.y) / dt;
}

export type SnapDecision =
  | { readonly kind: "snap"; readonly index: number }
  | { readonly kind: "dismiss" };

export type ResolveSnapInput = {
  /** `translateY` of each snap point, in the order of `snapPoints`. */
  readonly offsets: readonly number[];
  /** Where the sheet is when the finger lifts. */
  readonly position: number;
  /** Release velocity, px/ms, positive downward. */
  readonly velocity: number;
  readonly dismissible: boolean;
  /** `translateY` at which the sheet is gone: the viewport height. */
  readonly closedOffset: number;
};

/**
 * Where a released sheet comes to rest. The position is projected along its
 * velocity and the nearest stop wins; a fling (`FLING_VELOCITY` or faster)
 * always reaches at least the next stop in its direction, so a short flick
 * from `half` still lands on `full`. "Closed" is a stop only for a
 * dismissible sheet.
 */
export function resolveSnap({
  offsets,
  position,
  velocity,
  dismissible,
  closedOffset,
}: ResolveSnapInput): SnapDecision {
  type Stop = { readonly at: number; readonly decision: SnapDecision };
  const stops: Stop[] = offsets.map((at, index) => ({
    at,
    decision: { kind: "snap", index },
  }));
  if (dismissible)
    stops.push({ at: closedOffset, decision: { kind: "dismiss" } });
  if (stops.length === 0) return { kind: "dismiss" };

  const projected = position + velocity * PROJECTION_MS;
  const nearestTo = (target: number, among: readonly Stop[]): Stop =>
    among.reduce((best, stop) =>
      Math.abs(stop.at - target) < Math.abs(best.at - target) ? stop : best,
    );
  let chosen = nearestTo(projected, stops);

  if (Math.abs(velocity) >= FLING_VELOCITY) {
    const down = velocity > 0;
    const ahead = stops.filter((stop) =>
      down ? stop.at > position : stop.at < position,
    );
    const beyond = down ? chosen.at > position : chosen.at < position;
    if (!beyond && ahead.length > 0) chosen = nearestTo(position, ahead);
  }
  return chosen.decision;
}

/**
 * The stretch past an end: `overshoot` px of finger travel shows as this many
 * px of sheet travel. Linear at first, then ever stiffer, never more than
 * `dimension`. The sign follows the overshoot.
 */
export function rubberBand(
  overshoot: number,
  dimension: number,
  coefficient: number = RUBBER_BAND_COEFFICIENT,
): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const magnitude = Math.abs(overshoot);
  const stretched =
    (1 - 1 / ((magnitude * coefficient) / dimension + 1)) * dimension;
  return Math.sign(overshoot) * stretched;
}

export type OvershootInput = {
  /** The sheet's `translateY` at the start of the drag. */
  readonly start: number;
  /** Finger travel since the drag began, px, positive downward. */
  readonly dragged: number;
  /** The highest the sheet may rest (the top snap; 0 without snaps). */
  readonly top: number;
  /**
   * The lowest it may rest: the first snap (0 without snaps) for a sheet that
   * cannot be dismissed; `Infinity` for one that can, since past its lowest
   * stop it closes rather than stretches.
   */
  readonly bottom: number;
};

/**
 * How far the finger has gone past an end the sheet cannot travel beyond:
 * negative above the top, positive below the bottom, 0 in between.
 */
export function overshoot({
  start,
  dragged,
  top,
  bottom,
}: OvershootInput): number {
  const target = start + dragged;
  if (target < top) return target - top;
  if (target > bottom) return target - bottom;
  return 0;
}

export type ScrollMetrics = {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

/**
 * Who a drag belongs to: the content while it can still scroll the way the
 * finger is going, the sheet once it cannot. A finger moving down scrolls
 * the list towards its top, so at `scrollTop` 0 a downward drag moves the
 * sheet; a finger moving up moves the sheet only once the list is at its end.
 * `dy` is the first movement, positive downward; `null` metrics mean nothing
 * under the finger scrolls.
 */
export function dragOwner(
  dy: number,
  metrics: ScrollMetrics | null,
): "content" | "sheet" {
  if (metrics === null || dy === 0) return "sheet";
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  if (scrollHeight <= clientHeight) return "sheet";
  if (dy > 0) return scrollTop > 0 ? "content" : "sheet";
  // One px of slack: fractional layouts leave scrollTop a hair short of the end.
  return scrollTop < scrollHeight - clientHeight - 1 ? "content" : "sheet";
}

/** vaul's open, close and snap transitions: 0.5 s (`TRANSITIONS.DURATION`). */
export const VAUL_SETTLE_MS = 500;

/**
 * How long until a sheet has settled after a snap or open. Under reduced
 * motion `globals.css` takes vaul's transitions to 0 s, so it settles at once
 * (design §4.9: instant snaps).
 */
export function settleMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : VAUL_SETTLE_MS;
}

/** The `translateY` in a `translate3d(0, Ypx, 0)` that vaul writes, or `null`. */
export function translateYOf(transform: string): number | null {
  const match = /translate3d\(\s*[^,]+,\s*(-?[\d.]+)px/.exec(transform);
  if (match === null) {
    const plain = /translateY\(\s*(-?[\d.]+)px/.exec(transform);
    return plain === null ? null : Number(plain[1]);
  }
  return Number(match[1]);
}
