/**
 * `/brands?q=` — search's Brands "See all" (D1) opens the index with its term.
 * The first paint (the server's, and the client's first frame) has the term
 * but has not started the search yet; it must say it is searching, not that
 * nothing matched.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams("q=ridge"),
}));

const { BrandsListClient } = await import("./BrandsListClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const render = (initialSearch?: string) =>
  renderToStaticMarkup(
    <Provider value={client}>
      <BrandsListClient
        initialSearch={initialSearch}
        initialPage={{ rows: [], endCursor: null, hasNextPage: false }}
      />
    </Provider>,
  );

describe("BrandsListClient with a term from the URL", () => {
  test("the box holds the term and the grid says Searching…, not No brands found", () => {
    const html = render("ridge");
    assert.match(
      html,
      /aria-label="Search brands"[^>]*value="ridge"|value="ridge"[^>]*aria-label="Search brands"/,
    );
    assert.match(html, /Searching…/);
    assert.doesNotMatch(html, /No brands found/);
  });

  test("with no term, an empty index is still No brands found", () => {
    const html = render();
    assert.match(html, /No brands found/);
  });
});
