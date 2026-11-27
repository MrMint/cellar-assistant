/**
 * `ServerBarcodeResults` (Recipes-Search 33–35): a read that throws keeps the
 * search page and says so in its own face (F-101), and "Matches n" never
 * shows the fetch limit as a total (F-100).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks, stripTags } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/search",
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));

let answer: unknown = null;
mock.module("@/lib/api/urql-server", () => ({
  apiServerQuery: async () => {
    if (answer instanceof Error) throw answer;
    return { barcode: answer };
  },
}));

const { ServerBarcodeResults } = await import("./ServerBarcodeResults");
const { BARCODE_SEARCH_LIMIT } = await import("./queries");

const render = async () =>
  stripTags(
    stripStyleBlocks(
      renderToStaticMarkup(
        (await ServerBarcodeResults({ code: "0012345678905" })) as ReactNode,
      ),
    ),
    " ",
  );

const beer = (id: string) => ({
  __typename: "Beer",
  id,
  type: "BEER",
  name: "Hazy Pale",
  isFavorite: false,
  favoriteCount: 0,
  myReview: null,
  score: null,
  images: { edges: [] },
  brands: { edges: [] },
  vintage: null,
  style: "IPA",
});

const found = (count: number, hasNextPage = false) => ({
  __typename: "Barcode",
  items: {
    totalCount: null,
    pageInfo: { hasNextPage },
    edges: Array.from({ length: count }, (_, i) => ({ node: beer(`b${i}`) })),
  },
});

describe("ServerBarcodeResults", () => {
  test("F-101: a read that throws is the barcode's failure face", async () => {
    answer = new Error("[network] fetch failed");
    const text = await render();
    assert.match(text, /Couldn(?:'|&#x27;)t search this barcode/);
    assert.match(text, /Try again/);
  });

  test("F-100: a full page of matches reads 'n+'", async () => {
    answer = found(BARCODE_SEARCH_LIMIT);
    assert.match(
      await render(),
      new RegExp(`Matches\\s+${BARCODE_SEARCH_LIMIT}\\+`),
    );
    answer = found(3, true);
    assert.match(await render(), /Matches\s+3\+/);
  });

  test("fewer than a page is the exact count", async () => {
    answer = found(3);
    const text = await render();
    assert.match(text, /Matches\s+3/);
    assert.doesNotMatch(text, /Matches\s+3\+/);
  });
});
