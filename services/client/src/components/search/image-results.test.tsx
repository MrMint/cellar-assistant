/**
 * `ServerImageResults` (G32) — the old page's "Image search results" block,
 * now fed by `itemSearch(imageFileId:)` instead of `?image_results=<JSON>`.
 *
 * Asserts the **old** copy for the two outcomes the old block had (matches,
 * and "No items found matching the image" with "Add an item"), and that the
 * new "this deployment cannot embed a photo" answer is said as itself rather
 * than as "no items".
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));

let answer: unknown = null;
const asked: unknown[] = [];
mock.module("@/lib/api/urql-server", () => ({
  apiServerQuery: async (_document: unknown, variables: unknown) => {
    asked.push(variables);
    return { itemSearch: answer };
  },
}));

const { ServerImageResults } = await import("./ServerImageResults");

const FILE = "0b5f8c2e-9d61-4c7a-8f0e-3a1b2c4d5e6f";

const render = async () =>
  renderToStaticMarkup(
    (await ServerImageResults({ imageFileId: FILE })) as ReactNode,
  ).replace(/<style[^>]*>[^<]*<\/style>/g, "");
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

const wine = {
  __typename: "Wine",
  id: "w1",
  type: "WINE",
  name: "Barolo",
  isFavorite: false,
  favoriteCount: 3,
  myReview: null,
  score: { average: 4.5, count: 2 },
  images: { edges: [] },
  brands: { edges: [] },
  vintage: "2016-01-01",
  variety: "Nebbiolo",
};

describe("ServerImageResults (restored, G32)", () => {
  test("searches by the photo's file id, ten at most", async () => {
    asked.length = 0;
    answer = { __typename: "ItemSearchConnection", edges: [] };
    await render();
    assert.deepEqual(asked, [{ imageFileId: FILE, first: 10 }]);
  });

  test("no match is the old empty state, with Add an item", async () => {
    answer = { __typename: "ItemSearchConnection", edges: [] };
    const html = text(await render());
    assert.match(html, /No items found matching the image/);
    assert.match(html, /Add an item/);
  });

  // `SearchResultGrid` is the virtualised grid, which server-renders no cards
  // (it measures first) — so what is asserted is that a match is neither of
  // the other two answers.
  test("a match goes to the result grid, not an empty or error state", async () => {
    answer = {
      __typename: "ItemSearchConnection",
      edges: [
        {
          node: {
            __typename: "ItemSearchResult",
            id: "w1",
            name: "Barolo",
            type: "WINE",
            distance: 0.12,
            item: wine,
          },
        },
      ],
    };
    const html = text(await render());
    assert.doesNotMatch(html, /No items found|isn|failed/);
  });

  test("a deployment that cannot embed a photo says so, not 'no items'", async () => {
    answer = {
      __typename: "ConflictError",
      code: "CONFLICT",
      reason: "IMAGE_SEARCH_UNAVAILABLE",
      message: "the configured embedding cannot embed a photograph",
    };
    const html = text(await render());
    assert.match(html, /Photo search isn(&#x27;|')t available here/);
    assert.doesNotMatch(html, /No items found/);
  });

  test("any other refusal is an error, not an empty result", async () => {
    answer = {
      __typename: "BudgetExceededError",
      code: "BUDGET_EXCEEDED",
      reason: null,
      message: "per-user cap reached",
    };
    const html = text(await render());
    assert.match(html, /Image search failed/);
    assert.doesNotMatch(html, /No items found/);
  });
});
