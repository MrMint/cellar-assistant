/**
 * `bandOf`'s two boundaries, directly. §2.1: "AI verification in the 0.4–0.9
 * band" — inclusive at both ends, so `0.9` is auto and `0.4` is verified.
 * Changing either `>=` to `>` used to survive every suite in the repo.
 */
import { describe, expect, it } from "vitest";
import {
  bandOf,
  MATCH_AUTO_CONFIDENCE,
  MATCH_MIN_CONFIDENCE,
} from "./menu-scans.ts";

describe("bandOf", () => {
  it("is auto at exactly 0.9, and verify just below it", () => {
    expect(MATCH_AUTO_CONFIDENCE).toBe(0.9);
    expect(bandOf(0.9)).toBe("auto");
    expect(bandOf(1)).toBe("auto");
    expect(bandOf(0.8999)).toBe("verify");
  });

  it("is verify at exactly 0.4, and drop just below it", () => {
    expect(MATCH_MIN_CONFIDENCE).toBe(0.4);
    expect(bandOf(0.4)).toBe("verify");
    expect(bandOf(0.3999)).toBe("drop");
    expect(bandOf(0)).toBe("drop");
  });
});
