/**
 * X08's want-to-go badge must sit wholly inside the pin sprite: anything past
 * the viewBox is clipped flat when the SVG is rasterised.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PIN_VIEWBOX, WANT_BADGE, wantBadgeSVG } from "./iconLoader";

describe("the want-to-go badge (X08)", () => {
  test("its disc, stroke included, stays inside the pin's viewBox", () => {
    const outer = WANT_BADGE.r + WANT_BADGE.stroke / 2;
    assert.ok(WANT_BADGE.cx - outer >= 0, "left edge");
    assert.ok(WANT_BADGE.cy - outer >= 0, "top edge");
    assert.ok(WANT_BADGE.cx + outer <= PIN_VIEWBOX.width, "right edge");
    assert.ok(WANT_BADGE.cy + outer <= PIN_VIEWBOX.height, "bottom edge");
  });

  test("the drawn circle is the one measured", () => {
    assert.match(
      wantBadgeSVG(),
      new RegExp(
        `<circle cx="${WANT_BADGE.cx}" cy="${WANT_BADGE.cy}" r="${WANT_BADGE.r}"[^>]*stroke-width="${WANT_BADGE.stroke}"`,
      ),
    );
  });
});
