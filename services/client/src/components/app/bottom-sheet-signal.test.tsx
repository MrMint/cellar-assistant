/**
 * The open-sheet signal (ux-c M5): while a `BottomSheet` is open, `<html>`
 * carries `data-sheet-open` and `--sheet-inset` (viewport bottom to the
 * topmost sheet's top edge, once it settles and on resize); both go when the
 * last sheet closes. Sheets stack, and the topmost wins.
 *
 * happy-dom does no layout, so each sheet's top edge is stubbed from a
 * `sheet-top-<px>` class the test passes through `className`.
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

let viewportHeight = 800;
Object.defineProperty(window, "innerHeight", {
  configurable: true,
  get: () => viewportHeight,
});
const realRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const match = /sheet-top-(\d+)/.exec(this.className);
  if (match === null) return realRect.call(this);
  const top = Number(match[1]);
  return {
    top,
    bottom: viewportHeight,
    left: 0,
    right: 390,
    width: 390,
    height: viewportHeight - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
};

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BottomSheet, SHEET_INSET_PROPERTY, SHEET_OPEN_ATTRIBUTE } =
  await import("./BottomSheet");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  viewportHeight = 800;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Past vaul's 0.5 s transition, when a sheet with no `transitionend` settles. */
const SETTLED_MS = 560;

const html = document.documentElement;
const isOpen = () => html.hasAttribute(SHEET_OPEN_ATTRIBUTE);
const inset = () => html.style.getPropertyValue(SHEET_INSET_PROPERTY);

const render = async (
  sheets: { lower: boolean; upper: boolean },
  settleMs = 0,
) => {
  await act(async () => {
    root.render(
      <>
        <BottomSheet
          open={sheets.lower}
          onOpenChange={() => {}}
          title="Lower"
          className="sheet-top-500"
        >
          <p>lower</p>
        </BottomSheet>
        <BottomSheet
          open={sheets.upper}
          onOpenChange={() => {}}
          title="Upper"
          className="sheet-top-200"
        >
          <p>upper</p>
        </BottomSheet>
      </>,
    );
    await wait(20);
  });
  // Passive effects flush as `act` exits, so the settle timer starts only
  // then: wait for it in an `act` of its own.
  if (settleMs > 0) await act(async () => wait(settleMs));
};

describe("BottomSheet open-sheet signal", () => {
  test("sets data-sheet-open on open, the inset once settled, and clears both on close", async () => {
    await render({ lower: false, upper: false });
    assert.equal(isOpen(), false);
    assert.equal(inset(), "");

    await render({ lower: true, upper: false });
    assert.equal(isOpen(), true);
    await act(async () => wait(SETTLED_MS));
    assert.equal(inset(), "300px");

    await render({ lower: false, upper: false });
    assert.equal(isOpen(), false);
    assert.equal(inset(), "");
  });

  test("settles early on the sheet's own transitionend", async () => {
    await render({ lower: true, upper: false });
    assert.equal(inset(), "");
    const sheet = document.querySelector('[data-slot="bottom-sheet"]');
    assert.ok(sheet !== null);
    await act(async () => {
      sheet.dispatchEvent(new Event("transitionend"));
    });
    assert.equal(inset(), "300px");
  });

  test("nested sheets: the topmost wins, and the one beneath is measured again when it closes", async () => {
    await render({ lower: true, upper: false }, SETTLED_MS);
    assert.equal(inset(), "300px");

    await render({ lower: true, upper: true }, SETTLED_MS);
    assert.equal(isOpen(), true);
    assert.equal(inset(), "600px");

    await render({ lower: true, upper: false });
    assert.equal(isOpen(), true);
    assert.equal(inset(), "300px");

    await render({ lower: false, upper: false });
    assert.equal(isOpen(), false);
    assert.equal(inset(), "");
  });

  test("closing the lower sheet first leaves the upper one published", async () => {
    await render({ lower: true, upper: true }, SETTLED_MS);
    assert.equal(inset(), "600px");
    await render({ lower: false, upper: true });
    assert.equal(isOpen(), true);
    assert.equal(inset(), "600px");
    await render({ lower: false, upper: false });
    assert.equal(isOpen(), false);
  });

  test("re-measures on resize", async () => {
    await render({ lower: true, upper: false }, SETTLED_MS);
    assert.equal(inset(), "300px");
    viewportHeight = 700;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    assert.equal(inset(), "200px");
  });

  test("unmounting an open sheet clears the signal", async () => {
    await render({ lower: true, upper: false }, SETTLED_MS);
    assert.equal(isOpen(), true);
    await act(async () => root.render(null));
    assert.equal(isOpen(), false);
    assert.equal(inset(), "");
  });
});
