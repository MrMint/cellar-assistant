/**
 * The capture pieces that need a DOM (X05, N21): the success sheet's
 * actions, the type picker as a radio group, and the item page's Add to
 * Cellar sheet end to end over a stubbed `fetch` — defaults, quantity,
 * "Already open?", the Undo toast and what Undo removes.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/w1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let refreshes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {
      refreshes += 1;
    },
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
const { SuccessSheet } = await import("./SuccessSheet");
const { TypePicker } = await import("./TypePicker");
const { AddToCellarActions } = await import(
  "@/components/item/AddToCellarActions"
);
const { Toaster } = await import("@/components/app/Toaster");
const { NewPlaceSheet } = await import("./NewPlaceSheet");
const { CAPTURE_PREFS_KEY } = await import("@/lib/capture/capture-prefs");

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
  refreshes = 0;
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

describe("SuccessSheet (N21's real ending)", () => {
  test("+1 bottle, then Snap another · Open it now (no second 'View bottle')", async () => {
    const calls: string[] = [];
    await render(
      <SuccessSheet
        open
        itemType="WINE"
        itemName="Ridge Lytton Springs"
        cellarName="Home Cellar"
        photo="data:image/png;base64,AAAA"
        onSnapAnother={() => calls.push("snap")}
        onOpenNow={() => calls.push("open")}
        onDone={() => calls.push("done")}
      />,
    );
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const title = document.getElementById(
      dialog.getAttribute("aria-labelledby") ?? "",
    );
    assert.equal(title?.textContent, "+1 bottle");
    assert.match(
      dialog.textContent ?? "",
      /Ridge Lytton Springs is in Home Cellar\./,
    );
    await click(button("Snap another"));
    await click(button("Open it now"));
    // X06: Open it now *is* the bottle's page; a second button saying so
    // would be the same tap twice.
    assert.equal(button("View bottle"), undefined);
    assert.deepEqual(calls, ["snap", "open"]);
  });

  test("without a cellar: the catalog, and no Open it now", async () => {
    await render(
      <SuccessSheet
        open
        itemType="BEER"
        itemName="Spotted Cow"
        onSnapAnother={() => {}}
        onDone={() => {}}
      />,
    );
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    const title = document.getElementById(
      dialog?.getAttribute("aria-labelledby") ?? "",
    );
    assert.equal(title?.textContent, "Added to the catalog");
    assert.equal(button("Open it now"), undefined);
    assert.ok(button("View item"));
    // W-21: nothing was photographed, so nothing is snapped again.
    assert.ok(button("Add another"));
    assert.equal(button("Snap another"), undefined);
  });
});

describe("TypePicker (X05: the person says the type)", () => {
  test("six labelled radios in the canonical order; a tap picks one", async () => {
    const picked: string[] = [];
    await render(
      <TypePicker value="WINE" onValueChange={(type) => picked.push(type)} />,
    );
    const group = container.querySelector('[role="radiogroup"]');
    assert.equal(group?.getAttribute("aria-label"), "What are you adding?");
    const radios = [...container.querySelectorAll('[role="radio"]')];
    assert.deepEqual(
      radios.map((r) => r.textContent?.trim()),
      ["Wine", "Beer", "Spirit", "Sake", "Coffee", "Tea"],
    );
    assert.equal(radios[0]?.getAttribute("aria-checked"), "true");
    await click(radios[1]);
    assert.deepEqual(picked, ["BEER"]);
  });
});

describe("Add to Cellar sheet (N21)", () => {
  const cellars = [
    { id: "recent", name: "Bar Cart" },
    { id: "home", name: "Home Cellar" },
  ];

  test("opens on the remembered cellar; files N bottles, the first open; Undo removes them", async () => {
    window.localStorage.setItem(
      CAPTURE_PREFS_KEY,
      JSON.stringify({ cellarId: "home" }),
    );
    await render(
      <>
        <AddToCellarActions itemId="w1" itemType="WINE" cellars={cellars} />
        <Toaster />
      </>,
    );
    await click(button("Add to Cellar"));
    await flush(20);
    const radios = [
      ...document.querySelectorAll<HTMLElement>('[role="radio"]'),
    ];
    assert.equal(radios.length, 2);
    assert.equal(
      radios
        .find((r) => r.getAttribute("aria-checked") === "true")
        ?.id.endsWith("-home"),
      true,
      "the remembered cellar is chosen",
    );
    await click(button("One more"));
    await click(button("One more"));
    assert.ok(button("Add 3 bottles"));
    await click(document.querySelector('[role="switch"]'));
    await click(button("Add 3 bottles"));
    await flush(50);

    const adds = sent.filter(
      (s) => s.operationName === "AddItemToCellarFromItem",
    );
    assert.equal(adds.length, 3);
    assert.ok(adds.every((a) => a.variables.cellarId === "home"));
    const opened = adds.filter(
      (a) => (a.variables.input as { openAt?: string }).openAt !== undefined,
    );
    assert.equal(opened.length, 1, "only the first bottle is the open one");
    const sheet = document.querySelector('[role="dialog"]');
    assert.ok(
      sheet === null || sheet.getAttribute("data-state") === "closed",
      "the sheet closes",
    );
    assert.equal(refreshes, 1);
    assert.match(
      document.body.textContent ?? "",
      /Added 3 bottles to Home Cellar/,
    );
    assert.match(
      window.localStorage.getItem(CAPTURE_PREFS_KEY) ?? "",
      /"cellarId":"home"/,
    );

    await click(button("Undo"));
    await flush(50);
    const removed = sent
      .filter((s) => s.operationName === "RemoveItemFromCellar")
      .map((s) => s.variables.cellarItemId)
      .sort();
    const filed = adds
      .map((a) => (a.variables.input as { cellarItemId: string }).cellarItemId)
      .sort();
    assert.deepEqual(removed, filed, "Undo removes exactly the bottles filed");
  });

  test("re-buy: the offer promises only the photo it keeps (CR-8, L02)", async () => {
    historyBottles = 2;
    await render(
      <>
        <AddToCellarActions itemId="w1" itemType="WINE" cellars={cellars} />
        <Toaster />
      </>,
    );
    await click(button("Add to Cellar"));
    await flush(20);
    await click(button("Add bottle"));
    await flush(80);
    const offer = document.querySelector('[data-slot="rebuy-photo"]');
    assert.ok(offer, "another bottle of something you had: the offer opens");
    assert.match(offer.textContent ?? "", /Another Ridge added/);
    assert.match(offer.textContent ?? "", /label or receipt/);
    assert.doesNotMatch(
      offer.textContent ?? "",
      /price|date/,
      "nothing reads price or date from the photo",
    );
  });

  test("re-buy: Undo before the history read lands offers nothing (CR-8)", async () => {
    historyBottles = 2;
    historyDelayMs = 60;
    await render(
      <>
        <AddToCellarActions itemId="w1" itemType="WINE" cellars={cellars} />
        <Toaster />
      </>,
    );
    await click(button("Add to Cellar"));
    await flush(20);
    await click(button("Add bottle"));
    await flush(5);
    await click(button("Undo"));
    await flush(150);
    assert.equal(
      document.querySelector('[data-slot="rebuy-photo"]'),
      null,
      "the bottle is gone; no photo offer for it",
    );
  });

  test("a refusal keeps the sheet open and says why", async () => {
    refuseAdd = true;
    await render(
      <AddToCellarActions itemId="w1" itemType="WINE" cellars={[cellars[0]]} />,
    );
    await click(button("Add to Cellar"));
    await flush(20);
    assert.match(document.body.textContent ?? "", /Into\s*Bar Cart/);
    await click(button("Add bottle"));
    await flush(50);
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Only owners can add/,
    );

    // Try again: the same ask re-sends the same bottle id, so a refusal
    // that was really a dropped response can never file a second bottle.
    await click(button("Add bottle"));
    await flush(50);
    const ids = sent
      .filter((s) => s.operationName === "AddItemToCellarFromItem")
      .map((s) => (s.variables.input as { cellarItemId: string }).cellarItemId);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
  });

  test("nothing to add to: no button", async () => {
    await render(
      <AddToCellarActions itemId="w1" itemType="WINE" cellars={[]} />,
    );
    assert.equal(button("Add to Cellar"), undefined);
  });
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
    assert.match(
      document.body.textContent ?? "",
      /Pinned at your location, about 12 m accurate/,
    );
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
});
