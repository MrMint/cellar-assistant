/**
 * F-42: the desktop quick look on search results (Recipes-Search desktop):
 * J/K (↓ ↑) move a selection, Enter opens the drink or place in the pane
 * (or the page, for a row with no pane), O opens the page, and a plain click
 * on a drink's row opens the pane. On a phone, none of it. The pane bodies,
 * the router and the viewport are stood in; keys go through the app's own
 * `handleAppKey`.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/search?q=demo" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let wide = true;
const pushed: string[] = [];
const realMediaQuery = await import("@/hooks/useMediaQuery");
mock.module("@/hooks/useMediaQuery", () => ({
  ...realMediaQuery,
  useMediaQuery: () => wide,
}));
mock.module("@/components/app/useNavigate", () => ({
  useNavigate: () => ({ push: (href: string) => pushed.push(href) }),
}));
mock.module("@/lib/feedback", () => ({
  feedback: () => {},
  HapticOverlay: () => null,
}));
mock.module("@/components/app/overlays/DesktopPane", () => ({
  DesktopPane: (props: {
    title: string;
    onClose: () => void;
    children: unknown;
  }) => (
    <aside data-pane={props.title}>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
      {props.children as never}
    </aside>
  ),
}));
mock.module("@/components/item/ItemPane", () => ({
  ItemPane: (props: { itemId: string; cellarId?: string }) => (
    <p data-item-pane={props.itemId} data-cellar={props.cellarId ?? ""} />
  ),
}));
mock.module("@/components/map/places/PlacePane", () => ({
  PlacePane: (props: { placeId: string }) => (
    <p data-place-pane={props.placeId} />
  ),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { handleAppKey } = await import("@/components/app/overlays/app-keys");
const { SearchQuickLook } = await import("./SearchQuickLook");

import type { LookRow } from "../search-quick-look";

const rows: LookRow[] = [
  {
    key: "c1:b1",
    title: "Demo Red",
    href: "/cellars/c1/wines/b1",
    thumb: { kind: "item", itemType: "WINE" },
    look: { kind: "item", itemId: "w1", itemType: "WINE", cellarId: "c1" },
  },
  {
    key: "p1",
    title: "Demo Bar",
    href: "/places/p1",
    thumb: { kind: "icon", icon: "place" },
    look: { kind: "place", placeId: "p1" },
  },
  {
    key: "g1",
    title: "Demo Sour",
    href: "/recipes/groups/g1",
    thumb: { kind: "icon", icon: "recipe" },
  },
];

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const mount = async () => {
  await act(async () =>
    root.render(
      <SearchQuickLook rows={rows}>
        <ul>
          {rows.map((row) => (
            <li key={row.key} data-search-row={row.key}>
              <a href={row.href}>{row.title}</a>
            </li>
          ))}
        </ul>
      </SearchQuickLook>,
    ),
  );
};

const press = async (key: string) => {
  let handled = false;
  await act(async () => {
    handled = handleAppKey(
      {
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: document.body,
        preventDefault: () => {},
      },
      {
        navigate: () => {},
        openKeys: () => {},
        openMore: () => {},
        focusSearch: () => true,
      },
      { armed: false },
    );
    await new Promise((r) => setTimeout(r, 10));
  });
  return handled;
};

const selected = () =>
  [...container.querySelectorAll("[data-search-selected]")].map((element) =>
    element.getAttribute("data-search-row"),
  );

beforeEach(() => {
  wide = true;
  pushed.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

after(async () => {
  await GlobalRegistrator.unregister();
});

describe("SearchQuickLook · keys (F-42)", () => {
  test("J and K move the selection, holding at the ends", async () => {
    await mount();
    assert.equal(await press("j"), true);
    assert.deepEqual(selected(), ["c1:b1"]);
    await press("j");
    assert.deepEqual(selected(), ["p1"]);
    await press("ArrowDown");
    await press("ArrowDown");
    assert.deepEqual(selected(), ["g1"]);
    await press("k");
    assert.deepEqual(selected(), ["p1"]);
  });

  test("Enter opens the drink in the pane, J moves the pane on", async () => {
    await mount();
    await press("j");
    await press("Enter");
    const item = container.querySelector("[data-item-pane]");
    assert.equal(item?.getAttribute("data-item-pane"), "w1");
    assert.equal(item?.getAttribute("data-cellar"), "c1");
    await press("j");
    assert.equal(
      container
        .querySelector("[data-place-pane]")
        ?.getAttribute("data-place-pane"),
      "p1",
    );
    // A recipe has no pane body: moving onto it closes the pane.
    await press("j");
    assert.equal(container.querySelector("[data-pane]"), null);
    assert.deepEqual(pushed, []);
  });

  test("Enter on a row with no pane opens its page; O opens any page", async () => {
    await mount();
    await press("k");
    await press("Enter");
    assert.deepEqual(pushed, ["/recipes/groups/g1"]);
    await press("k");
    await press("o");
    assert.deepEqual(pushed, ["/recipes/groups/g1", "/places/p1"]);
  });

  test("Enter with nothing selected is left to the app", async () => {
    await mount();
    assert.equal(await press("Enter"), false);
  });

  test("the pane's Close closes it", async () => {
    await mount();
    await press("j");
    await press("Enter");
    const close = container.querySelector("[data-pane] button");
    await act(async () => (close as HTMLElement).click());
    assert.equal(container.querySelector("[data-pane]"), null);
  });
});

describe("SearchQuickLook · clicks (F-42)", () => {
  const click = async (selector: string, init: MouseEventInit = {}) => {
    const link = container.querySelector(selector);
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    await act(async () => {
      link?.dispatchEvent(event);
      await new Promise((r) => setTimeout(r, 10));
    });
    return event.defaultPrevented;
  };

  test("a plain click on a drink's row opens the pane instead of the page", async () => {
    await mount();
    assert.equal(await click('a[href="/places/p1"]'), true);
    assert.ok(container.querySelector('[data-place-pane="p1"]'));
    assert.deepEqual(selected(), ["p1"]);
  });

  test("a modified click, or a row with no pane, is the link's", async () => {
    await mount();
    assert.equal(await click('a[href="/places/p1"]', { metaKey: true }), false);
    assert.equal(await click('a[href="/recipes/groups/g1"]'), false);
    assert.equal(container.querySelector("[data-pane]"), null);
  });

  test("on a phone: no keys and no pane", async () => {
    wide = false;
    await mount();
    assert.equal(await press("j"), false);
    assert.equal(await click('a[href="/places/p1"]'), false);
    assert.equal(container.querySelector("[data-pane]"), null);
  });
});
