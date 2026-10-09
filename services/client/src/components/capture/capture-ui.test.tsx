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
  const data =
    operationName === "AddItemToCellarFromItem"
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
const { CAPTURE_PREFS_KEY } = await import("@/lib/capture/capture-prefs");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
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
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("SuccessSheet (N21's real ending)", () => {
  test("+1 bottle, then Snap another · Open it now · View bottle", async () => {
    const calls: string[] = [];
    await render(
      <SuccessSheet
        open
        itemType="WINE"
        itemName="Ridge Lytton Springs"
        cellarName="Home Cellar"
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
    await click(button("View bottle"));
    assert.deepEqual(calls, ["snap", "open", "done"]);
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
