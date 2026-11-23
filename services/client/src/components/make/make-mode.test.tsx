/**
 * L08 Make mode in a DOM: it is full screen inside the shell, not a second
 * `<main>` under the tab bar (CR-5), and its exits go back rather than
 * pushing the recipe again, so the next Back does not re-enter Make (CR-6).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recipes/r1/make" });
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

let calls: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => calls.push(`push ${href}`),
    replace: (href: string) => calls.push(`replace ${href}`),
    back: () => calls.push("back"),
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/recipes/r1/make",
  useSearchParams: () => new URLSearchParams(),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { MakeMode } = await import("./MakeMode");
const { recordNavigation } = await import("@/components/app/nav-history");
const { contentLayout, isFullScreenRoute } = await import(
  "@/components/app/AppShell"
);

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls = [];
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async () => {
  await act(async () => {
    root.render(
      <Provider
        value={
          new Client({
            url: "http://localhost/api/graphql",
            exchanges: [fetchExchange],
          })
        }
      >
        <MakeMode
          viewerId={null}
          recipe={{
            id: "r1",
            name: "Negroni",
            type: "cocktail",
            serving_size: 1,
            instructions: [
              { id: "i1", step_number: 1, instruction_text: "Stir with ice." },
              { id: "i2", step_number: 2, instruction_text: "Strain." },
            ],
            ingredients: [],
          }}
        />
      </Provider>,
    );
  });
};

const leaveButton = () => {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Leave Make mode"]',
  );
  if (button === null) throw new Error("no Leave button");
  return button;
};

describe("Make mode (L08)", () => {
  test("is not a second main landmark (CR-5)", async () => {
    await render();
    assert.equal(document.querySelectorAll("main").length, 0);
    assert.ok(document.querySelector('[data-slot="make-mode"]'));
    assert.doesNotMatch(container.innerHTML, /min-h-dvh/);
  });

  test("the shell gives it the whole screen: no tab bar, no padding (CR-5)", () => {
    assert.deepEqual(contentLayout("/recipes/r1/make"), {
      padded: false,
      scrolls: true,
      tabBar: false,
    });
    assert.equal(isFullScreenRoute("/recipes/r1/make"), true);
    assert.equal(isFullScreenRoute("/recap"), true);
    assert.equal(isFullScreenRoute("/recipes/r1"), false);
    assert.equal(contentLayout("/recipes/r1").tabBar, true);
  });

  test("Leave goes back when the recipe is behind it (CR-6)", async () => {
    recordNavigation("/recipes/r1");
    recordNavigation("/recipes/r1/make");
    await render();
    await act(async () => leaveButton().click());
    assert.deepEqual(calls, ["back"]);
  });

  test("Leave on a cold open replaces with the recipe, never pushes (CR-6)", async () => {
    await render();
    await act(async () => leaveButton().click());
    assert.deepEqual(calls, ["replace /recipes/r1"]);
  });
});
