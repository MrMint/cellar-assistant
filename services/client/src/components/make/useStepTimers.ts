"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedback } from "@/lib/feedback";
import type { MakeStep } from "./steps";
import {
  idleTimer,
  remainingMs,
  resetTimer,
  type TimerState,
  tickTimer,
  toggleTimer,
} from "./timer";

export type StepTimerView = {
  readonly stepIndex: number;
  readonly status: TimerState["status"];
  readonly remainingMs: number;
  readonly durationMs: number;
};

/**
 * Every timed step's countdown, held by Make mode rather than by the step on
 * screen, so a timer keeps running when you move to another step (lead's
 * ruling 4 on the Recipes-Make board) and the segment bar can show it.
 * One shared tick, four times a second, while any of them runs; a timer
 * that reaches zero plays the success cue once.
 */
export const useStepTimers = (steps: readonly MakeStep[]) => {
  const [timers, setTimers] = useState<ReadonlyMap<number, TimerState>>(
    () =>
      new Map(
        steps.flatMap((step, index) =>
          step.timerSeconds === null
            ? []
            : [[index, idleTimer(step.timerSeconds * 1000)] as const],
        ),
      ),
  );
  const [now, setNow] = useState(() => Date.now());
  const anyRunning = Array.from(timers.values()).some(
    (t) => t.status === "running",
  );
  const done = useRef(new Set<number>());

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setTimers((current) => {
        const next = new Map(current);
        for (const [index, timer] of Array.from(current.entries())) {
          next.set(index, tickTimer(timer, at));
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [anyRunning]);

  // A timer that reached zero is heard once (outside the state updater, which
  // React may run twice).
  useEffect(() => {
    timers.forEach((timer, index) => {
      if (timer.status === "done" && !done.current.has(index)) {
        done.current.add(index);
        feedback("success");
      }
    });
  }, [timers]);

  const toggle = useCallback((index: number) => {
    const at = Date.now();
    setNow(at);
    setTimers((current) => {
      const timer = current.get(index);
      if (timer === undefined) return current;
      const next = new Map(current);
      const base = timer.status === "done" ? resetTimer(timer) : timer;
      next.set(index, toggleTimer(base, at));
      return next;
    });
  }, []);

  useEffect(() => {
    timers.forEach((timer, index) => {
      if (timer.status !== "done") done.current.delete(index);
    });
  }, [timers]);

  const view = (index: number): StepTimerView | null => {
    const timer = timers.get(index);
    if (timer === undefined) return null;
    return {
      stepIndex: index,
      status: timer.status,
      remainingMs: remainingMs(timer, now),
      durationMs: timer.durationMs,
    };
  };

  /** A running timer on a step other than `current`, for the segment bar. */
  const elsewhere = (current: number): StepTimerView | null => {
    for (const [index, timer] of Array.from(timers.entries())) {
      if (index !== current && timer.status === "running") return view(index);
    }
    return null;
  };

  return { view, toggle, elsewhere };
};
