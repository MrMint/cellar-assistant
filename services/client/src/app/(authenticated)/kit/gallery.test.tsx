/**
 * The kit gallery renders, whole, on the server: every part in its states,
 * with no throw. A smoke test, not a look: the look is the kit's.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KitGallery } from "@/components/app/kit-gallery";

describe("kit gallery", () => {
  test("renders every section and the theme switch", () => {
    const m = renderToStaticMarkup(<KitGallery />);
    for (const title of [
      "Buttons",
      "Chips",
      "Search, sort, count strip",
      "Segments and switch",
      "Fields",
      "Stars and heart",
      "Tiles and plates",
      "Ranks and bands",
      "Page hero and history",
      "Charts and stat tiles",
      "People, places, activity",
      "Loading, empty and error",
    ]) {
      assert.match(m, new RegExp(`aria-label="${title}"`), title);
    }
    assert.match(m, /aria-label="Theme"/);
    assert.match(m, />Dark</);
    assert.match(m, />Light</);
  });
});
