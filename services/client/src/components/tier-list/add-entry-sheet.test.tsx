/**
 * X16's Add entry in a DOM: the sheet opens on its sections without a
 * search, each row says why it is there, a row already on the board is
 * disabled, and two ticks are handed to the page as one add.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/tier-lists/tl-1" });
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

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, createRequest, ssrExchange } = await import("urql");
const { AddEntryModal } = await import("./AddEntryModal");
const { SUGGESTIONS_PAGE_SIZE, TierListAddSuggestionsQuery } = await import(
  "./queries"
);

const wine = (id: string, name: string) => ({
  __typename: "Wine",
  id,
  type: "WINE",
  name,
  country: "ITALY",
  wineVariety: "NEBBIOLO",
  wineVintage: "2016-01-01",
});

const node = (over: Record<string, unknown>) => ({
  __typename: "TierListSuggestion",
  section: "TASTED",
  entryType: "WINE",
  myScore: null,
  cellarName: null,
  bottleCount: null,
  logCount: null,
  lastTastedAt: null,
  friendBand: null,
  friendCount: null,
  friend: null,
  place: null,
  ...over,
});

const client = () => {
  const { key } = createRequest(TierListAddSuggestionsQuery, {
    id: "tl-1",
    first: SUGGESTIONS_PAGE_SIZE,
  });
  const nodes = [
    node({
      section: "IN_CELLARS",
      cellarName: "Garage",
      bottleCount: 2,
      myScore: 4.5,
      item: wine("w1", "BAROLO"),
    }),
    node({
      section: "IN_CELLARS",
      cellarName: "Garage",
      bottleCount: 1,
      item: wine("w2", "Rioja"),
    }),
    node({
      section: "TASTED",
      logCount: 2,
      myScore: 3,
      item: wine("w3", "Chianti"),
    }),
    node({
      section: "FRIENDS_RANKED",
      friend: { __typename: "UserProfile", id: "u2", displayName: "Riley" },
      friendBand: 5,
      friendCount: 1,
      item: wine("w4", "Barbaresco"),
    }),
  ];
  return new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [key]: {
            data: JSON.stringify({
              tierList: {
                __typename: "TierList",
                id: "tl-1",
                addSuggestions: {
                  __typename: "TierListSuggestionConnection",
                  edges: nodes.map((n, i) => ({
                    __typename: "TierListSuggestionEdge",
                    cursor: String(i),
                    node: n,
                  })),
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
let added: string[][] = [];

beforeEach(() => {
  added = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async (onList: ReadonlySet<string> = new Set()) => {
  await act(async () => {
    root.render(
      <Provider value={client()}>
        <AddEntryModal
          open
          onClose={() => {}}
          onAdd={(rows) => added.push(rows.map((row) => row.id))}
          busy={false}
          error={null}
          listType="wine"
          onList={onList}
          tierListId="tl-1"
        />
      </Provider>,
    );
    await new Promise((r) => setTimeout(r, 0));
  });
};

const checkboxes = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
];
const named = (text: string) => {
  const found = checkboxes().find((el) => el.textContent?.includes(text));
  if (found === undefined) throw new Error(`no row ${text}`);
  return found;
};
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
  });
};
const footer = () => {
  const found = [...document.querySelectorAll("button")].find((el) =>
    /^(Add \d+ entr|Pick what to add)/.test(el.textContent?.trim() ?? ""),
  );
  if (found === undefined) throw new Error("no footer action");
  return found;
};

describe("Add entry without typing (X16)", () => {
  test("opens on its sections, each row saying why", async () => {
    await render();
    const headings = [...document.querySelectorAll("h3")].map(
      (h) => h.textContent,
    );
    assert.deepEqual(headings, [
      "In your cellars",
      "Tasted, not ranked",
      "Friends ranked",
    ]);
    assert.match(named("Barolo").textContent ?? "", /In Garage · 2 bottles/);
    assert.match(named("Barolo").textContent ?? "", /You 4.5 ·.*Outstanding/);
    assert.match(named("Chianti").textContent ?? "", /Logged twice/);
    assert.match(named("Barbaresco").textContent ?? "", /Riley: Outstanding/);
    assert.equal(footer().disabled, true);
  });

  test("two ticks are one add, in the order picked", async () => {
    await render();
    await click(named("Chianti"));
    await click(named("Barolo"));
    assert.equal(named("Barolo").getAttribute("aria-checked"), "true");
    assert.equal(footer().textContent?.trim(), "Add 2 entries");
    await click(named("Chianti"));
    await click(named("Chianti"));
    await click(footer());
    assert.deepEqual(added, [["w1", "w3"]]);
  });

  test("what is on the board is checked and disabled", async () => {
    await render(new Set(["/wines/w2"]));
    const rioja = named("Rioja");
    assert.equal(rioja.disabled, true);
    assert.match(rioja.textContent ?? "", /On this list/);
  });
});
