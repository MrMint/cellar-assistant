/**
 * The favorites adapters, pinned against `82450ad1`'s `FavoritesClient`
 * mapping — and the two things it got wrong: no sake or tea, and a filter
 * that never reached the server.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  favoriteRowFromNode,
  favoritesCacheKey,
  favoritesVariables,
} from "./adapter";
import { FAVORITES_PAGE_SIZE } from "./fragments";

describe("favoritesVariables (the ?types= filter → favorites(types:))", () => {
  test("no filter is every type", () => {
    assert.deepEqual(favoritesVariables([], null), {
      first: FAVORITES_PAGE_SIZE,
      after: null,
      types: null,
    });
    assert.equal(favoritesVariables(undefined, null).types, null);
  });
  test("a filter goes to the server, with the cursor", () => {
    assert.deepEqual(favoritesVariables(["TEA", "SAKE"], "c9"), {
      first: FAVORITES_PAGE_SIZE,
      after: "c9",
      types: ["TEA", "SAKE"],
    });
  });
  test("the page size is inside the API's cap of 100", () => {
    assert.ok(FAVORITES_PAGE_SIZE >= 1 && FAVORITES_PAGE_SIZE <= 100);
  });
});

describe("favoriteRowFromNode", () => {
  test("a tea favourite is a card keyed and typed by the item", () => {
    const row = favoriteRowFromNode({
      __typename: "Tea",
      id: "t1",
      type: "TEA",
      name: "Gyokuro",
      isFavorite: true,
      favoriteCount: 5,
      myReview: { __typename: "ItemReview", id: "r1", score: 4 },
      score: { average: 4, count: 1 },
      images: { edges: [] },
      brands: { edges: [] },
      category: "GREEN",
    } as never);
    assert.equal(row.type, "TEA");
    assert.equal(row.item.id, "t1");
    assert.equal(row.item.itemId, "t1");
    assert.equal(row.item.isFavorite, true);
    assert.equal(row.item.reviewed, true);
    assert.equal(row.item.favoriteCount, 5);
    assert.equal(row.item.vintage, undefined, "tea had no vintage");
  });
});

test("favoritesCacheKey keeps scroll restore per filter", () => {
  assert.equal(favoritesCacheKey([]), "favorites-all");
  assert.equal(favoritesCacheKey(["WINE"]), "favorites-WINE");
});
