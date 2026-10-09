/**
 * `BottomSheet`'s `onClosed` runs once the sheet has closed, whichever way it
 * was closed — including the parent setting `open={false}`, which is how an
 * action row closes its sheet before opening a dialog (the item page's `⋯`:
 * Add to tier list, Edit item, Delete bottle). vaul's own `onAnimationEnd`
 * fires only for a close vaul started, so those rows used to do nothing.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
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
const { BottomSheet } = await import("./BottomSheet");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const render = async (open: boolean, onClosed: () => void) => {
  await act(async () => {
    root.render(
      <BottomSheet
        open={open}
        onOpenChange={() => {}}
        onClosed={onClosed}
        title="Actions"
      >
        <p>rows</p>
      </BottomSheet>,
    );
    await wait(20);
  });
};

describe("BottomSheet onClosed", () => {
  test("fires once after the parent closes it", async () => {
    let closed = 0;
    const onClosed = () => {
      closed += 1;
    };
    await render(true, onClosed);
    await render(false, onClosed);
    assert.equal(closed, 0, "not before the close transition");
    await act(async () => wait(650));
    assert.equal(closed, 1);
    await act(async () => wait(650));
    assert.equal(closed, 1, "only once");
  });

  test("never for a sheet that was never open, and not when reopened in time", async () => {
    let closed = 0;
    const onClosed = () => {
      closed += 1;
    };
    await render(false, onClosed);
    await act(async () => wait(650));
    assert.equal(closed, 0);
    await render(true, onClosed);
    await render(false, onClosed);
    await render(true, onClosed);
    await act(async () => wait(650));
    assert.equal(closed, 0);
  });
});
