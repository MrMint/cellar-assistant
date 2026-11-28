/**
 * F-139 (FR-5, amended): the Cellars board's switch reads "Cellars · Your
 * bar" (aria-label "Cellars or Your bar"), and Your bar goes to recipes.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, prefetch: () => {} }),
  usePathname: () => "/cellars",
  useSearchParams: () => new URLSearchParams(),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { CELLAR_SEGMENTS, CellarSegments } = await import("./CellarSegments");

describe("Cellars · Your bar (F-139)", () => {
  test("the board's words, and Your bar is recipes", () => {
    assert.deepEqual(
      CELLAR_SEGMENTS.map((s) => `${s.label} -> ${s.href}`),
      ["Cellars -> /cellars", "Your bar -> /recipes"],
    );
    const out = renderToStaticMarkup(<CellarSegments current="cellars" />);
    assert.match(out, /aria-label="Cellars or Your bar"/);
    assert.match(out, /<a[^>]*href="\/recipes"[^>]*>Your bar</);
  });
});
