/**
 * X09 "Your bottles": Pour is X03's Pour sheet, and it outlives the row it
 * was opened from.
 *
 * The last pour finishes a bottle, which takes it out of `myBottles` (bottles
 * still in the cellar) on the refresh that follows. The sheet must stay
 * mounted — it goes on to the rating and the tier-list bands, and it owns the
 * finish's Undo toast — rather than go with the row, so it lives in the
 * page's `ItemActionsProvider`, above the rows.
 *
 * urql, the router and toasts are stood in for; the sheet is the real one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/teas/t-1" });
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

mock.module("urql", () => ({
  useQuery: () => [{ data: undefined, fetching: false }, () => {}],
  useMutation: () => [{}, async () => ({ data: undefined })],
  useClient: () => ({}),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
  }),
  usePathname: () => "/teas/t-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => message,
  dismissNotification: () => {},
  UNDO_TOAST_MS: 5000,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { YourBottles } = await import("./YourBottles");
const { ItemActionsProvider } = await import("./ItemActions");

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

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const open = {
  id: "b-1",
  cellarId: "c-1",
  cellarName: "Garage",
  openAt: "2026-10-01T00:00:00Z",
  emptyAt: null,
  percentageRemaining: 60,
};

const render = async (bottles: (typeof open)[]) => {
  await act(async () => {
    root.render(
      <ItemActionsProvider
        subject={{ itemType: "TEA", itemId: "t-1", itemName: "Sencha" }}
        defaultBottle={null}
      >
        <YourBottles itemType="TEA" itemName="Sencha" bottles={bottles} />
      </ItemActionsProvider>,
    );
    await settle();
  });
};

const pourSheet = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((el) =>
    el.textContent?.includes("Pour"),
  );

describe("Your bottles' Pour (X09 + X03)", () => {
  test("Pour opens X03's sheet, which outlives the bottle leaving the list", async () => {
    await render([open]);
    const pour = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Pour from Garage"]',
    );
    assert.ok(pour, "no Pour button");
    await act(async () => {
      pour.click();
      await settle();
    });
    const sheet = pourSheet();
    assert.ok(sheet, "no Pour sheet");
    // X03's sheet: the glass presets, and the pour button itself.
    assert.match(sheet.textContent ?? "", /Cup/);
    assert.ok(sheet.querySelector('[data-slot="pour-submit"]'));

    // The refresh after the last pour finished it no longer lists it.
    await render([]);
    assert.ok(pourSheet(), "the Pour sheet went with the last row");
    // And no section of bottles is drawn for an empty list.
    assert.equal(document.querySelector('[data-slot="your-bottle"]'), null);
  });

  test("nothing is drawn with no bottles and no sheet open", async () => {
    await render([]);
    assert.equal(document.querySelector('[data-slot="your-bottle"]'), null);
    assert.equal(document.querySelector("#your-bottles"), null);
    assert.equal(pourSheet(), undefined);
  });
});
