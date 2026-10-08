import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  demandsMoreThan,
  gutterOffenders,
  horizontalOverflow,
  sitsAbove,
} from "./mobile-rules.ts";

/**
 * Unit tests for the rules the mobile Playwright specs apply. Plain
 * `node --test` (Node 24 strips the types), because this package has no unit
 * runner and the rules must stay import-free anyway (see `mobile-rules.ts`).
 */

const at = (left: number, right: number) => ({
  left,
  right,
  top: 0,
  bottom: 10,
});

describe("gutterOffenders", () => {
  it("accepts content that keeps exactly the gutter", () => {
    assert.deepEqual(
      gutterOffenders([{ label: "ok", edges: at(16, 359) }], 375, 16),
      [],
    );
  });

  it("tolerates sub-pixel layout rounding", () => {
    assert.deepEqual(
      gutterOffenders([{ label: "ok", edges: at(15.6, 359.4) }], 375, 16),
      [],
    );
  });

  it("names a field that touches the left edge (observation 15)", () => {
    const offenders = gutterOffenders(
      [{ label: 'textbox "Search"', edges: at(0, 300) }],
      375,
      16,
    );
    assert.equal(offenders.length, 1);
    assert.match(offenders[0] ?? "", /^textbox "Search": left 0 \/ right 300/);
    assert.match(offenders[0] ?? "", /needs 16\.\.359/);
  });

  it("names a button pushed past the right edge, and only it", () => {
    const offenders = gutterOffenders(
      [
        { label: "fine", edges: at(20, 200) },
        { label: 'button "Add item"', edges: at(290, 412) },
      ],
      375,
      16,
    );
    assert.equal(offenders.length, 1);
    assert.match(offenders[0] ?? "", /^button "Add item"/);
  });
});

describe("sitsAbove", () => {
  const nav = { left: 0, right: 390, top: 794, bottom: 844 };

  it("is true when the element ends where the nav starts", () => {
    assert.equal(sitsAbove({ ...nav, top: 770, bottom: 794 }, nav), true);
  });

  it("is false for the attribution measured under the nav (observation 59)", () => {
    assert.equal(sitsAbove({ ...nav, top: 805, bottom: 829 }, nav), false);
  });
});

describe("horizontalOverflow", () => {
  it("is zero when the content fits", () => {
    assert.equal(horizontalOverflow({ scrollWidth: 375, clientWidth: 375 }), 0);
  });

  it("is the overhang when it does not", () => {
    assert.equal(
      horizontalOverflow({ scrollWidth: 412, clientWidth: 375 }),
      37,
    );
  });
});

describe("demandsMoreThan", () => {
  const vga = { width: 640, height: 480 };

  it("reports the old CameraCapture constraints as unsatisfiable (observation 25)", () => {
    assert.equal(
      demandsMoreThan(
        {
          width: { ideal: 1920, min: 1080 },
          height: { ideal: 1920, min: 1080 },
          aspectRatio: 1,
          facingMode: "environment",
        },
        vga,
      ),
      "width",
    );
  });

  it("accepts ideal-only constraints, however large", () => {
    assert.equal(
      demandsMoreThan(
        { width: { ideal: 1920 }, height: { ideal: 1920 }, aspectRatio: 1 },
        vga,
      ),
      null,
    );
  });

  it("treats a bare number as ideal, as getUserMedia does", () => {
    assert.equal(demandsMoreThan({ width: 1920, height: 1080 }, vga), null);
  });

  it("rejects an exact size the camera does not have", () => {
    assert.equal(demandsMoreThan({ height: { exact: 720 } }, vga), "height");
    assert.equal(demandsMoreThan({ height: { exact: 480 } }, vga), null);
  });

  it("accepts `video: true` and an absent video constraint", () => {
    assert.equal(demandsMoreThan(true, vga), null);
    assert.equal(demandsMoreThan(undefined, vga), null);
  });
});
