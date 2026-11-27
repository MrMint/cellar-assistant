/**
 * K2 · the place picker (Capture-Place 01 to 03): distances name their
 * origin, the guess and the nearby list read nearest first without
 * repeats, a search with no match says so, and a tap files under the
 * place tapped.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/add" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/add",
  useSearchParams: () => new URLSearchParams(),
}));

window.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

const { distanceFromYou, foundLine, kindOf, nearbyLine, noMatchLine } =
  await import("./place-words");

const NNBSP = " ";

describe("place words", () => {
  test("distances say where they are measured from", () => {
    assert.equal(distanceFromYou(10), "Here");
    assert.equal(distanceFromYou(24.9), "Here");
    assert.equal(distanceFromYou(63), `60${NNBSP}m from you`);
    assert.equal(distanceFromYou(1500), `1.5${NNBSP}km from you`);
    assert.equal(distanceFromYou(null), "");
    assert.equal(distanceFromYou(Number.NaN), "");
  });

  test("row lines", () => {
    assert.equal(nearbyLine("wine_bar", 10), "Wine bar · Here");
    assert.equal(nearbyLine(null, 140), `140${NNBSP}m from you`);
    assert.equal(
      foundLine("coffee_shop", "Demo Town"),
      "Coffee shop · Demo Town",
    );
    assert.equal(foundLine(null, null), "");
    assert.equal(noMatchLine("ruby"), "No place matches “ruby”");
    assert.equal(kindOf("coffee_shop"), "coffee");
    assert.equal(kindOf(null), "other");
  });
});

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { fetchExchange } = await import("@urql/core");
const { PlacePickerSheet } = await import("./PlacePickerSheet");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let searches: string[] = [];

const client = new Client({
  url: "http://localhost/graphql",
  exchanges: [fetchExchange],
  preferGetMethod: false,
  fetch: (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    searches.push(body.variables?.query);
    return new Response(
      JSON.stringify({
        data: {
          placeSearch: {
            __typename: "PlaceSearchConnection",
            edges: [],
          },
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch,
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  searches = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const GUESS = {
  id: "p-guess",
  name: "Demo Taproom",
  distanceMeters: 12,
  category: "brewery",
};
const NEARBY = [
  {
    id: "p-far",
    name: "Demo Wine Bar",
    distanceMeters: 300,
    category: "wine_bar",
  },
  GUESS,
  { id: "p-mid", name: "Demo Cafe", distanceMeters: 90, category: "cafe" },
];

const render = async (
  props: Partial<React.ComponentProps<typeof PlacePickerSheet>>,
) =>
  act(async () =>
    root.render(
      <Provider value={client}>
        <PlacePickerSheet
          open
          onOpenChange={() => {}}
          guess={GUESS}
          nearby={NEARBY}
          onChoose={() => {}}
          {...props}
        />
      </Provider>,
    ),
  );

const rows = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-slot="place-choice"]'),
  );

describe("PlacePickerSheet", () => {
  test("near you: nearest first, the guess once, distances from you", async () => {
    await render({});
    const text = document.body.textContent ?? "";
    assert.match(text, /Where’s this menu from\?/);
    assert.match(text, /Near you/);
    assert.deepEqual(
      rows().map((row) => row.textContent),
      [
        "Demo TaproomBrewery · Here",
        `Demo CafeCafe · 90${NNBSP}m from you`,
        `Demo Wine BarWine bar · 300${NNBSP}m from you`,
      ],
    );
  });

  test("a tap files under the place tapped, not the guess", async () => {
    const chosen: unknown[] = [];
    await render({ onChoose: (place) => chosen.push(place) });
    await act(async () => rows()[2]?.click());
    assert.deepEqual(chosen, [{ id: "p-far", name: "Demo Wine Bar" }]);
  });

  test("add a place: inline when offered, the full form otherwise", async () => {
    let added = 0;
    await render({ onAdd: () => added++ });
    const button = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Add a place",
    );
    assert.ok(button);
    await act(async () => button.click());
    assert.equal(added, 1);

    await render({ onAdd: undefined });
    const link = Array.from(document.querySelectorAll("a")).find(
      (a) => a.textContent === "Add a place",
    );
    assert.equal(link?.getAttribute("href"), "/map/create-place");
  });

  test("a search with no match says so", async () => {
    await render({});
    const input = document.querySelector<HTMLInputElement>(
      '[data-slot="place-picker"] input',
    );
    assert.ok(input);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "ruby");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    assert.deepEqual(searches, ["ruby"]);
    assert.match(document.body.textContent ?? "", /No place matches “ruby”/);
    assert.equal(rows().length, 0);
  });
});
