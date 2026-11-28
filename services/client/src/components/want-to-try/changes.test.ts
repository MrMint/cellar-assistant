/**
 * The in-page change bus and the map's want-to-go pins (X08): a confirmed
 * Save reaches every listener, and a pin's badge follows the server's list
 * with the changes since applied on top.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  transformToGeoJSON,
  WANT_TO_TRY_SORT_BOOST,
} from "../map/maplibre/utils/geoJsonTransform";
import { pinImageName } from "../map/maplibre/utils/iconLoader";
import type { PlaceResult } from "../map/types";
import {
  announceWantToTry,
  onWantToTryChange,
  withPlaceOverrides,
} from "./changes";

describe("announceWantToTry / onWantToTryChange", () => {
  test("every listener hears a change, keyed like the API, until it unsubscribes", () => {
    const heard: string[] = [];
    const off = onWantToTryChange((change) =>
      heard.push(`${change.key}=${String(change.saved)}`),
    );
    announceWantToTry({ kind: "PLACE", placeId: "p1" }, true);
    announceWantToTry({ kind: "ITEM", itemType: "TEA", itemId: "t1" }, false);
    off();
    announceWantToTry({ kind: "RECIPE", recipeId: "r1" }, true);
    assert.deepEqual(heard, ["place:p1=true", "tea:t1=false"]);
  });
});

describe("withPlaceOverrides", () => {
  test("adds and removes place ids; ignores other kinds", () => {
    const ids = withPlaceOverrides(
      ["a", "b"],
      new Map([
        ["place:b", false],
        ["place:c", true],
        ["wine:a", false],
      ]),
    );
    assert.deepEqual([...ids].sort(), ["a", "c"]);
  });
});

const place = (id: string, relevance: number): PlaceResult => ({
  id,
  name: id,
  primary_category: "wine_bar",
  categories: ["wine_bar"],
  location: { coordinates: [-89.38, 43.07] },
  overallRelevance: relevance,
});

describe("want-to-go pins", () => {
  test("a saved place wears the badged pin and outranks its neighbours", () => {
    const geo = transformToGeoJSON(
      [place("saved", 10), place("plain", 90)],
      {
        selectedItemTypes: ["wine"],
        searchQuery: "",
        minRating: 0,
      } as never,
      new Set(["saved"]),
    );
    const byId = new Map(
      geo.features.map((feature) => [
        feature.properties.id,
        feature.properties,
      ]),
    );
    const saved = byId.get("saved");
    const plain = byId.get("plain");
    assert.ok(saved && !saved.isCluster && plain && !plain.isCluster);
    assert.equal(saved.wantToTry, true);
    assert.equal(saved.pinImageName, pinImageName("bar", "poi-wine", true));
    assert.match(saved.pinImageName, /^pin-want-/);
    assert.equal(plain.wantToTry, false);
    assert.match(plain.pinImageName, /^pin-(?!want-)/);
    // Placement priority and full opacity even under a filter that dims.
    assert.equal(saved.sortKey, 10 + WANT_TO_TRY_SORT_BOOST);
    assert.ok(saved.sortKey > plain.sortKey);
    assert.equal(saved.opacity, 1);
  });

  test("with no list every pin is plain", () => {
    const geo = transformToGeoJSON([place("x", 50)]);
    const props = geo.features[0]?.properties;
    assert.ok(props && !props.isCluster);
    assert.equal(props.wantToTry, false);
  });
});
