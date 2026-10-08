/**
 * `CheckInButton`'s menu and friend picker, driven through happy-dom: the
 * trigger opens a `menu` of `menuitem`s (e2e 04 picks "Just me" by role),
 * "Me and friends…" opens the picker, and closing the picker hands focus
 * back to "Check in" rather than dropping it on `<body>` (the menu item that
 * opened it is gone by then).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/cellars/c1",
  useSearchParams: () => new URLSearchParams(),
}));

/** A phone: no min-width query matches below 390. */
window.matchMedia = ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  return {
    matches: min !== null && 390 >= Number(min[1]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { CheckInButton } = await import("./CheckInButton");

// No exchanges: nothing is ever answered. These tests are about the
// controls, not the data.
const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const trigger = () => {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Check in"),
  );
  assert.ok(button, "a 'Check in' button");
  return button;
};
const openMenu = async () => {
  const button = trigger();
  await act(async () => {
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await flush(10);
};
const menuItem = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === name,
  );

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <Provider value={client}>
        <CheckInButton
          cellarId="c1"
          cellarItemId="ci1"
          itemName="Barolo 2016"
          viewerId="u1"
        />
      </Provider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("CheckInButton", () => {
  test("the trigger opens a menu: Just me, Me and friends…", async () => {
    await openMenu();
    assert.ok(document.querySelector('[role="menu"]'), "a menu is open");
    assert.ok(menuItem("Just me"));
    assert.ok(menuItem("Me and friends…"));
  });

  test("Just me checks in at once: the trigger is busy, no picker", async () => {
    await openMenu();
    const justMe = menuItem("Just me");
    assert.ok(justMe);
    await act(async () => {
      justMe.click();
    });
    await flush(50);
    assert.equal(trigger().getAttribute("aria-busy"), "true");
    assert.ok(trigger().disabled, "no second check-in while one is running");
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });

  test("Me and friends… opens the picker; closing it refocuses Check in", async () => {
    await openMenu();
    const friends = menuItem("Me and friends…");
    assert.ok(friends);
    await act(async () => {
      friends.click();
    });
    await flush(50);

    assert.equal(
      document.querySelector('[role="menu"]'),
      null,
      "the menu is gone",
    );
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "the picker is open");
    assert.match(dialog.textContent ?? "", /Who is drinking\?/);
    assert.match(dialog.textContent ?? "", /Barolo 2016/);

    const cancel = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancel",
    );
    assert.ok(cancel);
    await act(async () => {
      cancel.click();
    });
    await flush(600);

    // vaul keeps the closed sheet mounted for its exit; it is closed.
    assert.notEqual(
      document.querySelector('[role="dialog"]')?.getAttribute("data-state"),
      "open",
    );
    assert.equal(
      document.activeElement,
      trigger(),
      "focus returns to the button the picker was opened from",
    );
  });
});
