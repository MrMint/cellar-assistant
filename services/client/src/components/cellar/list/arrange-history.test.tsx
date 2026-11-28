/**
 * F-136 (W1-1): choosing in Arrange closes the sheet, and the sheet's Back
 * must not take the choice with it. The sheet's history entry is popped
 * asynchronously (as browsers do), so the choice may only be written once
 * that pop has landed on the page's own entry: written earlier, it lands on
 * the sheet's entry and is popped away with it.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/items" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ArrangeSheet } = await import("./ArrangeSheet");
const { resetLayers } = await import("@/components/app/overlays/layers");

/** A history whose Back pops a tick later, as a browser's does. */
const fakeHistory = () => {
  const entries: { state: unknown }[] = [{ state: null }];
  let index = 0;
  const h = window.history;
  const define = (name: string, value: unknown) =>
    Object.defineProperty(h, name, {
      configurable: true,
      writable: true,
      value,
    });
  Object.defineProperty(h, "state", {
    configurable: true,
    get: () => entries[index]?.state ?? null,
  });
  define("pushState", (state: unknown) => {
    entries.splice(index + 1);
    entries.push({ state });
    index += 1;
  });
  define("replaceState", (state: unknown) => {
    entries[index] = { state };
  });
  define("back", () => {
    setTimeout(() => {
      if (index === 0) return;
      index -= 1;
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 1);
  });
  return {
    get index() {
      return index;
    },
  };
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  resetLayers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

const byLabel = (name: string) =>
  [...document.querySelectorAll<HTMLElement>("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  );

describe("Arrange (F-136)", () => {
  test("a sort chosen in the sheet is written after the sheet's entry is gone", async () => {
    const history = fakeHistory();
    const written: { value: string; atEntry: number }[] = [];
    await act(async () =>
      root.render(
        <ArrangeSheet
          arrangement="a-z"
          onArrangementChange={(value) =>
            written.push({ value, atEntry: history.index })
          }
          status="in-cellar"
          onStatusChange={(value) =>
            written.push({ value, atEntry: history.index })
          }
          statusCounts={{ "in-cellar": 3, finished: 1, all: 4 }}
          onJump={() => {}}
          searching={false}
        />,
      ),
    );
    await act(async () => byLabel("Arrange: Name, A to Z")?.click());
    await settle();
    assert.equal(history.index, 1, "the open sheet has its entry");
    const maker = byLabel("By maker");
    assert.ok(maker, "the sheet shows its rows");
    await act(async () => maker.click());
    await settle();
    assert.deepEqual(written, [{ value: "maker", atEntry: 0 }]);

    // Show: the same path from the segmented control.
    await act(async () => byLabel("Arrange: Name, A to Z")?.click());
    await settle();
    const finished = [
      ...document.querySelectorAll<HTMLElement>("[role=radio], button"),
    ].find((b) => b.textContent?.startsWith("Finished"));
    assert.ok(finished, "the Show strip shows its segments");
    await act(async () => finished.click());
    await settle();
    assert.deepEqual(written.at(-1), { value: "finished", atEntry: 0 });
  });
});
