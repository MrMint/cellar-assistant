"use client";

import { useCallback, useEffect, useState } from "react";
import {
  idleTimer,
  remainingMs,
  resetTimer,
  type TimerState,
  tickTimer,
  toggleTimer,
} from "./timer";

/**
 * A `timer.ts` countdown in React: ticks four times a second while it runs.
 * Changing `durationMs` (another step, another steep) starts over at idle.
 */
export const useCountdown = (durationMs: number) => {
  const [state, setState] = useState<TimerState>(() => idleTimer(durationMs));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setState(idleTimer(durationMs));
  }, [durationMs]);
  const running = state.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setState((current) => tickTimer(current, at));
    }, 250);
    return () => clearInterval(id);
  }, [running]);
  const toggle = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setState((current) => toggleTimer(current, at));
  }, []);
  const reset = useCallback(
    () => setState((current) => resetTimer(current)),
    [],
  );
  return {
    status: state.status,
    remainingMs: remainingMs(state, now),
    toggle,
    reset,
  };
};
