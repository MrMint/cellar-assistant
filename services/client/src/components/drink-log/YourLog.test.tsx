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
    assert.match(text, /4\.5/);
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
