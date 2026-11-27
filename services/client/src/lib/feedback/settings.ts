/**
 * The person's "Sound and haptics" setting: Sounds on/off and Haptics on/off,
 * both on by default. A per-device convenience in localStorage, like the
 * theme: a phone that buzzes and a desk that cannot share no setting. Absent
 * means on; only "off" is stored. Storage that throws (a private window,
 * blocked site data) reads as on and cannot be switched off.
 *
 * The Settings UI is H2's; it reads and writes through `useFeedbackSettings`.
 * Turning either one on answers at once (a tick, the tick sound) so the person
 * feels what they chose; on an iPhone the haptic half of that needs a forced
 * `HapticOverlay` on the On control, since with haptics off no other overlay
 * draws (Fettle M-8).
 */
import { useSyncExternalStore } from "react";

export const HAPTICS_KEY = "cellar.haptics";
export const SOUNDS_KEY = "cellar.sounds";

export interface FeedbackSettings {
  readonly sounds: boolean;
  readonly haptics: boolean;
}

const listeners = new Set<() => void>();

function readOn(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function writeOn(key: string, on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, "off");
  } catch {
    /* Storage refused: the switch cannot stick, and the setting stays on. */
  }
}

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function hapticsEnabled(): boolean {
  return readOn(HAPTICS_KEY);
}

export function soundsEnabled(): boolean {
  return readOn(SOUNDS_KEY);
}

export function setHapticsEnabled(on: boolean): void {
  writeOn(HAPTICS_KEY, on);
  notify();
}

export function setSoundsEnabled(on: boolean): void {
  writeOn(SOUNDS_KEY, on);
  notify();
}

/** For `useSyncExternalStore`: the setting changed here or in another tab. */
export function subscribeFeedback(listener: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (
      event.key === null ||
      event.key === HAPTICS_KEY ||
      event.key === SOUNDS_KEY
    ) {
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** One object per combination, so `useSyncExternalStore` sees a stable snapshot. */
const SNAPSHOTS: Record<string, FeedbackSettings> = {
  "true:true": { sounds: true, haptics: true },
  "true:false": { sounds: true, haptics: false },
  "false:true": { sounds: false, haptics: true },
  "false:false": { sounds: false, haptics: false },
};
const ON = SNAPSHOTS["true:true"] ?? { sounds: true, haptics: true };

export function feedbackSettings(): FeedbackSettings {
  return SNAPSHOTS[`${soundsEnabled()}:${hapticsEnabled()}`] ?? ON;
}

/** The server cannot read this device's storage: both read as their default, on. */
const onServer = (): FeedbackSettings => ON;

/**
 * Hooks registered by `index.ts` so that turning a setting on answers with
 * itself, without this module importing the players (which import it).
 */
let answerOn: { haptics?: () => void; sounds?: () => void } = {};
export function setAnswers(next: typeof answerOn): void {
  answerOn = next;
}

/** Apply a change; switching one on answers with a tick of that kind. */
export function setFeedbackSettings(patch: Partial<FeedbackSettings>): void {
  const was = feedbackSettings();
  if (patch.haptics !== undefined) writeOn(HAPTICS_KEY, patch.haptics);
  if (patch.sounds !== undefined) writeOn(SOUNDS_KEY, patch.sounds);
  notify();
  try {
    if (patch.haptics === true && !was.haptics) answerOn.haptics?.();
    if (patch.sounds === true && !was.sounds) answerOn.sounds?.();
  } catch {
    /* An answer is a nicety; the setting has already changed. */
  }
}

export function useFeedbackSettings(): FeedbackSettings & {
  set: (patch: Partial<FeedbackSettings>) => void;
} {
  const settings = useSyncExternalStore(
    subscribeFeedback,
    feedbackSettings,
    onServer,
  );
  return { ...settings, set: setFeedbackSettings };
}
