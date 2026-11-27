/**
 * N22 markup: the empty map search. Split from `map/n22-markup.test.tsx` so
 * the map (P1) and the place pages (P2) each own their tests.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks } from "@/test-support/markup";
import { SearchEmptyState } from "./SearchEmptyState";

const render = (node: React.ReactNode) =>
  stripStyleBlocks(renderToStaticMarkup(node));

describe("SearchEmptyState (N22)", () => {
  test("answers 'Not on the map yet' and offers 'Add it here'", () => {
    const html = render(
      <SearchEmptyState query="Copper Lantern" onAddHere={() => {}} />,
    );
    assert.match(html, /role="status"/);
    assert.match(html, /Not on the map yet/);
    assert.match(html, /Copper Lantern/);
    assert.match(html, />Add it here</);
  });
});
