/**
 * "Your log" (D8) in a DOM (happy-dom): an empty log offers exactly one
 * action; an entry reads as its date, this glass's score, the note, its
 * flavours, and who with and where on one line; only an entry the viewer may
 * change gets the row's ⋯. Answered by an `ssrExchange` keyed on the exact
 * query and variables the section sends.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/w1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/wines/w1",
  useSearchParams: () => new URLSearchParams(),
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, createRequest, ssrExchange } = await import("urql");
const { YourLog } = await import("./YourLog");
const { ItemDrinkLogQuery } = await import("./queries");
const { useOverlayLayer, resetLayers } = await import(
  "@/components/app/overlays/layers"
);

const entry = (over: Record<string, unknown>) => ({
  __typename: "ItemCheckIn",
  id: "l1",
  createdAt: "2026-10-01T19:00:00.000Z",
  score: 4.5,
  note: "Dark cherry, a little smoke",
  tags: ["cherry", "smoky"],
  isMine: true,
  canRemove: true,
  fromCellar: false,
  companionIds: ["u2"],
  user: {
    __typename: "UserProfile",
    id: "u1",
    displayName: "Me",
    avatarUrl: null,
  },
  companions: {
    __typename: "UserProfileConnection",
    edges: [
      {
        __typename: "UserProfileEdge",
        node: {
          __typename: "UserProfile",
          id: "u2",
          displayName: "Sam",
          avatarUrl: null,
        },
      },
    ],
  },
  place: {
    __typename: "Place",
    id: "p1",
    name: "corner",
    displayName: "The Corner Bar",
  },
  photo: null,
  ...over,
});

const answering = (nodes: unknown[]) => {
  const { key } = createRequest(ItemDrinkLogQuery, {
    type: "WINE",
    itemId: "w1",
    first: 20,
  });
  return new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [key]: {
            data: JSON.stringify({
              item: {
                __typename: "QueryItemSuccess",
                data: {
                  __typename: "Wine",
                  id: "w1",
                  checkIns: {
                    __typename: "ItemCheckInConnection",
                    totalCount: nodes.length,
                    edges: nodes.map((node) => ({
                      __typename: "ItemCheckInEdge",
                      node,
                    })),
                  },
                },
              },
            }),
          },
        },
      }),
    ],
  });
};

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

const mount = async (nodes: unknown[]) => {
  await act(async () =>
    root.render(
      <Provider value={answering(nodes)}>
        <YourLog
          subject={{ itemType: "WINE", itemId: "w1", itemName: "Barolo" }}
        />
      </Provider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};

const buttons = (name: string) =>
  [...container.querySelectorAll("button")].filter(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
  );

describe("YourLog", () => {
  test("empty: one line, one action", async () => {
    await mount([]);
    assert.match(container.textContent ?? "", /Your log/);
    assert.match(container.textContent ?? "", /Nothing logged yet/);
    assert.equal(buttons("Log a drink").length, 1);
  });

  test("an entry: score, note, flavours, who with and where", async () => {
    await mount([entry({})]);
    const row = container.querySelector('[data-slot="drink-log-entry"]');
    assert.ok(row);
    const text = row.textContent ?? "";
    // F2b's history row carries the event: the owner's rating, in gold.
    const event = row.previousElementSibling;
    assert.equal(event?.getAttribute("data-slot"), "history-row");
    assert.match(event?.textContent ?? "", /Rated 4\.5/);
    assert.match(text, /Dark cherry, a little smoke/);
    assert.match(text, /cherry/);
    assert.match(text, /smoky/);
    assert.match(text, /with Sam · at The Corner Bar/);
    assert.equal(buttons("More for this log").length, 1);
    // With entries, "Log a drink" moves to the section's header.
    assert.equal(buttons("Log a drink").length, 1);
  });

  test("an entry the viewer may neither edit nor remove has no ⋯", async () => {
    await mount([entry({ isMine: false, canRemove: false })]);
    assert.equal(buttons("More for this log").length, 0);
  });
});

/**
 * F-167 (CE-2, H-11): Your log's ⋯ → Edit closes one sheet and opens the
 * next in the same commit, and a row that navigates leaves from inside a
 * sheet. Neither may leave a dead history entry behind. A fake history
 * with an asynchronous Back, as browsers have.
 */
type Entry = { state: unknown; url: string };
const fakeHistory = () => {
  const entries: Entry[] = [{ state: null, url: "/wines/w1" }];
  let index = 0;
  const h = window.history;
  const define = (name: string, value: unknown) =>
    Object.defineProperty(h, name, {
      configurable: true,
      writable: true,
      value,
    });
  Object.defineProperty(h, "state", {
    configurable: true,
    get: () => entries[index]?.state ?? null,
  });
  define("pushState", (state: unknown, _t: string, url?: string) => {
    entries.splice(index + 1);
    entries.push({ state, url: url ?? entries[index]?.url ?? "" });
    index += 1;
  });
  define("replaceState", (state: unknown, _t: string, url?: string) => {
    entries[index] = { state, url: url ?? entries[index]?.url ?? "" };
  });
  define("back", () => {
    setTimeout(() => {
      if (index === 0) return;
      index -= 1;
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 1);
  });
  return {
    get index() {
      return index;
    },
    get length() {
      return entries.length;
    },
  };
};

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

function TwoSheets({ a, b }: { a: boolean; b: boolean }) {
  useOverlayLayer(a, () => {});
  useOverlayLayer(b, () => {});
  return null;
}

describe("sheet history (F-167)", () => {
  test("⋯ → Edit → Cancel leaves no dead entry: Back then leaves the page", async () => {
    resetLayers();
    const history = fakeHistory();
    await act(async () => root.render(<TwoSheets a b={false} />));
    assert.equal(history.index, 1, "the menu sheet pushed its entry");
    // Edit: the menu closes and the edit sheet opens in one commit.
    await act(async () => root.render(<TwoSheets a={false} b />));
    await settle();
    assert.equal(history.index, 1, "one entry, the edit sheet's");
    assert.equal(
      (window.history.state as Record<string, unknown> | null)?.caOverlay !==
        undefined,
      true,
      "the current entry is the open sheet's",
    );
    // Cancel: the edit sheet closes and takes its entry back off.
    await act(async () => root.render(<TwoSheets a={false} b={false} />));
    await settle();
    assert.equal(history.index, 0, "back at the page's own entry");
  });

  test("a row that navigates from a sheet leaves no entry behind", async () => {
    resetLayers();
    const history = fakeHistory();
    await act(async () => root.render(<TwoSheets a b={false} />));
    // The row's navigation: the router pushes the next page.
    window.history.pushState({ __NA: true }, "", "/places/p1");
    await act(async () => root.render(<TwoSheets a={false} b={false} />));
    await settle();
    assert.equal(history.length, 2, "the page, then the place: no sheet entry");
    assert.equal(history.index, 1);
  });
});
