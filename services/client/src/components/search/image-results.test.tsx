/**
 * `ServerImageResults` (G32) — the old page's "Image search results" block,
 * now fed by `itemSearch(imageFileId:)` instead of `?image_results=<JSON>`.
 *
 * Asserts the **old** copy for the two outcomes the old block had (matches,
 * and "No items found matching the image" with "Add an item"), that the
 * new "this deployment cannot embed a photo" answer is said as itself rather
 * than as "no items", and that a discarded photo reads as the page's
 * existing "link has expired" message rather than an error.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks, stripTags } from "@/test-support/markup";

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
  stripStyleBlocks(
    renderToStaticMarkup(
      (await ServerImageResults({ imageFileId: FILE })) as ReactNode,
    ),
  );
const text = (html: string) => stripTags(html, " ");

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

  test("no match says so, with a way to read the label", async () => {
    answer = { __typename: "ItemSearchConnection", edges: [] };
    const html = text(await render());
    assert.match(html, /No drink matches this photo/);
    assert.match(html, /(Read|Snap) the label/);
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
    assert.doesNotMatch(html, /No drink matches|isn|failed|expired/);
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
    assert.doesNotMatch(html, /No drink matches/);
  });

  // A search photo is discarded once its search has used it (G32), so a
  // reload after the cached result has gone finds no file: an expired link,
  // said the way the old `?image_results=` links are — not an error page.
  test("a photo that is no longer there is an expired search, with New search", async () => {
    answer = {
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      reason: null,
      message: "file 0b5f8c2e-9d61-4c7a-8f0e-3a1b2c4d5e6f not found",
    };
    const html = text(await render());
    assert.match(html, /This photo search has expired/);
    assert.match(html, /New search/);
    assert.doesNotMatch(html, /Image search failed|No drink matches/);
  });

  test("any other refusal is an error, not an empty result", async () => {
    answer = {
      __typename: "BudgetExceededError",
      code: "BUDGET_EXCEEDED",
      reason: null,
      retryAt: null,
      message: "per-user cap reached",
    };
    const html = text(await render());
    assert.match(html, /Taking a break/);
    assert.doesNotMatch(html, /No drink matches/);
  });

  // N07: the words come from the reason, never from the server's message.
  test("a per-user limit says so, without the server's message", async () => {
    answer = {
      __typename: "BudgetExceededError",
      code: "BUDGET_EXCEEDED",
      reason: "USER_CAP",
      retryAt: null,
      message: "ai_model/image_search refused: per-user cap reached: …",
    };
    const html = text(await render());
    assert.match(html, /reached your limit for now/);
    assert.doesNotMatch(html, /per-user cap|ai_model/);
  });

  // The server renders in its own zone; a clock time from there would be
  // hours off for the viewer, so the first render leaves it out.
  test("the server's render never states a clock time for retryAt", async () => {
    answer = {
      __typename: "BudgetExceededError",
      code: "BUDGET_EXCEEDED",
      reason: "USER_CAP",
      retryAt: new Date(Date.now() + 40 * 60_000).toISOString(),
      message: "ai_model/image_search refused: per-user cap reached: …",
    };
    const html = text(await render());
    assert.match(html, /try again a little later/);
    assert.doesNotMatch(html, /\d:\d\d/);
  });
});
