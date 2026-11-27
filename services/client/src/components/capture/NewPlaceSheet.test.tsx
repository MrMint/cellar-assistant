/**
 * The new place sheet (L10: scan anywhere), split from `capture-ui.test.tsx`
 * so K2 owns it: prefilled from the nearest listing, created only on the
 * confirm, and the budget's no.
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
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/wines/w1",
  useSearchParams: () => new URLSearchParams(),
}));

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

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
let refuseAdd = false;
/** L10: what the Google nearby read answers — a listing, or the budget's no. */
let nearbyBudgetExhausted = false;
/** L02: bottles of the item after the add (status ALL), and how late it lands. */
let historyBottles = 0;
let historyDelayMs = 0;
globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
  const operationName =
    body.operationName ??
    /(?:mutation|query)\s+(\w+)/.exec(body.query ?? "")?.[1] ??
    "";
  const variables = body.variables ?? {};
  sent.push({ operationName, variables });
  const input = variables.input as { cellarItemId?: string } | undefined;
  const placeInput = variables.input as { placeId?: string } | undefined;
  if (operationName === "ItemBottleHistory" && historyDelayMs > 0) {
    await new Promise((r) => setTimeout(r, historyDelayMs));
  }
  const data =
    operationName === "ItemBottleHistory"
      ? {
          item: {
            __typename: "QueryItemSuccess",
            data: {
              __typename: "Wine",
              id: "w1",
              name: "Ridge",
              myBottles: { totalCount: historyBottles },
            },
          },
        }
      : operationName === "MapGooglePlaceSuggestions"
        ? {
            googlePlaceSuggestions: {
              charged: !nearbyBudgetExhausted,
              reason: nearbyBudgetExhausted ? "monthly budget reached" : null,
              suggestions: {
                edges: nearbyBudgetExhausted
                  ? []
                  : [
                      {
                        node: {
                          googlePlaceId: "g-1",
                          name: "Bar Lumen",
                          secondaryText: "1 Main St",
                          types: ["bar", "point_of_interest"],
                          location: { lat: 37.7749, lng: -122.4194 },
                        },
                      },
                    ],
              },
            },
          }
        : operationName === "MapCreatePlace"
          ? {
              createPlace: {
                __typename: "CreatePlacePayload",
                place: {
                  id: placeInput?.placeId ?? "p-new",
                  reviewStatus: "PENDING",
                },
                nearbyDuplicates: { edges: [] },
              },
            }
          : operationName === "AddItemToCellarFromItem"
            ? {
                addItemToCellar: refuseAdd
                  ? {
                      __typename: "ForbiddenError",
                      code: "FORBIDDEN",
                      message: "Only owners can add to this cellar",
                      reason: null,
                      retryAt: null,
                    }
                  : {
                      __typename: "CellarItem",
                      id: input?.cellarItemId ?? "x",
                      cellarId: variables.cellarId,
                      item: {
                        __typename: "Wine",
                        id: "w1",
                        type: "WINE",
                        name: "Ridge",
                      },
                    },
              }
            : operationName === "RemoveItemFromCellar"
              ? {
                  removeItemFromCellar: {
                    __typename: "RemovedCellarItem",
                    id: variables.cellarItemId,
                  },
                }
              : {};
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { act } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { NewPlaceSheet } = await import("./NewPlaceSheet");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
  // Queries as POST too, so the stub reads every operation from the body.
  preferGetMethod: false,
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const render = async (node: ReactNode) => {
  await act(async () =>
    root.render(<Provider value={client}>{node}</Provider>),
  );
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
  );
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  sent.length = 0;
  refuseAdd = false;
  nearbyBudgetExhausted = false;
  historyBottles = 0;
  historyDelayMs = 0;
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});
describe("NewPlaceSheet (L10: scan anywhere)", () => {
  const HERE = { latitude: 37.7749, longitude: -122.4194 };
  const nameInput = () =>
    document.querySelector<HTMLInputElement>('[data-slot="new-place"] input');

  test("prefilled from the nearest listing; nothing is created until the confirm", async () => {
    const created: { id: string; name: string; category: string }[] = [];
    await render(
      <NewPlaceSheet
        open
        onOpenChange={() => {}}
        location={{ ...HERE, accuracy: 12 }}
        hasPhoto
        onCreated={(place) => created.push(place)}
        onPickInstead={() => {}}
      />,
    );
    await flush(30);
    assert.equal(nameInput()?.value, "Bar Lumen");
    assert.match(
      document.body.textContent ?? "",
      /Suggested from the nearest listing/,
    );
    assert.match(document.body.textContent ?? "", /Under review/);
    // W-16: the pin says how good the fix is.
    assert.match(document.body.textContent ?? "", /Pinned · ±12\u202fm/);
    // The listing said "bar": that chip is picked.
    assert.equal(
      document.querySelector('[role="radio"][aria-checked="true"]')
        ?.textContent,
      "Bar",
    );
    assert.equal(
      sent.filter((s) => s.operationName === "MapCreatePlace").length,
      0,
      "opening the sheet creates nothing",
    );

    await click(button("Add place and scan"));
    await flush(30);
    const creates = sent.filter((s) => s.operationName === "MapCreatePlace");
    assert.equal(creates.length, 1);
    const input = creates[0]?.variables.input as {
      name: string;
      categories: string[];
      placeId: string;
      location: { lat: number; lng: number };
    };
    assert.equal(input.name, "Bar Lumen");
    assert.deepEqual(input.categories, ["bar"]);
    assert.equal(input.location.lat, HERE.latitude);
    assert.ok(input.placeId, "a client-minted id, so a retry converges (N09)");
    assert.deepEqual(created, [
      { id: input.placeId, name: "Bar Lumen", category: "bar" },
    ]);
  });

  test("GPS drift while open: one Google read, one placeId, the pin stays at the opening fix (CR-4, N09)", async () => {
    const sheet = (location: { latitude: number; longitude: number }) => (
      <NewPlaceSheet
        open
        onOpenChange={() => {}}
        location={location}
        hasPhoto={false}
        onCreated={() => {}}
        onPickInstead={() => {}}
      />
    );
    await render(sheet(HERE));
    await flush(30);
    await click(button("Add place"));
    await flush(30);
    // The fix moves ~20 m, twice, while the sheet stays open.
    await render(sheet({ latitude: 37.77508, longitude: -122.4194 }));
    await flush(30);
    await render(sheet({ latitude: 37.77526, longitude: -122.4194 }));
    await flush(30);
    assert.equal(
      nameInput()?.value,
      "Bar Lumen",
      "the typed/prefilled name stays",
    );
    await click(button("Add place"));
    await flush(30);
    assert.equal(
      sent.filter((s) => s.operationName === "MapGooglePlaceSuggestions")
        .length,
      1,
      "one budgeted nearby read per open sheet",
    );
    const inputs = sent
      .filter((s) => s.operationName === "MapCreatePlace")
      .map(
        (s) =>
          s.variables.input as {
            placeId: string;
            location: { lat: number };
          },
      );
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0]?.placeId, inputs[1]?.placeId, "a retry converges");
    assert.equal(inputs[1]?.location.lat, HERE.latitude);
  });

  test("out of budget: 'Details pending', an empty name, and a bound refusal before any create", async () => {
    nearbyBudgetExhausted = true;
    await render(
      <NewPlaceSheet
        open
        onOpenChange={() => {}}
        location={HERE}
        hasPhoto={false}
        onCreated={() => {}}
        onPickInstead={() => {}}
      />,
    );
    await flush(30);
    assert.equal(nameInput()?.value, "");
    assert.match(document.body.textContent ?? "", /Details pending/);
    await click(button("Add place"));
    await flush(10);
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /kind of place|between 2 and 200/,
    );
    assert.equal(
      sent.filter((s) => s.operationName === "MapCreatePlace").length,
      0,
    );
  });
  test("On the map?: a name a nearby place has offers that place, and using it creates nothing", async () => {
    const chosen: unknown[] = [];
    await render(
      <NewPlaceSheet
        open
        onOpenChange={() => {}}
        location={HERE}
        hasPhoto
        onCreated={() => assert.fail("nothing is created")}
        onPickInstead={() => {}}
        nearby={[{ id: "p-known", name: "Bar Lumen", distanceMeters: 60 }]}
        onChooseExisting={(place) => chosen.push(place)}
      />,
    );
    await flush(30);
    const box = document.querySelector('[data-slot="new-place-duplicate"]');
    assert.match(
      box?.textContent ?? "",
      /On the map\?Bar Lumen · 60\u202fm from you/,
    );
    await click(button("Use it"));
    await flush(10);
    assert.deepEqual(chosen, [{ id: "p-known", name: "Bar Lumen" }]);
    assert.equal(
      sent.filter((s) => s.operationName === "MapCreatePlace").length,
      0,
    );
  });

  test("More kinds files the kind picked there, not the listing's", async () => {
    await render(
      <NewPlaceSheet
        open
        onOpenChange={() => {}}
        location={HERE}
        hasPhoto={false}
        onCreated={() => {}}
        onPickInstead={() => {}}
      />,
    );
    await flush(30);
    assert.equal(
      document.querySelectorAll('[role="radiogroup"] [role="radio"]').length,
      6,
      "six kinds until More kinds",
    );
    await click(button("More kinds"));
    await click(button("Sake bar"));
    assert.equal(
      document.querySelectorAll('[role="radio"][aria-checked="true"]').length,
      1,
      "one kind picked",
    );
    await click(button("Add place"));
    await flush(30);
    const creates = sent.filter((s) => s.operationName === "MapCreatePlace");
    assert.equal(creates.length, 1);
    assert.deepEqual(
      (creates[0]?.variables.input as { categories?: string[] } | undefined)
        ?.categories,
      ["sake_bar"],
    );
  });
});
