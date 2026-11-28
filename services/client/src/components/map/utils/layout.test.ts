import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DETAIL_PANEL_WIDTH, drawerOffsetFor } from "./layout";

describe("drawerOffsetFor", () => {
  test("the desktop panel is the kit's 440 px DesktopPane (F-194)", () => {
    assert.equal(DETAIL_PANEL_WIDTH, 440);
    assert.deepEqual(
      drawerOffsetFor({
        isDesktop: true,
        hasSidebar: true,
        viewportHeight: 900,
        insets: { left: 80, bottom: 0 },
      }),
      [220, 0],
    );
  });

  test("measured desktop: the panel covers the map's first 440 px, whatever the rail", () => {
    // The map starts beside the 80 px SideRail; so does the panel.
    assert.deepEqual(
      drawerOffsetFor({
        isDesktop: true,
        hasSidebar: true,
        viewportHeight: 900,
        insets: { left: 80, bottom: 0 },
      }),
      [DETAIL_PANEL_WIDTH / 2, 0],
    );
  });

  test("measured phone: the half sheet covers the bottom half of the map above the tab bar", () => {
    // 390x844: the map ends 83 px up (49 px bar + 34 px home indicator), so
    // it is 761 px tall and the half sheet 380.5 px; the visible top part's
    // centre is 190.25 px above the map's.
    assert.deepEqual(
      drawerOffsetFor({
        isDesktop: false,
        hasSidebar: false,
        viewportHeight: 844,
        insets: { left: 0, bottom: 83 },
      }),
      [0, -190.25],
    );
  });

  test("before the first measurement: the old shell's 56 px rail and 50 px bar", () => {
    assert.deepEqual(
      drawerOffsetFor({
        isDesktop: true,
        hasSidebar: true,
        viewportHeight: 900,
        insets: null,
      }),
      [(56 + DETAIL_PANEL_WIDTH) / 2, 0],
    );
    assert.deepEqual(
      drawerOffsetFor({
        isDesktop: false,
        hasSidebar: false,
        viewportHeight: 850,
      }),
      [0, -(50 + 400) / 2],
    );
  });
});
