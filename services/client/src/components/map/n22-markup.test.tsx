/**
 * N22 / D14 markup: the empty map search and the location pre-prompt.
 * When each shows is tested beside its rule (`search-empty-state.test.ts`,
 * `hooks/geolocation-store.test.ts`); this pins what they say.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LOCATION_PRE_PROMPT_COPY,
  LocationPrePrompt,
} from "./core/LocationPrePrompt";
import { SearchEmptyState } from "./places/SearchEmptyState";

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

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

describe("LocationPrePrompt (D14)", () => {
  test("one line of why, then Continue (which raises the OS prompt) or Not now", () => {
    const html = render(
      <LocationPrePrompt onContinue={() => {}} onDismiss={() => {}} />,
    );
    assert.ok(html.includes(LOCATION_PRE_PROMPT_COPY));
    assert.equal(LOCATION_PRE_PROMPT_COPY.split(/[.!?]\s/).length, 1);
    assert.match(html, />Continue</);
    assert.match(html, />Not now</);
  });
});
