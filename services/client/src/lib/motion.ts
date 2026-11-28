/**
 * Motion tokens (`motion/SPEC.md` § Tokens and § Gestures, design-direction.md
 * §4.2). The only place a spring, a duration, an easing curve or a gesture
 * threshold is written as a number; the `ui-platform` guard fails on literals
 * anywhere else. `globals.css` mirrors the durations and curves as
 * `--ca-dur-*` / `--ca-ease-*` for CSS transitions (`tokens-parity.test.ts`
 * keeps them equal).
 *
 * Units: motion takes seconds, so `dur`, `calm` and `stagger.each` are in
 * seconds. Gesture and timing thresholds are read by hand-written code, so
 * they carry their unit in their name (`…Px`, `…Ms`, `…PxPerMs`); a bare
 * fraction (`backAt`, `rubber`) is a share of a width, a height or a distance.
 *
 * Reduced motion is handled once, by `<MotionConfig reducedMotion="user">` in
 * `AppClientProviders`; components that need to branch use motion's
 * `useReducedMotion`, never their own `matchMedia`, and take their replacement
 * from `reduced` (the default: a cross-fade at micro) or `calm` (the two
 * movements SPEC gives a longer one). Haptics and sound are not motion: their
 * vocabulary is `lib/feedback`.
 */
import { durationMs, easing } from "./tokens";

/** Durations in seconds (motion's unit). Exits run at ⅔ (`exitOf`). */
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

/** Springs, stiffness/damping at mass 1. */
export const spring = {
  /** Reflow, toggles, drop. Settles in about 302 ms. */
  snappy: { type: "spring", stiffness: 520, damping: 42 },
  /** Sheets (pass the release velocity). Settles in about 350 ms. */
  sheet: { type: "spring", stiffness: 380, damping: 36 },
  /** Pops, stamps, the heart. Settles in about 597 ms. */
  celebrate: { type: "spring", stiffness: 300, damping: 18 },
} as const;

/** Distances: px for translations, factors for scale. */
export const distance = {
  /** A route's drift: the list leaves by, and the page arrives from, 60 px. */
  route: 60,
  /** A list row arrives 8 px up. */
  list: 8,
  /** A pressed control. */
  press: 0.97,
  /** A held card lifting into quick look, a dragged tier row. */
  lift: 1.03,
  /** A sheet rises from this scale at the tap's x. */
  sheetFrom: 0.94,
  /** A cluster fans its pins out this far. */
  fan: 56,
} as const;

/** The pressed scale (`distance.press`), the one every pressable shares. */
export const press = distance.press;

/** Reduced motion's replacements where SPEC names one, in seconds. */
export const calm = {
  /** A cross-fade standing in for a route, a quick look, a dock or a fan. */
  fade: 0.15,
  /** A plain fade standing in for a sheet, a back, a drag's exit. */
  sheet: 0.12,
} as const;

/** Every other movement under reduced motion: a cross-fade at micro. */
export const reduced = {
  transition: { duration: dur.micro, ease: ease.standard },
  /** Variants for `initial` / `animate` / `exit`: opacity only. */
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

/**
 * Gesture thresholds (SPEC § Gestures). A drag is claimed after 6 px of
 * travel (10 px of slop for a tap), its axis locked on that first claim.
 */
export const gesture = {
  claimPx: 6,
  slopPx: 10,
  /** The edge swipe back starts this close to the leading edge… */
  edgePx: 20,
  /** …and commits past this share of the width. */
  backAt: 0.35,
  /** A release faster than this is a fling… */
  flingPxPerMs: 0.5,
  /** …and none is read as faster than this. */
  vmaxPxPerMs: 5,
  /** Snaps are chosen by the position this far ahead of the release. */
  projectMs: 200,
  /** Past a limit the surface moves this share of the finger's travel. */
  rubber: 0.2,
  /** Hold: the card lifts at 150 ms and quick look opens at 400 ms. */
  liftMs: 150,
  holdMs: 400,
  /** A tier row's drag arms after 250 ms. */
  armMs: 250,
  /** Pull to refresh arms at 64 px, the list following at half the pull. */
  pullPx: 64,
  pullK: 0.5,
  /** Quick look steps past 30 % of the width… */
  swipeAt: 0.3,
  /** …and sheets and quick look dismiss past 30 % of the height. */
  dismissAt: 0.3,
  /** Map and list coasting: exponential decay with this time constant. */
  decayTauMs: 325,
} as const;

/** Press and hold (the same numbers as `gesture`, named for the hold). */
export const hold = {
  liftMs: gesture.liftMs,
  openMs: gesture.holdMs,
} as const;

/** Rows arrive 30 ms apart, at most six of them staggered. */
export const stagger = {
  /** Seconds, for motion's `delay`. */
  each: 0.03,
  max: 6,
} as const;

/** The delay for the row at `index`: rows past `stagger.max` arrive with the last. */
export const staggerDelay = (index: number): number =>
  Math.min(Math.max(0, index), stagger.max - 1) * stagger.each;

/** A toast stays 5 s. */
export const toastMs = 5000;

/** A skeleton shows after 120 ms of waiting and, once shown, holds 300 ms. */
export const skeleton = {
  afterMs: 120,
  holdMs: 300,
} as const;

/** Pull to refresh holds its armed state at least this long. */
export const refreshMs = 900;

/** An exit runs about two thirds of its enter. */
export const exitOf = (seconds: number): number => seconds * (2 / 3);

/** A tween on the standard curve, e.g. `transition={tween("short")}`. */
export const tween = (
  d: keyof typeof dur,
  curve: keyof typeof ease = "standard",
) => ({ duration: dur[d], ease: ease[curve] });

/** The exit of `tween(d)`: ⅔ of the time, on the exit curve. */
export const tweenOut = (d: keyof typeof dur) => ({
  duration: exitOf(dur[d]),
  ease: ease.exit,
});
