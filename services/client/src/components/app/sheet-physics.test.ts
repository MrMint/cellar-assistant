/**
 * The sheet's physics as numbers (ux-c B04): where a release lands for each
 * snap boundary and velocity, how far an end stretches, who owns a drag at a
 * scroll edge, and how long a settle takes with and without reduced motion.
 *
 * A phone of 800 px with the map's three snaps: vaul's fractions 0.36, 0.61
 * and 1 put the sheet's `translateY` at 512 (peek), 312 (half) and 0 (full).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  dragOwner,
  FLING_VELOCITY,
  overshoot,
  PROJECTION_MS,
  releaseVelocity,
  resolveSnap,
  rubberBand,
  settleMs,
  snapOffsets,
  translateYOf,
  VAUL_SETTLE_MS,
} from "./sheet-physics";

const VIEWPORT = 800;
const OFFSETS = snapOffsets([0.36, 0.61, 1], VIEWPORT);
const [PEEK, HALF, FULL] = [0, 1, 2];

const release = (position: number, velocity: number, dismissible = true) =>
  resolveSnap({
    offsets: OFFSETS,
    position,
    velocity,
    dismissible,
    closedOffset: VIEWPORT,
  });

describe("snapOffsets", () => {
  test("vaul's fractions become translateY from the fully open sheet", () => {
    assert.deepEqual(
      OFFSETS.map((px) => Math.round(px)),
      [512, 312, 0],
    );
  });
});

describe("resolveSnap: a slow release lands on the nearest stop", () => {
  test("each boundary between two snaps is their midpoint", () => {
    // full | half at 156, half | peek at 412, peek | closed at 656.
    assert.deepEqual(release(155, 0), { kind: "snap", index: FULL });
    assert.deepEqual(release(157, 0), { kind: "snap", index: HALF });
    assert.deepEqual(release(411, 0), { kind: "snap", index: HALF });
    assert.deepEqual(release(413, 0), { kind: "snap", index: PEEK });
    assert.deepEqual(release(655, 0), { kind: "snap", index: PEEK });
    assert.deepEqual(release(657, 0), { kind: "dismiss" });
  });

  test("a sheet that cannot be dismissed has no closed stop", () => {
    assert.deepEqual(release(780, 0, false), { kind: "snap", index: PEEK });
    assert.deepEqual(release(780, 3, false), { kind: "snap", index: PEEK });
  });

  test("below the fling threshold the projection still counts", () => {
    const v = FLING_VELOCITY / 2;
    // From half, 0.2 px/ms projects 40 px: not enough to cross 412.
    assert.deepEqual(release(312, v), { kind: "snap", index: HALF });
    // From 380 it crosses the boundary.
    assert.deepEqual(release(380, v), { kind: "snap", index: PEEK });
    assert.equal(380 + v * PROJECTION_MS > 412, true);
  });
});

describe("resolveSnap: velocity thresholds", () => {
  test("a flick at the threshold always reaches the next stop its way", () => {
    // Barely moved from half, but flicked: the next one up, and down.
    assert.deepEqual(release(300, -FLING_VELOCITY), {
      kind: "snap",
      index: FULL,
    });
    assert.deepEqual(release(320, FLING_VELOCITY), {
      kind: "snap",
      index: PEEK,
    });
  });

  test("just under the threshold it does not", () => {
    const v = FLING_VELOCITY - 0.01;
    assert.deepEqual(release(300, -v), { kind: "snap", index: HALF });
    assert.deepEqual(release(320, v), { kind: "snap", index: HALF });
  });

  test("a flick down from peek dismisses; one up from full stays at full", () => {
    assert.deepEqual(release(520, FLING_VELOCITY), { kind: "dismiss" });
    assert.deepEqual(release(-10, -2), { kind: "snap", index: FULL });
  });

  test("a hard fling can skip a snap, by projection", () => {
    // 3 px/ms from half projects 600 px down: past peek, to closed.
    assert.deepEqual(release(312, 3), { kind: "dismiss" });
    assert.deepEqual(release(500, -3), { kind: "snap", index: FULL });
  });

  test("a non-dismissible flick down from peek stays at peek", () => {
    assert.deepEqual(release(520, 2, false), { kind: "snap", index: PEEK });
  });
});

describe("releaseVelocity", () => {
  test("only the last 100 ms count: a slow drag ending in a flick is a flick", () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 400, y: 40 }, // 0.1 px/ms for 400 ms
      { t: 450, y: 70 },
      { t: 500, y: 100 }, // then 0.6 px/ms
    ];
    assert.equal(releaseVelocity(samples), 0.6);
  });

  test("a drag that stops before lifting has no velocity", () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 100, y: 200 },
      { t: 300, y: 200 },
    ];
    assert.equal(releaseVelocity(samples), 0);
  });

  test("upward is negative; one sample is zero", () => {
    assert.equal(
      releaseVelocity([
        { t: 0, y: 100 },
        { t: 50, y: 50 },
      ]),
      -1,
    );
    assert.equal(releaseVelocity([{ t: 5, y: 5 }]), 0);
    assert.equal(releaseVelocity([]), 0);
  });
});

describe("rubberBand", () => {
  test("starts near the finger, then stiffens, never past the dimension", () => {
    const small = rubberBand(10, VIEWPORT);
    assert.ok(small > 5 && small < 10, `10 px pulls ${small}`);
    const far = rubberBand(400, VIEWPORT);
    assert.ok(far < 400 * 0.55, `400 px pulls ${far}`);
    assert.ok(rubberBand(1e9, VIEWPORT) < VIEWPORT);
    assert.ok(rubberBand(200, VIEWPORT) > rubberBand(100, VIEWPORT));
  });

  test("keeps the sign, and nothing for nothing", () => {
    assert.equal(rubberBand(-50, VIEWPORT), -rubberBand(50, VIEWPORT));
    assert.equal(rubberBand(0, VIEWPORT), 0);
    assert.equal(rubberBand(50, 0), 0);
  });
});

describe("overshoot: the ends vaul hard-stops at", () => {
  test("up past the top snap", () => {
    assert.equal(
      overshoot({
        start: OFFSETS[HALF] ?? 0,
        dragged: -400,
        top: 0,
        bottom: 512,
      }),
      -88,
    );
    assert.equal(
      overshoot({
        start: OFFSETS[HALF] ?? 0,
        dragged: -200,
        top: 0,
        bottom: 512,
      }),
      0,
    );
  });

  test("down past the lowest stop of a sheet that cannot be dismissed", () => {
    assert.equal(
      overshoot({ start: 512, dragged: 30, top: 0, bottom: 512 }),
      30,
    );
    assert.equal(
      overshoot({
        start: 512,
        dragged: 300,
        top: 0,
        bottom: Number.POSITIVE_INFINITY,
      }),
      0,
    );
  });

  test("a content-sized sheet rests at 0, so both ends are 0", () => {
    assert.equal(overshoot({ start: 0, dragged: -12, top: 0, bottom: 0 }), -12);
    assert.equal(overshoot({ start: 0, dragged: 12, top: 0, bottom: 0 }), 12);
  });
});

describe("dragOwner: scroll handoff", () => {
  const list = (scrollTop: number) => ({
    scrollTop,
    scrollHeight: 2000,
    clientHeight: 500,
  });

  test("at scrollTop 0 a downward drag moves the sheet", () => {
    assert.equal(dragOwner(10, list(0)), "sheet");
  });

  test("scrolled down, a downward drag scrolls the list back", () => {
    assert.equal(dragOwner(10, list(1)), "content");
  });

  test("an upward drag scrolls the list until its end, then moves the sheet", () => {
    assert.equal(dragOwner(-10, list(0)), "content");
    assert.equal(dragOwner(-10, list(1499.5)), "sheet");
  });

  test("content that does not scroll never takes the drag", () => {
    assert.equal(
      dragOwner(-10, { scrollTop: 0, scrollHeight: 300, clientHeight: 300 }),
      "sheet",
    );
    assert.equal(dragOwner(10, null), "sheet");
  });
});

describe("reduced motion", () => {
  test("a sheet settles at once: no spring travel, instant snaps", () => {
    assert.equal(settleMs(true), 0);
    assert.equal(settleMs(false), VAUL_SETTLE_MS);
  });
});

describe("translateYOf", () => {
  test("reads vaul's translate3d", () => {
    assert.equal(translateYOf("translate3d(0, 312px, 0)"), 312);
    assert.equal(translateYOf("translate3d(0px, -4.5px, 0px)"), -4.5);
    assert.equal(translateYOf("translateY(20px)"), 20);
    assert.equal(translateYOf(""), null);
  });
});
