/**
 * One call for touch feedback (MC-feedback): `feedback(name)` fires the
 * haptic and the sound that share the name, honouring the person's Sound and
 * haptics setting. Only for what the person touches or holds; never for
 * scroll, loading, data arriving or anything the app does on its own.
 *
 * | name    | haptic   | sound                                        |
 * |---------|----------|----------------------------------------------|
 * | press   | none     | asus-kbd-soft, down on press, up on release  |
 * | primary | none     | asus-kbd-medium, down on press, up on release|
 * | toggle  | tick     | asus-kbd-space, down                         |
 * | tick    | tick     | asus-kbd-soft, down                          |
 * | detent  | detent   | asus-kbd-soft, down, volume ×0.6             |
 * | hold    | hold     | asus-kbd-medium, down                        |
 * | undo    | undo     | asus-kbd-soft, up                            |
 * | success | success  | asus-kbd-space, down then up 60 ms later     |
 * | medium  | medium   | as success (a new #1)                        |
 * | big     | big      | as success                                   |
 * | refuse  | refuse   | none (the haptic and the visual carry it)    |
 *
 * `press` and `primary` take a phase: call with `{ phase: "down" }` on
 * pointer down and `{ phase: "up" }` on release. Every other name fires once,
 * at `down` (the default); `{ phase: "up" }` is a no-op for them, so a
 * control can pass its phase through without double-firing.
 *
 * On an iPhone a haptic is felt only inside a real tap (`haptics.ts`): put a
 * `<HapticOverlay>` in the pressable element and call `feedback` from its
 * click handler. Never throws.
 */
import { type HapticKind, haptic } from "./haptics";
import { setAnswers } from "./settings";
import { playSound, type SoundName, type SoundPhase } from "./sound";

export type FeedbackName =
  | "tick"
  | "detent"
  | "hold"
  | "undo"
  | "success"
  | "medium"
  | "big"
  | "refuse"
  | "press"
  | "primary"
  | "toggle";

export interface FeedbackOptions {
  readonly phase?: SoundPhase;
  /** False skips the haptic half. */
  readonly haptic?: boolean;
  /** False skips the sound half. */
  readonly sound?: boolean;
}

interface Cue {
  readonly haptic: HapticKind | null;
  readonly sound: {
    readonly name: SoundName;
    /** Which phases play: `both` follows the caller's down/up. */
    readonly play: "down" | "up" | "both" | "down-then-up";
    readonly volume?: number;
  } | null;
}

/** Up follows down this long after, for a commit (SPEC § Sound). */
export const COMMIT_UP_DELAY_S = 0.06;

export const CUES = {
  press: { haptic: null, sound: { name: "asus-kbd-soft", play: "both" } },
  primary: { haptic: null, sound: { name: "asus-kbd-medium", play: "both" } },
  toggle: { haptic: "tick", sound: { name: "asus-kbd-space", play: "down" } },
  tick: { haptic: "tick", sound: { name: "asus-kbd-soft", play: "down" } },
  detent: {
    haptic: "detent",
    sound: { name: "asus-kbd-soft", play: "down", volume: 0.6 },
  },
  hold: { haptic: "hold", sound: { name: "asus-kbd-medium", play: "down" } },
  undo: { haptic: "undo", sound: { name: "asus-kbd-soft", play: "up" } },
  success: {
    haptic: "success",
    sound: { name: "asus-kbd-space", play: "down-then-up" },
  },
  medium: {
    haptic: "medium",
    sound: { name: "asus-kbd-space", play: "down-then-up" },
  },
  big: {
    haptic: "big",
    sound: { name: "asus-kbd-space", play: "down-then-up" },
  },
  refuse: { haptic: "refuse", sound: null },
} as const satisfies Record<FeedbackName, Cue>;

function playCue(cue: Cue, phase: SoundPhase): void {
  const sound = cue.sound;
  if (sound === null) return;
  const volume = sound.volume ?? 1;
  switch (sound.play) {
    case "both":
      playSound(sound.name, phase, { volume });
      return;
    case "down-then-up":
      if (phase !== "down") return;
      playSound(sound.name, "down", { volume });
      playSound(sound.name, "up", { volume, delayS: COMMIT_UP_DELAY_S });
      return;
    default:
      if (phase === "down") playSound(sound.name, sound.play, { volume });
  }
}

export function feedback(name: FeedbackName, opts: FeedbackOptions = {}): void {
  try {
    const cue: Cue | undefined = CUES[name];
    if (cue === undefined) return;
    const phase = opts.phase ?? "down";
    /* A cue with no phase of its own fires at down only. */
    const phased = cue.sound?.play === "both";
    if (!phased && phase !== "down") return;
    if (opts.haptic !== false && cue.haptic !== null && phase === "down") {
      haptic(cue.haptic);
    }
    if (opts.sound !== false) playCue(cue, phase);
  } catch {
    /* Feedback is a nicety: it never breaks the press it decorates. */
  }
}

/* Turning a setting on answers with itself (settings.ts). */
setAnswers({
  haptics: () => {
    haptic("tick");
  },
  sounds: () => {
    playSound("asus-kbd-soft", "down");
  },
});

export { HapticOverlay, HapticSwitch, useHapticOverlay } from "./HapticSwitch";
export {
  calmed,
  clampPattern,
  HAPTIC,
  HAPTIC_PATTERN_MAX_MS,
  HAPTIC_PULSE_MAX_MS,
  type HapticKind,
  haptic,
  hapticOverlayLive,
  inGesture,
  pulseOffsets,
} from "./haptics";
export {
  type FeedbackSettings,
  HAPTICS_KEY,
  SOUNDS_KEY,
  useFeedbackSettings,
} from "./settings";
export { preloadSounds, unlockAudio } from "./sound";
