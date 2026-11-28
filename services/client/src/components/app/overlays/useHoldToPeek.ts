"use client";

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { feedback } from "@/lib/feedback";
import { gesture, hold } from "@/lib/motion";

export type HoldPhase = "rest" | "pressed" | "lifted";

/**
 * Press and hold to peek (SPEC movement 6; KIT § 2 Quick look): .97 at once
 * (the pressable's own `active:` scale), lift to 1.03 at 150 ms, and at
 * 400 ms the hold haptic and `onPeek`. Moving past the 10 px slop, lifting
 * the finger or cancelling ends it without a peek; a peek swallows the
 * click that follows, so the tile does not also open its page.
 *
 * Spread `handlers` on the tile and read `phase` for the lift
 * (`data-hold={phase}`); scale with `distance.lift` from `lib/motion`.
 */
export function useHoldToPeek(onPeek: () => void): {
  phase: HoldPhase;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
    onClickCapture: (event: {
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => void;
    onContextMenu: (event: { preventDefault: () => void }) => void;
  };
} {
  const [phase, setPhase] = useState<HoldPhase>("rest");
  const timers = useRef<number[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const peeked = useRef(false);
  const onPeekRef = useRef(onPeek);
  onPeekRef.current = onPeek;

  const clear = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const end = useCallback(() => {
    clear();
    setPhase("rest");
  }, [clear]);

  return {
    phase,
    handlers: {
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        clear();
        peeked.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        setPhase("pressed");
        timers.current.push(
          window.setTimeout(() => setPhase("lifted"), hold.liftMs),
          window.setTimeout(() => {
            peeked.current = true;
            feedback("hold");
            clear();
            setPhase("rest");
            onPeekRef.current();
          }, hold.openMs),
        );
      },
      onPointerMove: (event) => {
        const from = start.current;
        if (from === null) return;
        const moved = Math.hypot(
          event.clientX - from.x,
          event.clientY - from.y,
        );
        if (moved > gesture.slopPx) end();
      },
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
      onClickCapture: (event) => {
        if (!peeked.current) return;
        peeked.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      // A long press on a phone would otherwise raise the system menu.
      onContextMenu: (event) => {
        if (start.current !== null || peeked.current) event.preventDefault();
      },
    },
  };
}
