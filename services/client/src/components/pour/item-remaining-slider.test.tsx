/**
 * The item page's Remaining slider by keyboard (F-160, W1-18). It lives here,
 * not beside `item/ItemRemainingSlider.tsx`, only because this fix bucket
 * owns `components/pour/` and that one file, not the folder.
 *
 * A run of arrow keys is one save (debounced), each key moves one step, the
 * thumb keeps focus, and the server's answer to an earlier save never drags
 * the thumb back from where the keys have since moved it.
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

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
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
  const data =
    operationName === "SetCellarItemPercentage"
      ? {
          setCellarItemPercentage: {
            __typename: "CellarItem",
            id: variables.cellarItemId,
            percentageRemaining: variables.percentageRemaining,
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
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { ItemRemainingSlider } = await import("../item/ItemRemainingSlider");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const view = (percentageRemaining: number) => (
  <Provider value={client}>
    <ItemRemainingSlider
      itemId="b1"
      cellarId="c1"
      isCellarOwner
      percentageRemaining={percentageRemaining}
      opened="2026-10-01T00:00:00Z"
      emptied={null}
      itemName="Barolo 2016"
    />
  </Provider>
);
const render = async (percentageRemaining: number) => {
  await act(async () => root.render(view(percentageRemaining)));
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const thumb = () => {
  const found = document.querySelector<HTMLElement>('[role="slider"]');
  assert.ok(found, "the level is a slider");
  return found;
};
const press = async (key: string, times: number) => {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      thumb().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
    await flush(20);
  }
};
const saves = () =>
  sent
    .filter((s) => s.operationName === "SetCellarItemPercentage")
    .map((s) => s.variables.percentageRemaining);

beforeEach(() => {
  sent.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("ItemRemainingSlider by keyboard (F-160)", () => {
  test("a run of arrow keys is one step each and one save, and keeps focus", async () => {
    await render(100);
    thumb().focus();
    await press("ArrowLeft", 5);
    assert.equal(thumb().getAttribute("aria-valuenow"), "95");
    assert.deepEqual(saves(), [], "nothing is saved mid-run");
    await flush(500);
    assert.deepEqual(saves(), [95], "one save, for where the run ended");
    assert.equal(document.activeElement, thumb(), "the thumb keeps focus");
  });

  test("the answer to an earlier save never drags the thumb back", async () => {
    await render(100);
    thumb().focus();
    await press("ArrowLeft", 5);
    await flush(500);
    assert.deepEqual(saves(), [95]);
    // The keys move on while the page re-reads…
    await press("ArrowLeft", 3);
    assert.equal(thumb().getAttribute("aria-valuenow"), "92");
    // …and the refresh for the first save lands with 95.
    await render(95);
    assert.equal(
      thumb().getAttribute("aria-valuenow"),
      "92",
      "the thumb stays where the keys put it",
    );
    await flush(500);
    assert.deepEqual(saves(), [95, 92]);
    await render(92);
    assert.equal(thumb().getAttribute("aria-valuenow"), "92");
    assert.equal(document.activeElement, thumb());
  });

  test("a level changed elsewhere still shows once nothing is pending", async () => {
    await render(100);
    await render(40);
    assert.equal(thumb().getAttribute("aria-valuenow"), "40");
  });
});
