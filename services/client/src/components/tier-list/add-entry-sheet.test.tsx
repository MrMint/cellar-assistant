/**
 * X16's Add entry in a DOM: the sheet opens on its sections without a
 * search, each row says why it is there, a row already on the board is
 * disabled, and two ticks are handed to the page as one add.
 */
import { mock } from "bun:test";
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

// L09: the placement step refreshes the page after its add.
mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, back() {}, refresh() {} }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));

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
let bands: (number | undefined)[] = [];
/** The picker searches sent through `client.query` (name, variables). */
let searches: { name: string; variables: Record<string, unknown> }[] = [];

beforeEach(() => {
  added = [];
  bands = [];
  searches = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

/**
 * The sheet's client: suggestions from the SSR cache, and every picker
 * search recorded and answered with no rows.
 */
const searchingClient = () => {
  const value = client();
  value.query = ((
    query: { definitions: { name?: { value: string } }[] },
    variables: Record<string, unknown>,
  ) => {
    const name = query.definitions[0]?.name?.value ?? "";
    searches.push({ name, variables });
    const data =
      name === "TierListPlacePicker"
        ? { placeSearch: { __typename: "PlaceSearchConnection", edges: [] } }
        : { itemSearch: { __typename: "ItemSearchConnection", edges: [] } };
    return { toPromise: async () => ({ data }) };
  }) as unknown as typeof value.query;
  return value;
};

const render = async (
  onList: ReadonlySet<string> = new Set(),
  listType = "wine",
) => {
  await act(async () => {
    root.render(
      <Provider value={searchingClient()}>
        <AddEntryModal
          open
          onClose={() => {}}
          onAdd={(rows, band) => {
            added.push(rows.map((row) => row.id));
            bands.push(band);
          }}
          busy={false}
          error={null}
          listType={listType}
          onList={onList}
          tierListId="tl-1"
          bandCounts={{ 5: 2, 4: 0, 3: 7, 2: 0, 1: 1 }}
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

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (el) => (el.getAttribute("aria-label") ?? el.textContent?.trim()) === name,
  );

describe("Adding places it (F-175)", () => {
  test("one pick: Add turns the sheet into its placing, nothing added blind", async () => {
    await render();
    await click(named("Rioja"));
    assert.equal(buttonNamed("Compare to place it"), undefined);
    await click(footer());
    assert.deepEqual(added, [], "added straight to Unrated");
    assert.ok(
      [...document.querySelectorAll("h2")].some(
        (h) => h.textContent === "Place Rioja",
      ),
      "no placing for the pick",
    );
  });

  test("several picks with an unrated one ask Which band? first, then add there", async () => {
    await render();
    await click(named("Rioja"));
    await click(named("Chianti"));
    await click(footer());
    assert.deepEqual(added, [], "added before a band was chosen");
    assert.ok(
      [...document.querySelectorAll("h2")].some(
        (h) => h.textContent === "Which band?",
      ),
      "no band step",
    );
    assert.match(document.body.textContent ?? "", /Rioja and 1 more/);
    const good = [
      ...document.querySelectorAll<HTMLElement>('[aria-label="Band"] button'),
    ].find((el) => /^Good\d/.test(el.textContent?.trim() ?? ""));
    assert.ok(good, "no Good row");
    assert.match(good?.textContent ?? "", /7/);
    await click(good as HTMLElement);
    assert.deepEqual(added, [["w2", "w3"]]);
    assert.deepEqual(bands, [3]);
  });

  test("the band step's back returns to the picks", async () => {
    await render();
    await click(named("Rioja"));
    await click(named("Chianti"));
    await click(footer());
    await click(buttonNamed("Back") as HTMLElement);
    assert.equal(named("Rioja").getAttribute("aria-checked"), "true");
  });
});

const type = async (text: string) => {
  const input = document.querySelector<HTMLInputElement>("form input");
  assert.ok(input, "no search field");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
  });
};

describe("Search as you type (F-177)", () => {
  test("typing searches without Enter, and one clear control", async () => {
    await render();
    await type("Kopi");
    assert.equal(searches.length, 1, "no search until Enter");
    assert.equal(searches[0]?.variables.text, "Kopi");
    const input = document.querySelector<HTMLInputElement>("form input");
    assert.notEqual(input?.type, "search", "the browser's own ✕ beside ours");
    assert.equal(
      document.querySelectorAll('[aria-label="Clear search"]').length,
      1,
    );
  });

  test("no match offers Add a new wine, carrying the words", async () => {
    await render();
    await type("Kopi");
    assert.match(document.body.textContent ?? "", /No wine matches “Kopi”/);
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Add a new wine",
    );
    assert.ok(link, "no Add a new wine");
    assert.equal(link?.getAttribute("href"), "/add?type=WINE&name=Kopi");
  });
});

describe("Cafés only (F-180)", () => {
  test("a place list's picker narrows a search to cafés", async () => {
    await render(new Set(), "place");
    const chip = buttonNamed("Cafés only");
    assert.ok(chip, "no café filter");
    await click(chip as HTMLElement);
    assert.equal(chip?.getAttribute("aria-pressed"), "true");
    await type("Kopi");
    const sent = searches.at(-1);
    assert.equal(sent?.name, "TierListPlacePicker");
    assert.ok(
      (sent?.variables.filterCategories as string[] | undefined)?.includes(
        "cafe",
      ),
      "the search was not narrowed",
    );
  });

  test("an item list has no café filter", async () => {
    await render();
    assert.equal(buttonNamed("Cafés only"), undefined);
  });
});
