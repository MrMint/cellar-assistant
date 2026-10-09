/**
 * X09 "Your bottles": the Pour sheet outlives the row it was opened from.
 *
 * Finishing a bottle from Pour takes it out of `myBottles` (bottles still in
 * the cellar) on the refresh that follows. The sheet must stay mounted — its
 * slider owns the finish's Undo toast — and must show the bottle finished,
 * not fall back to the tapped row's snapshot (open, at its old level), whose
 * slider would write a level to a finished bottle.
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
      <YourBottles itemType="TEA" itemName="Sencha" bottles={bottles} />,
    );
    await settle();
  });
};

const pourSheet = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((el) =>
    el.textContent?.includes("Pour"),
  );

describe("Your bottles' Pour sheet (X09)", () => {
  test("a bottle finished while poured stays in the sheet, finished", async () => {
    await render([open]);
    const pour = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Pour from Garage"]',
    );
    assert.ok(pour, "no Pour button");
    await act(async () => {
      pour.click();
      await settle();
    });
    assert.match(pourSheet()?.textContent ?? "", /Remaining: 60%/);

    // The refresh after "Finished" no longer lists it.
    await render([]);
    const sheet = pourSheet();
    assert.ok(sheet, "the Pour sheet went with the last row");
    assert.doesNotMatch(sheet.textContent ?? "", /Remaining: 60%/);
    assert.match(sheet.textContent ?? "", /Restore to cellar/);
    assert.equal(sheet.querySelector('[role="slider"]'), null);
    // And no section of bottles is drawn for an empty list.
    assert.equal(document.querySelector('[data-slot="your-bottle"]'), null);

    // Undo brings it back: the sheet follows the server again.
    await render([open]);
    assert.match(pourSheet()?.textContent ?? "", /Remaining: 60%/);
  });

  test("nothing is drawn with no bottles and no sheet open", async () => {
    await render([]);
    assert.equal(container.innerHTML, "");
  });
});
