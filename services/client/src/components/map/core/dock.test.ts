import { describe, expect, it } from "bun:test";
import { DOCK_PEEK_PX, DOCK_REST_PX, dockHeights, dockRelease } from "./dock";

describe("dockHeights", () => {
  it("rests at two and a half rows and keeps a strip of map at full", () => {
    const h = dockHeights(800);
    expect(h.peek).toBe(DOCK_PEEK_PX);
    expect(h.rest).toBe(DOCK_REST_PX);
    expect(h.full).toBeLessThan(800);
    expect(h.full).toBeGreaterThan(h.rest);
  });

  it("never rests taller than the map allows on a short screen", () => {
    const h = dockHeights(420);
    expect(h.rest).toBeLessThan(420);
    expect(h.full).toBeGreaterThanOrEqual(h.rest);
  });
});

describe("dockRelease (SPEC § Gestures: snap by the projected position)", () => {
  const h = dockHeights(800);

  it("settles on the nearest detent when let go slowly", () => {
    expect(dockRelease(h.rest + 30, 0, h)).toBe("rest");
    expect(dockRelease(h.peek + 20, 0, h)).toBe("peek");
    expect(dockRelease(h.full - 40, 0, h)).toBe("full");
  });

  it("follows a fling past the next detent", () => {
    // Velocity is px/s, positive downward (the dock shrinks).
    expect(dockRelease(h.rest, -2000, h)).toBe("full");
    expect(dockRelease(h.rest, 2000, h)).toBe("peek");
  });
});
