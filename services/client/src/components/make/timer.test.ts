import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatClock,
  idleTimer,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  startTimer,
  tickTimer,
  toggleTimer,
} from "./timer";

describe("countdown state (ux-c L08)", () => {
  test("idle shows its whole duration, and starting counts down from now", () => {
    const idle = idleTimer(30_000);
    assert.equal(remainingMs(idle, 0), 30_000);
    const running = startTimer(idle, 1_000);
    assert.equal(running.status, "running");
    assert.equal(remainingMs(running, 11_000), 20_000);
  });

  test("pause keeps what is left, and resume picks up from there", () => {
    const running = startTimer(idleTimer(30_000), 0);
    const paused = pauseTimer(running, 10_000);
    assert.deepEqual(paused, {
      status: "paused",
      durationMs: 30_000,
      remainingMs: 20_000,
    });
    // Time passing while paused changes nothing.
    assert.equal(remainingMs(paused, 99_000), 20_000);
    const resumed = resumeTimer(paused, 50_000);
    assert.equal(remainingMs(resumed, 55_000), 15_000);
  });

  test("a tick past the end finishes it; one before leaves it running", () => {
    const running = startTimer(idleTimer(5_000), 0);
    assert.equal(tickTimer(running, 4_999).status, "running");
    assert.equal(tickTimer(running, 5_000).status, "done");
    assert.equal(remainingMs(tickTimer(running, 9_000), 9_000), 0);
  });

  test("pausing after the end is done, not a negative pause", () => {
    const running = startTimer(idleTimer(5_000), 0);
    assert.equal(pauseTimer(running, 6_000).status, "done");
  });

  test("the one button cycles start → pause → resume, and restarts when done", () => {
    let state = idleTimer(10_000);
    state = toggleTimer(state, 0);
    assert.equal(state.status, "running");
    state = toggleTimer(state, 4_000);
    assert.equal(state.status, "paused");
    state = toggleTimer(state, 4_000);
    assert.equal(state.status, "running");
    state = tickTimer(state, 20_000);
    assert.equal(state.status, "done");
    state = toggleTimer(state, 30_000);
    assert.equal(state.status, "running");
    assert.equal(remainingMs(state, 30_000), 10_000);
  });

  test("reset goes back to idle at the full duration", () => {
    const paused = pauseTimer(startTimer(idleTimer(8_000), 0), 3_000);
    assert.deepEqual(resetTimer(paused), { status: "idle", durationMs: 8_000 });
  });

  test("a zero-length timer is done the moment it starts", () => {
    assert.equal(startTimer(idleTimer(0), 0).status, "done");
  });

  test("the clock reads minutes and seconds, rounding up", () => {
    assert.equal(formatClock(30_000), "0:30");
    assert.equal(formatClock(180_000), "3:00");
    assert.equal(formatClock(29_001), "0:30");
    assert.equal(formatClock(725_000), "12:05");
    assert.equal(formatClock(-5), "0:00");
  });
});
