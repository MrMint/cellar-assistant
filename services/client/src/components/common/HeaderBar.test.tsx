/**
 * Render tests for `HeaderBar`, which now renders `app/AppBar` (N26): the
 * breadcrumb trail (desktop) and the page title, then a row with the
 * debounced search input and the caller's end component. Asserted through
 * landmarks, list items, headings, `href` and `aria-*`.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/";
mock.module("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back: () => {}, push: () => {}, replace: () => {} }),
}));

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

describe("HeaderBar", () => {
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

  test("an ancestor crumb without a page is plain text; only the last crumb is current", () => {
    // generateBreadcrumbs' type label ("Teas") has no href. It used to render
    // as BreadcrumbPage, so the trail announced two current pages.
    pathname = "/teas/4f7e2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ itemName: "Sencha" }} />,
    );
    const trail = crumbs(html);
    assert.equal(trail.at(-1), "Sencha");
    assert.ok(trail.includes("Teas"), trail.join(" | "));
    assert.equal(html.match(/aria-current="page"/g)?.length, 1);
    assert.match(html, /aria-current="page"[^>]*>Sencha</);
  });

  test("the bar: the page's title, and a Back off a tab root (cold open: the parent)", () => {
    pathname = "/cellars/0b9a1c52-6a0e-4d33-9a43-7f1e2c3d4e5f/items";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ cellarName: "Home bar" }} />,
    );
    assert.match(html, /<header\b[^>]*data-slot="app-bar"/);
    assert.match(html, /<h1\b[^>]*>Home bar<\/h1>/);
    assert.match(html, /<button\b[^>]*aria-label="Back"/);
  });

  test("a tab root has its title and no Back", () => {
    pathname = "/cellars";
    const html = render(<HeaderBar serverBreadcrumbs={{}} />);
    assert.match(html, /<h1\b[^>]*>Cellars<\/h1>/);
    assert.doesNotMatch(html, /aria-label="Back"/);
  });

  test("an item's own page: its name in the bar is text, not a second heading", () => {
    // ItemDetails prints the name as the content's heading; two headings with
    // one name make e2e's getByRole("heading", { name }) ambiguous.
    pathname = "/teas/4f7e2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ itemName: "Sencha" }} />,
    );
    assert.doesNotMatch(html, /<h[1-6]\b[^>]*>Sencha</);
    assert.match(html, /<p\b[^>]*>Sencha<\/p>/);
  });

  test("an edit page keeps its title as the h1 (the content has no heading of its own)", () => {
    pathname = "/teas/4f7e2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6/edit";
    const html = render(
      <HeaderBar serverBreadcrumbs={{ itemName: "Sencha" }} />,
    );
    assert.match(html, /<h1\b[^>]*>Edit Sencha<\/h1>/);
  });

  test("no breadcrumbs prop: no bar, just the end slot", () => {
    pathname = "/cellars";
    const html = render(
      <HeaderBar endComponent={<button type="button">Add</button>} />,
    );
    assert.doesNotMatch(html, /<nav\b/);
    assert.doesNotMatch(html, /data-slot="app-bar"/);
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
