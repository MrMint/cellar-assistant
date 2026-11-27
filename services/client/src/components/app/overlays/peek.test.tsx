/**
 * Quick look, the desktop pane and the hold that opens a peek (SPEC movement
 * 6, § Gestures; KIT § 2, § 4): where a release lands, Esc closes what is on
 * top, and focus goes back to the tile it opened from.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const router = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/cellars",
  useSearchParams: () => new URLSearchParams(),
}));

// happy-dom's Web Animations reject on cancel; the tests are about state,
// not frames, so motion jumps to its end.
const { MotionGlobalConfig } = await import("motion/react");
MotionGlobalConfig.skipAnimations = true;

const React = await import("react");
const { act, useState } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { QuickLook, counterLabel, quickLookRelease } = await import(
  "./QuickLook"
);
const { DesktopPane } = await import("./DesktopPane");
const { useHoldToPeek } = await import("./useHoldToPeek");
const { closeTopOnEscape, openLayers, resetLayers } = await import("./layers");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const byText = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLElement>("*")].find(
    (el) => el.children.length === 0 && el.textContent?.trim() === text,
  );

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

// Demo-seed names (services/actors/scripts/demo-seed-data.ts).
const ITEMS = [
  { id: "a", title: "Demo Cabernet", meta: "Red · 2019", href: "/wines/a" },
  { id: "b", title: "Demo Pilsner", meta: "Lager", href: "/beers/b" },
  { id: "c", title: "Demo Rye", meta: "Whiskey", href: "/spirits/c" },
];

describe("quick look release", () => {
  const size = { width: 360, height: 600 };
  const still = { x: 0, y: 0 };
  test("a step past 30 % of the width, either way", () => {
    assert.equal(quickLookRelease({ x: -120, y: 4 }, still, size), "next");
    assert.equal(quickLookRelease({ x: 120, y: 4 }, still, size), "previous");
    assert.equal(quickLookRelease({ x: -90, y: 0 }, still, size), "rest");
  });
  test("a sideways fling steps even when short", () => {
    assert.equal(
      quickLookRelease({ x: -30, y: 0 }, { x: -800, y: 0 }, size),
      "next",
    );
  });
  test("down past 30 % of the height, or a downward fling, dismisses", () => {
    assert.equal(quickLookRelease({ x: 0, y: 200 }, still, size), "dismiss");
    assert.equal(
      quickLookRelease({ x: 0, y: 40 }, { x: 0, y: 900 }, size),
      "dismiss",
    );
    assert.equal(quickLookRelease({ x: 0, y: -200 }, still, size), "rest");
  });
  test("the counter reads 3 of 240", () => {
    assert.equal(counterLabel(3, 240), "3 of 240");
  });
});

function Peek({ start = 0 }: { start?: number }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(start);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Tile
      </button>
      <QuickLook
        open={open}
        onOpenChange={setOpen}
        items={ITEMS}
        index={index}
        onIndexChange={setIndex}
        total={240}
        offset={10}
      />
    </>
  );
}

describe("QuickLook", () => {
  test("counter, name, Open page; arrows step; Esc closes and focus returns", async () => {
    await render(<Peek />);
    const tile = byText("Tile");
    assert.ok(tile);
    tile.focus();
    await act(async () => tile.click());
    await flush(10);
    const dialog = document.querySelector('[data-slot="quick-look"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("role"), "dialog");
    assert.ok(byText("11 of 240", dialog));
    assert.ok(byText("Demo Cabernet", dialog));
    const open = byText("Open page", dialog);
    assert.equal(open?.closest("a")?.getAttribute("href"), "/wines/a");
    assert.equal(
      dialog.querySelector<HTMLButtonElement>('[aria-label="Previous"]')
        ?.disabled,
      true,
    );
    assert.equal(openLayers(), 1, "registered for back");

    await act(async () => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    assert.ok(byText("Demo Pilsner"));
    assert.ok(byText("12 of 240"));

    await act(async () => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flush(50);
    assert.equal(document.querySelector('[data-slot="quick-look"]'), null);
    assert.equal(document.activeElement, tile, "focus is back on the tile");
    assert.equal(openLayers(), 0);
  });

  test("back closes it", async () => {
    await render(<Peek start={2} />);
    await act(async () => byText("Tile")?.click());
    await flush(10);
    assert.ok(document.querySelector('[data-slot="quick-look"]'));
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await flush(50);
    assert.equal(document.querySelector('[data-slot="quick-look"]'), null);
  });
});

describe("DesktopPane", () => {
  function Pane() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Tile
        </button>
        <DesktopPane
          open={open}
          onClose={() => setOpen(false)}
          title="Demo Cabernet"
          onNext={() => {}}
        >
          <p>body</p>
        </DesktopPane>
      </>
    );
  }

  test("440 region with its discs; Esc on top closes it and focus returns", async () => {
    await render(<Pane />);
    const tile = byText("Tile");
    assert.ok(tile);
    tile.focus();
    await act(async () => tile.click());
    const pane = container.querySelector('[data-slot="desktop-pane"]');
    assert.ok(pane);
    assert.match(pane.className, /\bw-110\b/);
    assert.equal(pane.getAttribute("aria-label"), "Demo Cabernet");
    assert.ok(pane.querySelector('[aria-label="Close"]'));
    assert.equal(
      pane.querySelector<HTMLButtonElement>('[aria-label="Previous"]')
        ?.disabled,
      true,
    );
    let closed = false;
    await act(async () => {
      closed = closeTopOnEscape();
    });
    assert.equal(closed, true);
    assert.equal(container.querySelector('[data-slot="desktop-pane"]'), null);
    assert.equal(document.activeElement, tile);
  });
});

describe("useHoldToPeek", () => {
  function Tile({ onPeek }: { onPeek: () => void }) {
    const { phase, handlers } = useHoldToPeek(onPeek);
    return (
      <button type="button" data-hold={phase} {...handlers}>
        Hold
      </button>
    );
  }
  const pointer = (type: string, x = 0, y = 0) =>
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
    });

  test("lifts at 150 ms and peeks at 400 ms, swallowing the click", async () => {
    let peeks = 0;
    let clicks = 0;
    await render(
      // biome-ignore lint/a11y/noStaticElementInteractions: the test counts the click a peek swallows.
      // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
      <div onClick={() => (clicks += 1)}>
        <Tile onPeek={() => (peeks += 1)} />
      </div>,
    );
    const button = byText("Hold")?.closest("button");
    assert.ok(button);
    await act(async () => button.dispatchEvent(pointer("pointerdown")));
    assert.equal(button.dataset.hold, "pressed");
    await flush(200);
    assert.equal(button.dataset.hold, "lifted");
    await flush(250);
    assert.equal(peeks, 1);
    await act(async () => button.dispatchEvent(pointer("pointerup")));
    await act(async () => button.click());
    assert.equal(clicks, 0, "the peek's click does not open the page");
    await act(async () => button.click());
    assert.equal(clicks, 1, "the next tap does");
  });

  test("moving past the slop ends it without a peek", async () => {
    let peeks = 0;
    await render(<Tile onPeek={() => (peeks += 1)} />);
    const button = byText("Hold")?.closest("button");
    assert.ok(button);
    await act(async () => button.dispatchEvent(pointer("pointerdown", 0, 0)));
    await act(async () => button.dispatchEvent(pointer("pointermove", 0, 14)));
    assert.equal(button.dataset.hold, "rest");
    await flush(450);
    assert.equal(peeks, 0);
  });
});
