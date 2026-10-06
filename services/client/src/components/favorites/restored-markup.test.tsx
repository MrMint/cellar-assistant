/**
 * Render tests for the restored favorites page, asserting the **old** markup
 * (`82450ad1:src/components/favorites/FavoritesClient.tsx`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/favorites",
  useSearchParams: () => new URLSearchParams(),
}));

const { FavoritesClient } = await import("./FavoritesClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

const emptyPage = {
  rows: [],
  endCursor: null,
  hasNextPage: false,
  totalCount: 0,
};

describe("FavoritesClient (restored)", () => {
  test("title and the six-type filter", () => {
    const html = render(
      <FavoritesClient initialPage={emptyPage} initialTypes={[]} />,
    );
    assert.match(html, /MuiTypography-title-lg[^>]*>Favorites</);
    for (const type of ["Beer", "Wine", "Spirit", "Coffee", "Sake", "Tea"]) {
      assert.match(html, new RegExp(`aria-label="${type}"`));
    }
  });
});
