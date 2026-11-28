/**
 * The nav-history tracker records a page in the commit that shows it (E-6).
 *
 * In a commit that runs a View Transition, React holds passive effects back
 * until the transition's `finished` promise settles — the whole slide. A
 * tracker in `useEffect` therefore recorded `/cellars/7` only once the slide
 * ended, and a browser Back during it read a stack whose top was still
 * `/cellars`: `popKind` said `none` and the pop played no motion. Recording
 * in a layout effect puts the page on the stack in the same commit as the
 * URL. The probe below is a later sibling's layout effect, which runs after
 * every earlier layout effect of the commit and before any passive one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof window === "undefined") {
  GlobalRegistrator.register({ url: "http://localhost/" });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/cellars/7";
mock.module("next/navigation", () => ({
  useRouter: () => ({}),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { readNavStack, useNavHistoryTracker } = await import("./nav-history");

describe("useNavHistoryTracker", () => {
  test("the page is on the stack by the commit's layout phase", async () => {
    window.sessionStorage.setItem("ca:nav-stack", JSON.stringify(["/cellars"]));
    pathname = "/cellars/7";
    let seenInLayout: string[] = [];
    const Tracker = () => {
      useNavHistoryTracker();
      return null;
    };
    const Probe = () => {
      React.useLayoutEffect(() => {
        seenInLayout = readNavStack();
      });
      return null;
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Tracker),
          React.createElement(Probe),
        ),
      ),
    );
    assert.deepEqual(seenInLayout, ["/cellars", "/cellars/7"]);
    await act(async () => root.unmount());
    container.remove();
    window.sessionStorage.removeItem("ca:nav-stack");
  });
});
