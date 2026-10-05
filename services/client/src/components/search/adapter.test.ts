/**
 * The `/search` adapters, pinned against `82450ad1`'s page: which branch the
 * URL selects, the stats line's copy, and what a hit becomes on a card.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  barcodeSearchHref,
  collectionStatsLine,
  MAX_BARCODE_LENGTH,
  searchResultFromCard,
  searchResultsFromNodes,
  searchStateFromParams,
} from "./adapter";
import {
  BARCODE_SEARCH_LIMIT,
  ITEM_SEARCH_LIMIT,
  ITEM_SEARCH_MAX_DISTANCE,
} from "./queries";

const zero = { wine: 0, beer: 0, spirit: 0, coffee: 0, sake: 0, tea: 0 };

describe("collectionStatsLine (the old CollectionStats copy)", () => {
  test("nothing yet", () => {
    assert.equal(
      collectionStatsLine({ cellarCount: 2, itemCounts: zero }),
      "Your collection awaits. Start by adding your first item.",
    );
  });
  test("one item, one cellar", () => {
    assert.equal(
      collectionStatsLine({
        cellarCount: 1,
        itemCounts: { ...zero, sake: 1 },
      }),
      "1 item across 1 cellar",
    );
  });
  test("the six types are summed, sake and tea included", () => {
    assert.equal(
      collectionStatsLine({
        cellarCount: 3,
        itemCounts: { wine: 4, beer: 1, spirit: 2, coffee: 1, sake: 1, tea: 1 },
      }),
      "10 items across 3 cellars",
    );
  });
});

describe("searchStateFromParams (the old hasActiveSearch)", () => {
  test("no params is the landing view", () => {
    assert.deepEqual(searchStateFromParams({}), {
      query: null,
      barcode: null,
      imageSearch: false,
      hasActiveSearch: false,
    });
  });
  test("a blank ?q= is still the landing view", () => {
    assert.equal(searchStateFromParams({ q: "   " }).hasActiveSearch, false);
  });
  test("?q= is trimmed and activates the results view", () => {
    const state = searchStateFromParams({ q: "  hazy IPA " });
    assert.equal(state.query, "hazy IPA");
    assert.equal(state.hasActiveSearch, true);
  });
  test("a repeated param takes the first", () => {
    assert.equal(searchStateFromParams({ q: ["a", "b"] }).query, "a");
  });
  test("?barcode= carries a code, not result rows", () => {
    const state = searchStateFromParams({ barcode: "0123456789012" });
    assert.equal(state.barcode, "0123456789012");
    assert.equal(state.hasActiveSearch, true);
  });
  test("an implausibly long code is ignored, not sent", () => {
    const long = "1".repeat(MAX_BARCODE_LENGTH + 1);
    assert.equal(searchStateFromParams({ barcode: long }).barcode, null);
  });
  test("an old image-search link lands on the G32 notice", () => {
    assert.equal(
      searchStateFromParams({ image_results: "%5B%5D" }).imageSearch,
      true,
    );
    assert.equal(
      searchStateFromParams({ image_no_results: "true" }).imageSearch,
      true,
    );
    assert.equal(
      searchStateFromParams({ image_no_results: "false" }).imageSearch,
      false,
    );
  });
  test("the old stub's ?barcode_no_results= is ignored", () => {
    assert.equal(
      searchStateFromParams({ barcode_no_results: "true" } as never)
        .hasActiveSearch,
      false,
    );
  });
});

describe("barcodeSearchHref", () => {
  test("encodes the code into ?barcode=", () => {
    assert.equal(barcodeSearchHref(" 978 0 "), "/search?barcode=978%200");
  });
  test("blank and over-long codes go nowhere", () => {
    assert.equal(barcodeSearchHref("  "), null);
    assert.equal(barcodeSearchHref("9".repeat(MAX_BARCODE_LENGTH + 1)), null);
  });
  test("round-trips through searchStateFromParams", () => {
    const href = barcodeSearchHref("5012345678900") ?? "";
    const code = new URL(href, "http://x").searchParams.get("barcode") ?? "";
    assert.equal(searchStateFromParams({ barcode: code }).barcode, code);
  });
});

const node = (over: Record<string, unknown>) =>
  ({
    __typename: "Wine",
    id: "w1",
    type: "WINE",
    name: "Barolo",
    isFavorite: false,
    favoriteCount: 3,
    myReview: null,
    score: { average: 4.5, count: 2 },
    images: { edges: [] },
    brands: { edges: [] },
    vintage: "2016-01-01",
    variety: "Nebbiolo",
    ...over,
  }) as never;

describe("searchResultFromCard", () => {
  test("a hit is an ItemCard keyed by the item, carrying its type", () => {
    const card = searchResultFromCard(node({}));
    assert.equal(card.type, "WINE");
    assert.equal(card.id, "w1");
    assert.equal(card.itemId, "w1");
    assert.equal(card.vintage, "2016");
    assert.equal(card.favoriteCount, 3);
    assert.equal(card.reviewed, false);
    assert.equal(card.score, 4.5);
  });
  test("sake and tea hits are cards too (the old search had both)", () => {
    const tea = searchResultFromCard(
      node({ __typename: "Tea", id: "t1", type: "TEA", category: "GREEN" }),
    );
    assert.equal(tea.type, "TEA");
    assert.equal(tea.vintage, undefined);
  });
  test("order is the server's", () => {
    const ids = searchResultsFromNodes([
      node({ id: "b" }),
      node({ id: "a" }),
    ]).map((card) => card.id);
    assert.deepEqual(ids, ["b", "a"]);
  });
});

test("limits match the old page and stay inside the API's caps", () => {
  assert.equal(ITEM_SEARCH_LIMIT, 10, "text_search(limit: 10)");
  assert.ok(ITEM_SEARCH_LIMIT >= 1 && ITEM_SEARCH_LIMIT <= 50);
  assert.equal(ITEM_SEARCH_MAX_DISTANCE, 1, "distance: { _lte: 1 }");
  assert.ok(BARCODE_SEARCH_LIMIT >= 1 && BARCODE_SEARCH_LIMIT <= 100);
});
