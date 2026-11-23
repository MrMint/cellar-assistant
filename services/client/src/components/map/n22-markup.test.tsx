/**
 * N22 / D14 markup: the empty map search and the location pre-prompt.
 * When each shows is tested beside its rule (`search-empty-state.test.ts`,
 * `hooks/geolocation-store.test.ts`); this pins what they say.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks } from "@/test-support/markup";
import {
  LOCATION_PRE_PROMPT_COPY,
  LocationPrePrompt,
} from "./core/LocationPrePrompt";
import {
  MAP_BOTTOM_STACK_Z_INDEX,
  MapBottomStack,
} from "./core/MapBottomStack";
import { MapErrorBanner } from "./core/MapErrorBanner";
import { SearchEmptyState } from "./places/SearchEmptyState";

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

describe("MapErrorBanner (D14 follow-up)", () => {
  test("is a readable alert at the bottom, not under the controls panel", () => {
    const raw = renderToStaticMarkup(
      <MapBottomStack>
        <MapErrorBanner
          message="Location is off for this site."
          onDismiss={() => {}}
        />
      </MapBottomStack>,
    );
    assert.match(raw, /role="alert"/);
    assert.ok(raw.includes("Location is off for this site."));
    assert.match(raw, /aria-label="Dismiss"/);
    // The regression: `top: 80` put it beneath the search/filter panel.
    assert.match(raw, /bottom:40px/);
    assert.doesNotMatch(raw, /top:80px/);
    assert.ok(MAP_BOTTOM_STACK_Z_INDEX > 11, "above the map's own layers");
  });

  test("stacks above the location pre-prompt instead of covering it", () => {
    const html = render(
      <MapBottomStack>
        <MapErrorBanner message="Couldn't load places." />
        <LocationPrePrompt onContinue={() => {}} onDismiss={() => {}} />
      </MapBottomStack>,
    );
    // One column: the error first, then the card, neither positioned alone.
    assert.ok(
      html.indexOf('role="alert"') < html.indexOf('aria-label="Location"'),
    );
    const raw = renderToStaticMarkup(
      <LocationPrePrompt onContinue={() => {}} onDismiss={() => {}} />,
    );
    assert.doesNotMatch(raw, /position:absolute/);
  });

  test("an error the map clears itself offers no dismiss button", () => {
    const html = render(<MapErrorBanner message="Couldn't load places." />);
    assert.doesNotMatch(html, /aria-label="Dismiss"/);
  });
});
