/**
 * Motion tokens (design-direction.md §4.2). The only place a spring, a
 * duration or an easing curve is written as a number; the `ui-platform` guard
 * fails on literals anywhere else. `globals.css` mirrors the durations and
 * curves as `--ca-dur-*` / `--ca-ease-*` for CSS transitions
 * (`tokens-parity.test.ts` keeps them equal).
 *
 * Reduced motion is handled once, by `<MotionConfig reducedMotion="user">` in
 * `AppClientProviders`; components that need to branch use motion's
 * `useReducedMotion`, never their own `matchMedia`.
 */
import { durationMs, easing } from "./tokens";

/** Durations in seconds (motion's unit). */
export const dur = {
  micro: durationMs.micro / 1000,
  short: durationMs.short / 1000,
  medium: durationMs.medium / 1000,
  long: durationMs.long / 1000,
  /** Total budget for a success moment (§5): 700 ms or less. */
  celebrate: 0.7,
} as const;

/** Cubic-bézier control points, as motion's `ease` takes them. */
export const ease = {
  standard: [...easing.standard] as [number, number, number, number],
  enter: [...easing.enter] as [number, number, number, number],
  exit: [...easing.exit] as [number, number, number, number],
} as const;

export const spring = {
  /** Reflow, toggles, drop. */
  snappy: { type: "spring", stiffness: 520, damping: 42 },
  /** Sheets (pass the release velocity). */
  sheet: { type: "spring", stiffness: 380, damping: 36 },
  /** Pops, stamps, the heart. */
  celebrate: { type: "spring", stiffness: 300, damping: 18 },
} as const;

/** Distances: px for translations, factors for scale. */
export const distance = {
  route: 60,
  list: 8,
  press: 0.97,
  lift: 1.03,
} as const;

/** An exit runs about two thirds of its enter. */
export const exitOf = (seconds: number): number => seconds * (2 / 3);

/** A tween on the standard curve, e.g. `transition={tween("short")}`. */
export const tween = (
  d: keyof typeof dur,
  curve: keyof typeof ease = "standard",
) => ({ duration: dur[d], ease: ease[curve] });
