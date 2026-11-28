import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks } from "@/test-support/markup";
import { PlaceFilters } from "./PlaceFilters";

const render = (listName: string | null) =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <PlaceFilters
        kinds={[]}
        counts={{ coffee: 0, food: 0, bar: 0, other: 0 }}
        total={0}
        mine
        mineAvailable
        onKindsChange={() => {}}
        onMineChange={() => {}}
        listName={listName}
      />,
    ),
  );

describe("the map's filter row on a list's link (F-191, CC-6)", () => {
  test("names the list, lit, and no Mine chip claims a friend's list", () => {
    const out = render("Their bars");
    assert.match(out, /aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Their bars/);
    assert.doesNotMatch(out, />Mine</);
  });

  test("with no list link, Mine as before", () => {
    assert.match(render(null), />Mine</);
  });
});
