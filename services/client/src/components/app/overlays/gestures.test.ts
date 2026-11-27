/** The installed app's gestures, by their numbers (SPEC § Gestures). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  edgeRelease,
  isStandalone,
  pullArmed,
  pullDistance,
  startsEdgeSwipe,
} from "./gestures";

describe("edge swipe back", () => {
  test("starts only within 20 px of the left edge", () => {
    assert.equal(startsEdgeSwipe(0), true);
    assert.equal(startsEdgeSwipe(20), true);
    assert.equal(startsEdgeSwipe(21), false);
  });
  test("commits past 35 % of the width, or on a fling", () => {
    assert.equal(edgeRelease(140, 0, 390), "back");
    assert.equal(edgeRelease(130, 0, 390), "stay");
    assert.equal(edgeRelease(40, 0.6, 390), "back");
    assert.equal(edgeRelease(40, 0.4, 390), "stay");
    assert.equal(edgeRelease(0, 3, 390), "stay", "no travel, no back");
  });
});

describe("pull to refresh", () => {
  test("the list follows at half the pull, never above", () => {
    assert.equal(pullDistance(100), 50);
    assert.equal(pullDistance(-30), 0);
  });
  test("arms at 64 px shown, 128 px of finger", () => {
    assert.equal(pullArmed(127), false);
    assert.equal(pullArmed(128), true);
  });
});

test("a plain browser tab is not standalone", () => {
  assert.equal(isStandalone(), false);
});
