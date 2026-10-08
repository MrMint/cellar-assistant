import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStreamGate, type StoppableStream } from "./stream-gate.ts";

const fakeStream = () => {
  const stopped: boolean[] = [false, false];
  const stream: StoppableStream = {
    getTracks: () =>
      stopped.map((_, index) => ({
        stop: () => {
          stopped[index] = true;
        },
      })),
  };
  return { stream, stopped: () => stopped.every(Boolean) };
};

describe("createStreamGate — a late camera answer is stopped, not adopted", () => {
  test("the answer to the current request is adopted and left running", () => {
    const gate = createStreamGate();
    const ticket = gate.begin();
    const { stream, stopped } = fakeStream();
    assert.equal(gate.adopt(ticket, stream), true);
    assert.equal(stopped(), false);
  });

  test("stopped while pending (Skip, unmount): the late stream is stopped", () => {
    const gate = createStreamGate();
    const ticket = gate.begin();
    gate.cancel();
    const { stream, stopped } = fakeStream();
    assert.equal(gate.adopt(ticket, stream), false);
    assert.equal(stopped(), true);
  });

  test("Try again while pending: the first answer is stopped, the retry's kept", () => {
    const gate = createStreamGate();
    const first = gate.begin();
    gate.cancel(); // the retry stops the scanner first
    const second = gate.begin();
    const late = fakeStream();
    const fresh = fakeStream();
    assert.equal(gate.adopt(first, late.stream), false);
    assert.equal(late.stopped(), true);
    assert.equal(gate.adopt(second, fresh.stream), true);
    assert.equal(fresh.stopped(), false);
    assert.equal(gate.isCurrent(second), true);
    assert.equal(gate.isCurrent(first), false);
  });

  test("a new request alone also voids the old one", () => {
    const gate = createStreamGate();
    const first = gate.begin();
    gate.begin();
    const late = fakeStream();
    assert.equal(gate.adopt(first, late.stream), false);
    assert.equal(late.stopped(), true);
  });
});
