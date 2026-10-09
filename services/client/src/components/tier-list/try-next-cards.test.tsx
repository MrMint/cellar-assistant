/**
 * X16's grounded Try this next in a DOM: a visitor with nothing to see gets
 * no section at all (no heading over an empty box), the owner is told what
 * would fill it, a failed read is said as one, and a card's reason is words.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/tier-lists/tl-1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, createRequest, ssrExchange } = await import("urql");
const { TryNextCards } = await import("./TryNextCards");
const { TierListTryNextQuery, TRY_NEXT_PAGE_SIZE } = await import("./queries");

const placeNode = {
  __typename: "TierListTryNext",
  reason: "FRIEND_RANKED",
  entryType: "PLACE",
  friendBand: 5,
  friendCount: 2,
  likeName: null,
  likeBand: null,
  friend: { __typename: "UserProfile", id: "u2", displayName: "Riley" },
  place: {
    __typename: "Place",
    id: "p1",
    name: "Bar Agricole",
    displayName: null,
    primaryCategory: "bar",
    locality: "San Francisco",
    countryCode: "US",
    myInteraction: null,
  },
  item: null,
};

const client = (
  answer: { nodes: readonly unknown[] } | { error: string },
): Client => {
  const { key } = createRequest(TierListTryNextQuery, {
    id: "tl-1",
    first: TRY_NEXT_PAGE_SIZE,
  });
  const result =
    "error" in answer
      ? { error: { networkError: { message: answer.error } } }
      : {
          data: JSON.stringify({
            tierList: {
              __typename: "TierList",
              id: "tl-1",
              tryNext: {
                __typename: "TierListTryNextConnection",
                edges: answer.nodes.map((node, i) => ({
                  __typename: "TierListTryNextEdge",
                  cursor: String(i),
                  node,
                })),
              },
            },
          }),
        };
  return new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({ isClient: true, initialState: { [key]: result } }),
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

const render = async (value: Client, isOwner: boolean) => {
  await act(async () => {
    root.render(
      <Provider value={value}>
        <TryNextCards
          tierListId="tl-1"
          isOwner={isOwner}
          frame={(body) => (
            <section data-testid="frame">
              <h4>Try this next</h4>
              {body}
            </section>
          )}
        />
      </Provider>,
    );
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("Try this next (X16)", () => {
  test("a visitor with nothing to see gets no section, not an empty heading", async () => {
    await render(client({ nodes: [] }), false);
    assert.equal(container.querySelector('[data-testid="frame"]'), null);
    assert.doesNotMatch(container.textContent ?? "", /Try this next/);
  });

  test("the owner is told what would fill it", async () => {
    await render(client({ nodes: [] }), true);
    assert.ok(container.querySelector('[data-testid="frame"]'));
    assert.match(container.textContent ?? "", /Nothing to suggest yet/);
  });

  test("a failed read is said as one to the owner, and hidden from a visitor", async () => {
    await render(client({ error: "boom" }), true);
    assert.match(
      container.textContent ?? "",
      /Couldn.t load suggestions just now/,
    );
    assert.doesNotMatch(container.textContent ?? "", /Nothing to suggest/);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(client({ error: "boom" }), false);
    assert.equal(container.querySelector('[data-testid="frame"]'), null);
  });

  test("a card names why in words, never a percentage", async () => {
    await render(client({ nodes: [placeNode] }), true);
    const text = container.textContent ?? "";
    assert.match(text, /Bar Agricole/);
    assert.match(text, /Riley ranks it Outstanding, as does 1 more friend/);
    assert.doesNotMatch(text, /%/);
  });
});
