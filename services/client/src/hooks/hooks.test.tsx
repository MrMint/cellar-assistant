/**
 * The restored `src/hooks/*` (pure ports of `82450ad1:src/hooks`). Effects do
 * not run in a server render, so these assert first-paint values — which is
 * what a hydration mismatch would be made of — plus the pure helpers and the
 * debounce, which runs outside render.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useAnimatedPlaceholder } from "./useAnimatedPlaceholder";
import { useColumnCount } from "./useColumnCount";
import { useDebouncedCallback } from "./useDebouncedCallback";
import { breakpointDown, breakpointUp, useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  test("breakpoint helpers keep the old pixel values", () => {
    assert.equal(breakpointUp("sm"), "(min-width: 600px)");
    assert.equal(breakpointUp("xl"), "(min-width: 1536px)");
    assert.equal(breakpointDown("md"), "(max-width: 1200px)");
  });

  test("first paint is false (no window match until the effect)", () => {
    function Probe() {
      return <>{String(useMediaQuery(breakpointUp("md")))}</>;
    }
    assert.equal(renderToStaticMarkup(<Probe />), "false");
  });
});

describe("useColumnCount", () => {
  test("below sm: one column for six or fewer items, else two", () => {
    function Probe({ n }: { n: number }) {
      return <>{useColumnCount(n)}</>;
    }
    assert.equal(renderToStaticMarkup(<Probe n={6} />), "1");
    assert.equal(renderToStaticMarkup(<Probe n={7} />), "2");
  });
});

describe("useAnimatedPlaceholder", () => {
  test("first paint is empty, so server and client agree", () => {
    function Probe() {
      return <>[{useAnimatedPlaceholder({ examples: ["a malbec"] })}]</>;
    }
    assert.equal(renderToStaticMarkup(<Probe />), "[]");
  });
});

describe("useDebouncedCallback", () => {
  test("collapses a burst into one trailing call with the last arguments", async () => {
    const calls: string[] = [];
    let debounced: ((value: string) => void) | undefined;
    function Probe() {
      debounced = useDebouncedCallback(
        (value: string) => calls.push(value),
        20,
      );
      return null;
    }
    renderToStaticMarkup(<Probe />);
    assert.ok(debounced);
    debounced("a");
    debounced("ab");
    debounced("abc");
    assert.deepEqual(calls, []);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(calls, ["abc"]);
  });
});
