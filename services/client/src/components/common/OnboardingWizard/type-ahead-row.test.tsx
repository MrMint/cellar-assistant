/**
 * F-60 (board add-bottle-17): Type it's quick-add row under Name — the
 * catalog item being typed, "maker · You gave it N", and Add.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/add" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const searched: string[] = [];
globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    variables?: { text?: string };
  };
  searched.push(body.variables?.text ?? "");
  const data = {
    itemSearch: {
      __typename: "ItemSearchConnection",
      edges: [
        {
          node: {
            __typename: "ItemSearchHit",
            distance: 0.2,
            item: {
              __typename: "Beer",
              id: "beer-1",
              type: "BEER",
              name: "Wipers Times",
              country: null,
              isFavorite: false,
              favoriteCount: 0,
              myReview: { __typename: "Review", id: "r1", score: 5 },
              score: null,
              images: { edges: [] },
              brands: {
                edges: [
                  {
                    node: {
                      __typename: "ItemBrand",
                      id: "ib1",
                      isPrimary: true,
                      brand: {
                        __typename: "Brand",
                        id: "b1",
                        name: "Kazematten",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { TypeAheadRow } = await import("./TypeAheadRow");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
  preferGetMethod: false,
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  searched.length = 0;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const renderRow = async (
  name: string,
  onAdd: (id: string) => void,
  excludeItemIds: readonly string[] = [],
) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <TypeAheadRow
          type="BEER"
          name={name}
          inCellar
          excludeItemIds={excludeItemIds}
          onAdd={(match) => onAdd(match.item.itemId)}
        />
      </Provider>,
    ),
  );
  await flush(400);
  await flush(20);
};

describe("TypeAheadRow (F-60)", () => {
  test("a typed name offers the catalog item, with Add", async () => {
    const added: string[] = [];
    await renderRow("Wip", (id) => added.push(id));
    const row = document.querySelector('[data-slot="type-ahead-match"]');
    assert.ok(row, "the row shows");
    assert.match(row?.textContent ?? "", /Wipers Times/);
    assert.match(row?.textContent ?? "", /Kazematten · You gave it 5/);
    const add = row?.querySelector("button");
    assert.equal(add?.textContent, "Add");
    await act(async () => add?.click());
    assert.deepEqual(added, ["beer-1"]);
  });

  test("two letters ask nothing; a declined item is never offered", async () => {
    await renderRow("Wi", () => {});
    assert.deepEqual(searched, []);
    assert.equal(
      document.querySelector('[data-slot="type-ahead-match"]'),
      null,
    );
    await renderRow("Wipers", () => {}, ["beer-1"]);
    assert.equal(
      document.querySelector('[data-slot="type-ahead-match"]'),
      null,
    );
  });
});
