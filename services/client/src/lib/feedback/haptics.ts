/**
 * Haptics, ported from Fettle's `motion-haptics.ts` (DECISIONS 36): a named
 * vocabulary for the person's own act, fired at the press or at the landing,
 * never for a refetch or anything the app does on its own. Reduced motion
 * does not silence it (a vibration is not on-screen movement); the person's
 * Haptics setting does. Reduced motion does calm a celebration: `success`,
 * `medium` and `big` play as their one strongest beat.
 *
 * Android Chrome has `navigator.vibrate` and takes the whole pattern, from
 * anywhere: a press, a drag threshold, a timer, the far side of an `await`.
 *
 * An iPhone has no `vibrate`. Its one tick is the system's, played when an
 * `<input type="checkbox" switch>` toggles, and since iOS 26.5 only when a
 * REAL TAP lands on the switch (or its label): a script's `click()` toggles
 * it in silence. (Third-party reports, not Apple's word; a device is the only
 * proof.) So the iPhone path has two halves:
 *
 *   1. The overlay, which is how a press is felt. `HapticOverlay` lays an
 *      invisible switch over a pressable element, so the finger itself
 *      toggles it. `attachHapticOverlay` stops that click at the switch and
 *      dispatches one click on the element underneath, so its handlers, a
 *      link's navigation and a submit button's submit run exactly once. A
 *      `haptic()` asked for inside that dispatch is already felt: it plays
 *      nothing more for its first pulse.
 *   2. The hidden switch, the iOS 18 to 26.4 path, kept because it costs
 *      nothing. `HapticSwitch` keeps one hidden in the app and `haptic()`
 *      clicks its label once per pulse: the first inside the dispatch of the
 *      gesture that asked for it, the rest chained by timers at the pattern's
 *      own offsets (inside the 400 ms cap). On 26.5+ those clicks are silent
 *      toggles of a box nobody can see or reach. Outside a gesture's dispatch
 *      nothing is clicked at all, so a haptic asked for after an `await`, from
 *      a timer or at a drag's threshold is Android's alone on 26.5+.
 *
 * Every pulse is at most `HAPTIC_PULSE_MAX_MS` and a pattern at most
 * `HAPTIC_PATTERN_MAX_MS` in total, gaps included. Pulses stay in 8 to 20 ms
 * (bar `big` and `refuse`): Android's coarse motors drop anything shorter.
 */
import { hapticsEnabled, subscribeFeedback } from "./settings";

export const HAPTIC_PULSE_MAX_MS = 40;
export const HAPTIC_PATTERN_MAX_MS = 400;

/** Patterns alternate vibrate, pause, vibrate… in ms. */
export const HAPTIC = {
  /** Rate, favourite, a quick-look step, a fan, a toggle. */
  tick: [10],
  /** A threshold crossed: a scrubber band, pull arming, a snap. */
  detent: [8],
  /** A long press recognised: quick look opens, a tier drag arms. */
  hold: [14],
  /** Undo: a double tap, so it never feels like `tick`. */
  undo: [8, 30, 8],
  /** A write that deserves a nod: check in, add a bottle. */
  success: [12, 40, 18],
  /** A new #1. */
  medium: [14, 50, 14, 50, 20],
  /** The biggest moments. */
  big: [18, 60, 18, 60, 30, 90, 40],
  /** A write refused: an optimistic change rolled back. */
  refuse: [30, 40, 30],
} as const satisfies Record<string, readonly number[]>;

export type HapticKind = keyof typeof HAPTIC;

/**
 * Whether an overlay switch may draw: a touch screen, no `vibrate`, and the
 * person's setting on. An overlay drawn with the setting off would still tick
 * under a finger, so it is not drawn.
 */
export function hapticOverlayLive(): boolean {
  if (!switchDevice()) return false;
  return hapticsEnabled();
}

/** A device whose presses are felt only through a switch: an iPhone. */
export function switchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate === "function") return false;
  return navigator.maxTouchPoints > 0;
}

/** For `useSyncExternalStore`: the setting changed here or in another tab. */
export const subscribeHaptics = subscribeFeedback;

/** Clamp a pattern to the two caps: each pulse, then the running total. */
export function clampPattern(pattern: readonly number[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < pattern.length; i++) {
    const raw = pattern[i] ?? 0;
    const vibrate = i % 2 === 0;
    const ms = Math.max(
      vibrate ? 1 : 0,
      Math.round(vibrate ? Math.min(HAPTIC_PULSE_MAX_MS, raw) : raw),
    );
    if (total + ms > HAPTIC_PATTERN_MAX_MS) break;
    out.push(ms);
    total += ms;
  }
  /* A pattern never ends on a pause. */
  if (out.length % 2 === 0) out.pop();
  return out;
}

/** When each pulse of a clamped pattern starts, in ms from the first. */
export function pulseOffsets(pattern: readonly number[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (i % 2 === 0) out.push(at);
    at += pattern[i] ?? 0;
  }
  return out;
}

/**
 * The events a gesture is dispatched as. `input`, `change` and `submit` are
 * here because a control's activation fires them after the click's own
 * dispatch has ended, still inside the same press.
 */
export const GESTURE_EVENTS = [
  "pointerdown",
  "pointerup",
  "pointermove",
  "touchstart",
  "touchmove",
  "touchend",
  "mousedown",
  "mouseup",
  "click",
  "keydown",
  "keyup",
  "input",
  "change",
  "submit",
] as const;

let switchLabel: HTMLLabelElement | null = null;
let lastGesture: Event | null = null;
let chain: ReturnType<typeof setTimeout>[] = [];
/** Set while an overlay's click is being handed to its element: the finger already ticked. */
let overlayPress = false;

/** A pointer moving with nothing pressed is not a gesture; one being dragged is. */
function isGesture(event: Event): boolean {
  if (
    switchLabel !== null &&
    event.target instanceof Node &&
    switchLabel.contains(event.target)
  ) {
    return false;
  }
  if (event.type === "pointermove") {
    return (event as PointerEvent).buttons !== 0;
  }
  return true;
}

/**
 * Whether the code running now is inside a gesture's dispatch. A dispatch
 * sets `eventPhase` back to NONE when it ends, so an `await`'s continuation,
 * a timer or a refetch reads false.
 */
export function inGesture(): boolean {
  return lastGesture !== null && lastGesture.eventPhase !== Event.NONE;
}

function cancelChain(): void {
  for (const t of chain) clearTimeout(t);
  chain = [];
}

/**
 * Register the app's hidden switch label and start watching gestures; returns
 * the teardown. One at a time: a later registration replaces the earlier.
 */
export function registerHapticSwitch(label: HTMLLabelElement): () => void {
  const seen = (event: Event): void => {
    if (isGesture(event)) lastGesture = event;
  };
  /* The switch's own clicks stop at the label, so no listener in the page
     takes them for a press. */
  const keep = (event: Event): void => {
    event.stopPropagation();
  };
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, seen, { capture: true, passive: true });
  }
  label.addEventListener("click", keep);
  switchLabel = label;
  return () => {
    for (const type of GESTURE_EVENTS) {
      window.removeEventListener(type, seen, { capture: true });
    }
    label.removeEventListener("click", keep);
    if (switchLabel === label) {
      switchLabel = null;
      lastGesture = null;
      cancelChain();
    }
  };
}

function chainBeats(offsets: readonly number[]): void {
  cancelChain();
  const label = switchLabel;
  if (label === null) return;
  chain = offsets.map((at) =>
    setTimeout(() => {
      if (switchLabel === label && hapticsEnabled()) label.click();
    }, at),
  );
}

/** The hidden-switch path: one label click per pulse, inside a gesture. */
function clickSwitch(pattern: readonly number[]): boolean {
  const [first, ...rest] = pulseOffsets(pattern);
  if (first === undefined) return false;
  if (overlayPress) {
    chainBeats(rest);
    return true;
  }
  const label = switchLabel;
  if (label === null || !inGesture()) return false;
  /* A new pattern takes over from the one still playing. */
  cancelChain();
  label.click();
  chainBeats(rest);
  return true;
}

/** The click handed to the element under an overlay: the finger's, field for field. */
function handedOn(event: MouseEvent): MouseEvent {
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
  };
  if (typeof PointerEvent === "function" && event instanceof PointerEvent) {
    return new PointerEvent("click", {
      ...init,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
    });
  }
  return new MouseEvent("click", init);
}

/**
 * Wire an overlay switch: its own click stops at the switch and one click
 * with the same fields is dispatched on the element it covers. Its `input`
 * and `change` stop too, and a focus it takes moves to what it covers.
 * Returns the teardown.
 */
export function attachHapticOverlay(input: HTMLInputElement): () => void {
  const onClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const host = input.parentElement;
    if (host === null) return;
    const was = overlayPress;
    overlayPress = true;
    try {
      host.dispatchEvent(handedOn(event));
    } finally {
      overlayPress = was;
    }
  };
  const swallow = (event: Event): void => {
    event.stopPropagation();
  };
  const onFocus = (): void => {
    const host = input.parentElement;
    const target = host instanceof HTMLLabelElement ? host.control : host;
    if (target instanceof HTMLElement && target !== input) {
      target.focus({ preventScroll: true });
    }
  };
  input.addEventListener("click", onClick);
  input.addEventListener("input", swallow);
  input.addEventListener("change", swallow);
  input.addEventListener("focus", onFocus);
  return () => {
    input.removeEventListener("click", onClick);
    input.removeEventListener("input", swallow);
    input.removeEventListener("change", swallow);
    input.removeEventListener("focus", onFocus);
  };
}

/** The kinds reduced motion plays as one beat: a celebration felt as a nod. */
const CALMED: ReadonlySet<HapticKind> = new Set<HapticKind>([
  "success",
  "medium",
  "big",
]);

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** A kind's pattern as played now: a celebration collapses to its strongest pulse under reduced motion. */
export function calmed(
  kind: HapticKind,
  reduced: boolean = prefersReducedMotion(),
): readonly number[] {
  const pattern = HAPTIC[kind];
  if (!reduced || !CALMED.has(kind)) return pattern;
  return [Math.max(...pattern.filter((_, i) => i % 2 === 0))];
}

/**
 * Fire one named pattern (or a single pulse of `ms`). Returns whether the
 * device accepted it, or on the iPhone path whether an overlay's press
 * carried it or the hidden switch's first pulse was clicked. Never throws.
 */
export function haptic(kind: HapticKind | number = "tick"): boolean {
  if (typeof navigator === "undefined") return false;
  if (!hapticsEnabled()) return false;
  const pattern = clampPattern(
    typeof kind === "number" ? [kind] : calmed(kind),
  );
  if (pattern.length === 0) return false;
  if (typeof navigator.vibrate !== "function") return clickSwitch(pattern);
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
