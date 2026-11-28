import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { measureInsets } from "./useViewportInsets";

describe("measureInsets", () => {
  test("the rail's width and the tab bar's height, from the map's own box", () => {
    // 390x844 phone: no rail, a 49 px bar plus a 34 px home indicator.
    assert.deepEqual(measureInsets({ left: 0, bottom: 761 }, 844), {
      left: 0,
      bottom: 83,
    });
    // Desktop: an 80 px rail, no bar.
    assert.deepEqual(measureInsets({ left: 80, bottom: 900 }, 900), {
      left: 80,
      bottom: 0,
    });
  });

  test("rounds sub-pixel boxes and never goes negative", () => {
    assert.deepEqual(measureInsets({ left: 79.6, bottom: 905.2 }, 900), {
      left: 80,
      bottom: 0,
    });
    assert.deepEqual(measureInsets({ left: -3, bottom: 760.4 }, 844), {
      left: 0,
      bottom: 84,
    });
  });
});
