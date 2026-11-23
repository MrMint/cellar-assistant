/**
 * ux-c L08: a countdown's state, shared by Make mode's step timers and the
 * Steep / Brew guide. Pure — every transition takes `now` (ms), so the
 * component only re-renders on a tick and `timer.test.ts` needs no clock.
 *
 *   idle ──start──▶ running ──pause──▶ paused ──resume──▶ running
 *                     │  └──(remaining hits 0)──▶ done
 *                     └──────────reset──────────▶ idle
 */
export type TimerState =
  | { readonly status: "idle"; readonly durationMs: number }
  | {
      readonly status: "running";
      readonly durationMs: number;
      /** When it reaches 0, in `now`'s clock. */
      readonly endsAt: number;
    }
  | {
      readonly status: "paused";
      readonly durationMs: number;
      readonly remainingMs: number;
    }
  | { readonly status: "done"; readonly durationMs: number };

export const idleTimer = (durationMs: number): TimerState => ({
  status: "idle",
  durationMs: Math.max(0, Math.round(durationMs)),
});

export const startTimer = (state: TimerState, now: number): TimerState =>
  state.durationMs <= 0
    ? { status: "done", durationMs: state.durationMs }
    : {
        status: "running",
        durationMs: state.durationMs,
        endsAt: now + state.durationMs,
      };

export const pauseTimer = (state: TimerState, now: number): TimerState => {
  if (state.status !== "running") return state;
  const remainingMs = state.endsAt - now;
  return remainingMs <= 0
    ? { status: "done", durationMs: state.durationMs }
    : { status: "paused", durationMs: state.durationMs, remainingMs };
};

export const resumeTimer = (state: TimerState, now: number): TimerState =>
  state.status === "paused"
    ? {
        status: "running",
        durationMs: state.durationMs,
        endsAt: now + state.remainingMs,
      }
    : state;

export const resetTimer = (state: TimerState): TimerState =>
  idleTimer(state.durationMs);

/** A running timer whose time is up becomes `done`; anything else is kept. */
export const tickTimer = (state: TimerState, now: number): TimerState =>
  state.status === "running" && state.endsAt <= now
    ? { status: "done", durationMs: state.durationMs }
    : state;

/** Milliseconds left at `now`. */
export const remainingMs = (state: TimerState, now: number): number => {
  switch (state.status) {
    case "idle":
      return state.durationMs;
    case "running":
      return Math.max(0, state.endsAt - now);
    case "paused":
      return state.remainingMs;
    case "done":
      return 0;
  }
};

/** The one button: start, pause, resume, or start again once done. */
export const toggleTimer = (state: TimerState, now: number): TimerState => {
  switch (state.status) {
    case "idle":
      return startTimer(state, now);
    case "running":
      return pauseTimer(state, now);
    case "paused":
      return resumeTimer(state, now);
    case "done":
      return startTimer(resetTimer(state), now);
  }
};

/** `0:30`, `3:00`, `12:05` — whole seconds, rounded up while it runs. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
