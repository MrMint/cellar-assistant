/**
 * `CheckInButton` through happy-dom (X02): the cellar overview's "Check in"
 * opens the drink-log sheet for that bottle — titled "Log a drink", naming the
 * item, with "Log it" — and closing it hands focus back to "Check in" rather
 * than dropping it on `<body>`. It used to be a menu of "Just me" and "Me and
 * friends…"; the sheet's empty "Log it" and its "Who with" are those two now.
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
          itemType="WINE"
          itemId="w1"
          itemName="Barolo 2016"
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
  test("is one button that opens a dialog, not a menu", () => {
    assert.equal(trigger().getAttribute("aria-haspopup"), "dialog");
    assert.equal(document.querySelector('[role="menu"]'), null);
  });

  test("opens 'Log a drink' for this item; Cancel closes it and refocuses Check in", async () => {
    const button = trigger();
    await act(async () => {
      button.focus();
      button.click();
    });
    await flush(50);

    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "the sheet is open");
    assert.match(dialog.textContent ?? "", /Log a drink/);
    assert.match(dialog.textContent ?? "", /Barolo 2016/);
    assert.ok(
      [...dialog.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Log it",
      ),
      "its one action is Log it",
    );

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
      "focus returns to the button the sheet was opened from",
    );
  });
});
