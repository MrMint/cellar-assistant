/**
 * Render tests for the restored `HeaderBar` + `ServerBreadcrumbs`, against the
 * old layout: a row holding the breadcrumb `nav` (or an empty spacer `div`),
 * then a nested row with the debounced search input and the caller's end
 * component. Asserted through landmarks, list items, `href` and `aria-*`.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/";
mock.module("next/navigation", () => ({ usePathname: () => pathname }));

const { HeaderBar } = await import("./HeaderBar");
const { LOADING, openTag, textOf } = await import("@/test-support/markup");

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

/** The crumbs (separators are `aria-hidden` list items, and skipped). */
const crumbs = (html: string): string[] =>
  [...html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)]
    .filter(([, attrs]) => !attrs.includes('aria-hidden="true"'))
    .map(([, , inner]) => {
      const link = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(inner);
      return link
        ? `${textOf(link[2] ?? "")} -> ${link[1]}`
        : textOf(inner ?? "");
    });

describe("HeaderBar (restored)", () => {
  test("breadcrumbs: links for ancestors, plain text for the current page", () => {
    pathname = "/cellars/0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f/items";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ cellarName: "Home bar" }} />,
    );
    assert.match(html, /<nav[^>]*aria-label="breadcrumb"[^>]*>\s*<ol\b/);
    assert.deepEqual(crumbs(html), [
      "Home -> /",
      "Cellars -> /cellars",
      "Home bar -> /cellars/0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f/items",
      "Items",
    ]);
    // The current page is plain text, and says it is the current page.
    assert.match(html, /aria-current="page"[^>]*>Items</);
  });

  test("no breadcrumbs prop: an empty spacer div keeps the end slot right-aligned", () => {
    pathname = "/cellars";
    const html = render(
      <HeaderBar endComponent={<button type="button">Add</button>} />,
    );
    assert.doesNotMatch(html, /<nav\b/);
    assert.match(
      html,
      /^<div\b[^>]*><div><\/div><div\b/,
      "spacer, then the end row",
    );
    assert.match(html, /<button type="button">Add<\/button>/);
  });

  test("search input appears only with onSearchChange, with the old placeholder", () => {
    pathname = "/cellars";
    assert.doesNotMatch(render(<HeaderBar />), /placeholder="Search"/);
    const html = render(
      <HeaderBar onSearchChange={() => {}} defaultSearchValue="pinot" />,
    );
    const input = openTag(html, 'placeholder="Search"');
    assert.match(input, /^<input\b/);
    assert.match(html, /placeholder="Search"/);
    assert.match(input, /value="pinot"/);
    assert.doesNotMatch(html, LOADING);
  });

  test("isSearching swaps the search icon for a spinner", () => {
    pathname = "/cellars";
    const html = render(<HeaderBar onSearchChange={() => {}} isSearching />);
    assert.match(html, LOADING);
  });
});
