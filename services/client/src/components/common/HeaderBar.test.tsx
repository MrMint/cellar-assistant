/**
 * Render tests for the restored `HeaderBar` + `ServerBreadcrumbs`, against the
 * old markup: a responsive row Stack holding the Joy `Breadcrumbs` (or an
 * empty spacer `div`), then a nested Stack with the debounced search input and
 * the caller's end component.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/";
mock.module("next/navigation", () => ({ usePathname: () => pathname }));

const { HeaderBar } = await import("./HeaderBar");

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const crumbs = (html: string): string[] =>
  [
    ...html.matchAll(
      /<li class="MuiBreadcrumbs-li[^"]*">(?:<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>|<[^>]*>([^<]*)<\/[^>]*>)<\/li>/g,
    ),
  ].map((m) => (m[1] !== undefined ? `${m[2]} -> ${m[1]}` : `${m[3]}`));

describe("HeaderBar (restored)", () => {
  test("breadcrumbs: links for ancestors, plain text for the current page", () => {
    pathname = "/cellars/0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f/items";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ cellarName: "Home bar" }} />,
    );
    assert.match(html, /<nav[^>]*class="MuiBreadcrumbs-root/);
    assert.deepEqual(crumbs(html), [
      "Home -> /",
      "Cellars -> /cellars",
      "Home bar -> /cellars/0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f/items",
      "Items",
    ]);
    // Neutral, underline-on-hover links, as before.
    assert.match(html, /MuiLink-colorNeutral[^"]*MuiLink-underlineHover/);
  });

  test("no breadcrumbs prop: an empty spacer div keeps the end slot right-aligned", () => {
    pathname = "/cellars";
    const html = render(
      <HeaderBar endComponent={<button type="button">Add</button>} />,
    );
    assert.doesNotMatch(html, /MuiBreadcrumbs-root/);
    assert.match(
      html,
      /^<div class="MuiStack-root[^"]*"><div><\/div><div class="MuiStack-root/,
    );
    assert.match(html, /<button type="button">Add<\/button>/);
  });

  test("search input appears only with onSearchChange, with the old placeholder", () => {
    pathname = "/cellars";
    assert.doesNotMatch(render(<HeaderBar />), /placeholder="Search"/);
    const html = render(
      <HeaderBar onSearchChange={() => {}} defaultSearchValue="pinot" />,
    );
    assert.match(html, /MuiInput-root/);
    assert.match(html, /placeholder="Search"/);
    assert.match(html, /value="pinot"/);
    assert.doesNotMatch(html, /MuiCircularProgress-root/);
  });

  test("isSearching swaps the search icon for a spinner", () => {
    pathname = "/cellars";
    const html = render(<HeaderBar onSearchChange={() => {}} isSearching />);
    assert.match(html, /MuiCircularProgress-root/);
  });
});
