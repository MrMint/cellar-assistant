/**
 * The compare view against a stand-in API (MC-compare, L11): a friend's rows
 * side by side, the kind chip asking the server for that kind only, gold on
 * the viewer's score alone — and a non-friend, whom the server refuses the
 * agreement and sends no rows, sees nothing of theirs.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/users/u-2/compare" });
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
const { Client, Provider } = await import("urql");
const { fetchExchange } = await import("@urql/core");
const { CompareView } = await import("./CompareView");

type Body = { operationName?: string; variables?: Record<string, unknown> };
let requests: Body[] = [];
let friend = true;

const NOT_FOUND = {
  __typename: "NotFoundError",
  code: "NOT_FOUND",
  reason: null,
  retryAt: null,
  message: "Not found",
};

const edge = (id: string, name: string, mine: number, theirs: number) => ({
  cursor: id,
  node: {
    myScore: mine,
    theirScore: theirs,
    item: { __typename: "Beer", id, type: "BEER", name },
  },
});

const answer = (body: Body) => {
  if (body.operationName === "TasteAgreement") {
    return {
      tasteAgreement: friend
        ? {
            __typename: "TasteAgreement",
            userId: "u-2",
            name: "Test Two",
            avatarUrl: null,
            shared: 6,
            agreed: 5,
            byType: {
              edges: [
                { node: { itemType: "BEER", shared: 5, agreed: 4 } },
                { node: { itemType: "WINE", shared: 1, agreed: null } },
              ],
            },
          }
        : NOT_FOUND,
    };
  }
  return {
    tasteCompare: {
      __typename: "TasteCompare",
      rows: {
        totalCount: friend ? 2 : 0,
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: friend
          ? [edge("b1", "Demo Stout", 4.5, 3), edge("b2", "Demo Lager", 3, 3)]
          : [],
      },
    },
  };
};

const client = () =>
  new Client({
    url: "http://localhost/graphql",
    exchanges: [fetchExchange],
    preferGetMethod: false,
    requestPolicy: "network-only",
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Body;
      requests.push(body);
      return new Response(JSON.stringify({ data: answer(body) }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  requests = [];
  friend = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });

const render = async () => {
  await act(async () =>
    root.render(
      <Provider value={client()}>
        <CompareView userId="u-2" name="Test Two" />
      </Provider>,
    ),
  );
  await settle();
};

describe("CompareView", () => {
  test("a friend: rows side by side, gold on your score only", async () => {
    await render();
    const rows = container.querySelectorAll('[data-slot="compare-row"]');
    assert.equal(rows.length, 2);
    const first = rows[0];
    assert.match(first?.textContent ?? "", /Demo Stout/);
    assert.match(first?.textContent ?? "", /1\.5 apart/);
    assert.match(first?.textContent ?? "", /You 4\.5, Test 3\.0/);
    const fills = [...(first?.querySelectorAll("[data-fraction] svg") ?? [])];
    assert.deepEqual(
      fills.map((svg) => svg.getAttribute("class")?.includes("text-gold")),
      [true, false],
    );
    assert.match(container.textContent ?? "", /5of 6/);
  });

  test("a kind chip asks the server for that kind only", async () => {
    await render();
    const beer = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Beer"),
    );
    assert.ok(beer, "no Beer chip");
    requests = [];
    await act(async () => beer?.click());
    await settle();
    const compare = requests.find((r) => r.operationName === "TasteCompare");
    assert.equal(compare?.variables?.itemType, "BEER");
    assert.equal(compare?.variables?.userId, "u-2");
  });

  test("a non-friend: no rows, no scores, one empty state", async () => {
    friend = false;
    await render();
    assert.equal(
      container.querySelectorAll('[data-slot="compare-row"]').length,
      0,
    );
    assert.match(container.textContent ?? "", /Nothing to compare yet/);
    assert.doesNotMatch(container.textContent ?? "", /\d\.\d/);
  });
});
