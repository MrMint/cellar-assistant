"use client";

/**
 * Mounts what `lib/feedback` needs once per app: the hidden haptic switch
 * (the iOS 18 to 26.4 path), the sound preload after first paint, and the
 * audio unlock on the first tap, and the reduced-motion preference (read
 * with motion's `useReducedMotion`, handed to the haptics so a celebration
 * plays as one beat). Renders its children unchanged.
 *
 * Mounted once in `app/layout.tsx` (a hand-off: that file is F1's).
 */
import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import {
  HapticSwitch,
  preloadSounds,
  setReducedMotion,
  unlockAudio,
} from "@/lib/feedback";

/** The first of these, anywhere, unlocks audio: iOS only allows it inside a tap. */
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

export function FeedbackProvider({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  useEffect(() => {
    setReducedMotion(reduced);
  }, [reduced]);

  useEffect(() => {
    /* After first paint: an effect runs after the browser has painted, and
       idle time is better still where it exists. */
    let cancel: () => void;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => preloadSounds());
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(preloadSounds, 0);
      cancel = () => clearTimeout(id);
    }

    const unlock = (): void => {
      unlockAudio();
      for (const type of UNLOCK_EVENTS) {
        window.removeEventListener(type, unlock, { capture: true });
      }
    };
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    return () => {
      cancel();
      for (const type of UNLOCK_EVENTS) {
        window.removeEventListener(type, unlock, { capture: true });
      }
    };
  }, []);

  return (
    <>
      <HapticSwitch />
      {children}
    </>
  );
}
