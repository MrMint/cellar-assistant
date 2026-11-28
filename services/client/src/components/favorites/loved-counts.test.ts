/**
 * F-135: Loved's subtitle and count chips come from `Viewer.lovedCounts`
 * (F-87), never from counting a page of `favorites`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { print } from "graphql";
import {
  LovedCountsQuery,
  lovedFilterCounts,
  lovedSubtitle,
} from "./loved-counts";

const counts = {
  drinks: 25,
  recipes: 2,
  beer: 16,
  wine: 5,
  spirit: 4,
  coffee: 0,
  sake: null,
  tea: 0,
};

describe("lovedSubtitle", () => {
  test("drinks and recipes, as the board writes it", () => {
    assert.equal(lovedSubtitle(counts), "25 drinks · 2 recipes");
  });
  test("singular words for one", () => {
    assert.equal(
      lovedSubtitle({ ...counts, drinks: 1, recipes: 1 }),
      "1 drink · 1 recipe",
    );
  });
  test("nothing loved, or no counts read, is no subtitle", () => {
    assert.equal(lovedSubtitle({ ...counts, drinks: 0, recipes: 0 }), null);
    assert.equal(lovedSubtitle(null), null);
  });
  test("a count the server left null is not a zero shown as one", () => {
    assert.equal(lovedSubtitle({ ...counts, recipes: null }), "25 drinks");
  });
});

describe("lovedFilterCounts (CellarItemsFilter's chip counts)", () => {
  test("per-kind counts, keyed as the filter keys them", () => {
    assert.deepEqual(lovedFilterCounts(counts), {
      beers: 16,
      wines: 5,
      spirits: 4,
      coffees: 0,
      sakes: undefined,
      teas: 0,
    });
  });
  test("no counts read is no chip counts", () => {
    assert.deepEqual(lovedFilterCounts(null), {});
  });
});

describe("LovedCountsQuery", () => {
  test("reads me.lovedCounts, every kind the chips show", () => {
    const source = print(LovedCountsQuery as never);
    for (const field of [
      "lovedCounts",
      "drinks",
      "recipes",
      "beer",
      "wine",
      "spirit",
      "coffee",
      "sake",
      "tea",
    ]) {
      assert.match(source, new RegExp(`\\b${field}\\b`));
    }
  });
});
