/**
 * FS-1 / H-140: Add a place is a sheet over the live map (Map board 24–26),
 * not a bare pin bar that leads to a page. Drag the map to set the spot; the
 * sheet holds the name, the kind chips and "Add here", with the duplicate
 * check and the create path of the form it hosts (B24B's).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/map",
  useSearchParams: () => new URLSearchParams(),
}));

const { AddPlaceSheet } = await import("./AddPlaceSheet");
const { mapPaddingFor, repinAddress } = await import("./add-place-sheet");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

const sheet = (desktop: boolean) =>
  render(
    <AddPlaceSheet
      latitude={43.07}
      longitude={-89.4}
      initialName=""
      desktop={desktop}
      onCancel={() => {}}
      onOpenPlace={() => {}}
    />,
  );

describe("the Add a place sheet (FS-1)", () => {
  for (const desktop of [false, true]) {
    test(`${desktop ? "from md" : "at 390"}: the board's sheet, top to bottom`, () => {
      const html = sheet(desktop);
      assert.match(html, /data-slot="add-place-sheet"/);
      assert.match(html, /<h2[^>]*>Add a place<\/h2>/);
      assert.match(html, /aria-label="Cancel"/);
      assert.match(html, /Drag the map to set the spot/);
      // The form it hosts: the name, the six kinds, Add here.
      assert.match(html, /data-slot="create-place-form"/);
      assert.match(html, />Name<\/label>/);
      for (const kind of ["Coffee", "Food", "Bar", "Beer", "Wine", "Shop"]) {
        assert.match(html, new RegExp(`aria-pressed="false"[^>]*>.*?${kind}`));
      }
      assert.match(html, />Add here<\/button>/);
      // One close, the sheet's: not the page's "Back to map" too.
      assert.doesNotMatch(html, /Back to map/);
      assert.doesNotMatch(html, /Confirm Location/);
    });
  }
});

describe("the map's padding while the sheet is up", () => {
  test("a phone's sheet covers the map's foot: the pin centres above it", () => {
    assert.deepEqual(mapPaddingFor(false, 320), {
      top: 0,
      bottom: 320,
      left: 0,
      right: 0,
    });
  });
  test("from md the sheet sits at the map's left edge", () => {
    assert.deepEqual(mapPaddingFor(true, 400), {
      top: 0,
      bottom: 0,
      left: 400,
      right: 0,
    });
  });
});

describe("moving the pin re-drafts the address", () => {
  test("a field still holding the last pin's value takes the new one", () => {
    assert.deepEqual(
      repinAddress(
        { street_address: "1 Old St", locality: "Madison" },
        { street_address: "1 Old St", locality: "Madison" },
        { street_address: "9 New Ave", locality: "Madison" },
      ),
      // The locality did not change: nothing to write.
      { street_address: "9 New Ave" },
    );
  });
  test("a field the person typed is kept", () => {
    assert.deepEqual(
      repinAddress(
        { street_address: "1 Old St" },
        { street_address: "Corner of Main" },
        { street_address: "9 New Ave" },
      ),
      {},
    );
  });
  test("an empty field takes the pin's value; a field the pin no longer has is cleared only if it was the pin's", () => {
    assert.deepEqual(
      repinAddress(
        { postcode: "53703", region: "WI" },
        { postcode: "53703", region: "Wisconsin", locality: "" },
        { locality: "Monona" },
      ),
      { postcode: "", locality: "Monona" },
    );
  });
});
