/**
 * "Your log" deletes without asking and offers Undo (X03's drink-log
 * follow-up): Delete sends `deleteDrinkLog` at once — no confirm sheet — and
 * the toast's Undo sends `restoreDrinkLog` for the same id, which puts back
 * the same entries (ids, dates, companions) server-side. Over a stubbed
 * `fetch`, so what each tap sends is the assertion.
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

const ENTRY = {
  __typename: "ItemCheckIn",
  id: "l1",
  createdAt: "2026-10-01T19:00:00.000Z",
  score: 4,
  note: "plum",
  tags: [],
  isMine: true,
  canRemove: true,
  fromCellar: false,
  userId: "me",
  createdById: "me",
  companionIds: ["u2"],
  user: {
    __typename: "UserProfile",
    id: "me",
    displayName: "Me",
    avatarUrl: null,
  },
  companions: { __typename: "UserProfileConnection", edges: [] },
  place: null,
  photo: null,
};

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  const params = new URL(String(url), "http://localhost").searchParams;
  const body = (
    init?.body === undefined
      ? {
          operationName: params.get("operationName") ?? undefined,
          query: params.get("query") ?? undefined,
          variables: JSON.parse(params.get("variables") ?? "{}"),
        }
      : JSON.parse(String(init.body))
  ) as {
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
  const answers: Record<string, unknown> = {
    ItemDrinkLog: {
      item: {
        __typename: "QueryItemSuccess",
        data: {
          __typename: "Wine",
          id: "w1",
          checkIns: {
            __typename: "ItemCheckInConnection",
            totalCount: 1,
            edges: [{ __typename: "ItemCheckInEdge", node: ENTRY }],
          },
        },
      },
    },
    DeleteDrinkLog: {
      deleteDrinkLog: {
        __typename: "DeletedDrinkLogPayload",
        ids: ["l1", "l2"],
      },
    },
    RestoreDrinkLog: {
      restoreDrinkLog: {
        __typename: "RestoredDrinkLogPayload",
        ids: ["l1", "l2"],
        entry: ENTRY,
      },
    },
  };
  return new Response(JSON.stringify({ data: answers[operationName] ?? {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { YourLog } = await import("./YourLog");
const { Toaster } = await import("@/components/app/Toaster");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

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

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
  );
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

describe("YourLog — delete with Undo", () => {
  test("Delete goes at once, and Undo restores the same log", async () => {
    const client = new Client({
      url: "http://localhost/api/graphql",
      exchanges: [fetchExchange],
      requestPolicy: "network-only",
    });
    await act(async () =>
      root.render(
        <Provider value={client}>
          <YourLog
            subject={{ itemType: "WINE", itemId: "w1", itemName: "Barolo" }}
          />
          <Toaster />
        </Provider>,
      ),
    );
    await flush(30);
    await click(button("More for this log"));
    await flush(20);
    await click(button("Delete"));
    await flush(50);

    assert.equal(
      document.querySelector('[role="alertdialog"]'),
      null,
      "no confirm sheet",
    );
    const removed = sent.filter((s) => s.operationName === "DeleteDrinkLog");
    assert.deepEqual(
      removed.map((s) => s.variables),
      [{ id: "l1" }],
    );
    assert.match(
      document.body.textContent ?? "",
      /Log deleted, with 1 for friends/,
    );

    await click(button("Undo"));
    await flush(50);
    assert.deepEqual(
      sent
        .filter((s) => s.operationName === "RestoreDrinkLog")
        .map((s) => s.variables),
      [{ id: "l1" }],
    );
    assert.match(document.body.textContent ?? "", /Log restored/);
  });
});
