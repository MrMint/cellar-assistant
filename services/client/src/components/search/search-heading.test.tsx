/**
 * F-103 (FR-2, H-65): the tab bar shows on `/search`, and Recipes-Search
 * draws no top bar and no Close, so the page's heading is its h1 for
 * screen readers only, at every width, with no Close beside it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchHeading } from "./SearchSheetHeader";

describe("SearchHeading (F-103)", () => {
  const html = renderToStaticMarkup(<SearchHeading />);

  test("one h1, Search, for screen readers only", () => {
    assert.match(html, /<h1 class="[^"]*\bsr-only\b[^"]*">Search<\/h1>/);
    assert.equal(html.match(/<h1/g)?.length, 1);
  });

  test("no Close: the tab bar is the way out", () => {
    assert.doesNotMatch(html, /Close search/);
    assert.doesNotMatch(html, /<button/);
  });
});
