import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { onceBackOnline, subscribeToConnectivity } from "./connectivity";

const fire = (target: EventTarget, type: "online" | "offline") =>
  target.dispatchEvent(new Event(type));

describe("subscribeToConnectivity", () => {
  test("hears both directions until unsubscribed", () => {
    const target = new EventTarget();
    let changes = 0;
    const unsubscribe = subscribeToConnectivity(target, () => {
      changes += 1;
    });
    fire(target, "offline");
    fire(target, "online");
    assert.equal(changes, 2);
    unsubscribe();
    fire(target, "offline");
    assert.equal(changes, 2);
  });
});

describe("onceBackOnline", () => {
  test("fires on the next `online`, and only once", () => {
    const target = new EventTarget();
    let calls = 0;
    onceBackOnline(target, () => {
      calls += 1;
    });
    fire(target, "offline");
    assert.equal(calls, 0);
    fire(target, "online");
    fire(target, "online");
    assert.equal(calls, 1);
  });

  test("cancelled before the connection returns, it never fires", () => {
    const target = new EventTarget();
    let calls = 0;
    const cancel = onceBackOnline(target, () => {
      calls += 1;
    });
    cancel();
    fire(target, "online");
    assert.equal(calls, 0);
  });
});
