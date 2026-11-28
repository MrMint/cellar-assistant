import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createPlaceHref, showNotOnMapYet } from "./search-empty-state";

const searched = {
  isSemanticSearch: true,
  searchQuery: "Copper Lantern",
  answeredQuery: "Copper Lantern",
  resultCount: 0,
  isLoading: false,
  isPlacing: false,
};

describe("showNotOnMapYet (N22)", () => {
  test("a finished search for this query with no results", () => {
    assert.equal(showNotOnMapYet(searched), true);
    assert.equal(
      showNotOnMapYet({ ...searched, searchQuery: " Copper Lantern " }),
      true,
    );
  });

  test("not while the search is still running, or answered for another query", () => {
    assert.equal(showNotOnMapYet({ ...searched, isLoading: true }), false);
    assert.equal(showNotOnMapYet({ ...searched, answeredQuery: null }), false);
    assert.equal(
      showNotOnMapYet({ ...searched, answeredQuery: "Copper" }),
      false,
    );
  });

  test("not when there are results, no query, a filter search, or mid pin-drop", () => {
    assert.equal(showNotOnMapYet({ ...searched, resultCount: 2 }), false);
    assert.equal(
      showNotOnMapYet({ ...searched, searchQuery: "  ", answeredQuery: "" }),
      false,
    );
    assert.equal(
      showNotOnMapYet({ ...searched, isSemanticSearch: false }),
      false,
    );
    assert.equal(showNotOnMapYet({ ...searched, isPlacing: true }), false);
  });
});

describe("createPlaceHref", () => {
  test("carries the pin and, when there is one, the searched name", () => {
    assert.equal(
      createPlaceHref({ latitude: 43.07, longitude: -89.38 }),
      "/map/create-place?lat=43.07&lng=-89.38",
    );
    assert.equal(
      createPlaceHref({
        latitude: 43.07,
        longitude: -89.38,
        name: " Copper & Lantern ",
      }),
      "/map/create-place?lat=43.07&lng=-89.38&name=Copper+%26+Lantern",
    );
    assert.equal(
      createPlaceHref({ latitude: 1, longitude: 2, name: "   " }),
      "/map/create-place?lat=1&lng=2",
    );
  });
});
