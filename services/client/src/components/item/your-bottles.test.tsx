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

// L02: the selected bottle's freshness reads this; Save lands in `updates`.
let queryData: unknown;
const updates: unknown[] = [];
mock.module("urql", () => ({
  useQuery: () => [{ data: queryData, fetching: false }, () => {}],
  useMutation: () => [
    {},
    async (variables: unknown) => {
      updates.push(variables);
      return {
        data: {
          updateCellarItem: { __typename: "CellarItem", id: "b-1" },
          checkIn: { __typename: "CheckIn", id: "k-1" },
          setCellarItemPercentage: undefined,
        },
      };
    },
  ],
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
const toasts: string[] = [];
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => {
    toasts.push(message);
    return message;
  },
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
  queryData = undefined;
  updates.length = 0;
  toasts.length = 0;
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

const render = async (bottles: (typeof open)[], selectedId?: string) => {
  await act(async () => {
    root.render(
      <ItemActionsProvider
        subject={{ itemType: "TEA", itemId: "t-1", itemName: "Sencha" }}
        defaultBottle={null}
      >
        <YourBottles
          itemType="TEA"
          itemName="Sencha"
          bottles={bottles}
          selectedId={selectedId}
        />
      </ItemActionsProvider>,
    );
    await settle();
  });
};

const pourSheet = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((el) =>
    /Pour|Steep/.test(el.textContent ?? ""),
  );

describe("Your bottles' Pour (X09 + X03)", () => {
  test("Pour opens X03's sheet, which outlives the bottle leaving the list", async () => {
    await render([open]);
    const pour = document.querySelector<HTMLButtonElement>(
      // W-20: a tea is steeped.
      'button[aria-label="Steep from Garage"]',
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

  test("no bottles: no rows, the empty card, and no sheet open", async () => {
    await render([]);
    assert.equal(document.querySelector('[data-slot="your-bottle"]'), null);
    assert.match(
      document.querySelector('[data-slot="your-bottles-empty"]')?.textContent ??
        "",
      /None in your cellar/,
    );
    assert.equal(pourSheet(), undefined);
  });
});

describe("Check in (Cellars-Bottles 03)", () => {
  test("the next bottle's Check in writes one check-in for it, then a toast with Undo", async () => {
    await render([open, { ...open, id: "b-2", openAt: null }]);
    const buttons = [...document.querySelectorAll("button")].filter(
      (b) => b.textContent === "Check in",
    );
    // One primary on the card: on the next bottle only.
    assert.equal(buttons.length, 1);
    await act(async () => {
      buttons[0]?.click();
      await settle();
    });
    assert.equal(updates.length, 1);
    const sent = updates[0] as { cellarId: string; cellarItemId: string };
    assert.equal(sent.cellarId, "c-1");
    assert.equal(sent.cellarItemId, "b-1");
    assert.deepEqual(toasts, ["Checked in"]);
  });

  test("a finished bottle offers no Check in", async () => {
    await render([{ ...open, emptyAt: "2026-10-02T00:00:00Z" }]);
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Check in",
      ),
      false,
    );
  });
});

const sealedRed = {
  cellar: {
    __typename: "Cellar",
    id: "c-1",
    item: {
      __typename: "CellarItem",
      id: "b-1",
      openAt: null,
      emptyAt: null,
      packagedOn: null,
      acquiredOn: "2026-01-10",
      drinkFrom: null,
      drinkUntil: null,
      priceAmount: null,
      priceCurrency: null,
      location: null,
      item: {
        __typename: "Wine",
        id: "w-1",
        type: "WINE",
        wineStyle: "RED",
        vintage: "2020-01-01",
      },
    },
  },
};

const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("the selected bottle's freshness (L02)", () => {
  test("its window, labelled typical, and its rows with Add", async () => {
    queryData = sealedRed;
    await render([{ ...open, openAt: null }], "b-1");
    const card = document.querySelector('[data-slot="drinking-window"]');
    assert.ok(card, "no drinking window");
    assert.match(card.textContent ?? "", /2022 – 2030/);
    assert.match(card.textContent ?? "", /typical for red wine/);
    const rows = document.querySelector('[data-slot="this-bottle"]');
    assert.match(rows?.textContent ?? "", /Bought10 Jan 2026/);
    assert.ok(document.querySelector('button[aria-label="Add price"]'));
    assert.match(rows?.textContent ?? "", /stay private/);
  });

  test("an unselected bottle draws none", async () => {
    queryData = sealedRed;
    await render([open]);
    assert.equal(
      document.querySelector('[data-slot="bottle-freshness"]'),
      null,
    );
  });

  test("Edit saves only what changed", async () => {
    queryData = sealedRed;
    await render([{ ...open, openAt: null }], "b-1");
    const add = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Add where it lives"]',
    );
    assert.ok(add);
    await act(async () => {
      add.click();
      await settle();
    });
    const where = document.querySelector<HTMLInputElement>("#fresh-location");
    assert.ok(where, "no sheet");
    await act(async () => {
      typeInto(where, "Rack B");
      await settle();
    });
    const save = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Save",
    );
    assert.ok(save);
    await act(async () => {
      save.click();
      await settle();
    });
    assert.deepEqual(updates, [
      { cellarId: "c-1", cellarItemId: "b-1", input: { location: "Rack B" } },
    ]);
  });
});
