/**
 * X08's adapters as data: what a Save sends, what its toast says, how the
 * `/want-to-try` filter reaches the server, and how an entry becomes a row —
 * including the entries the server nulled, which are skipped, not drawn.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  emptyCopy,
  filterFromParam,
  placeIdsFromEntries,
  TRY_NEXT_SHOWN,
  targetInput,
  targetKey,
  tryNextRows,
  wantToTryMessage,
  wantToTryPage,
  wantToTryRowFromEntry,
  wantToTryVariables,
} from "./adapter";
import { WANT_TO_TRY_PAGE_SIZE } from "./queries";

const WINE = "11111111-1111-4111-8111-111111111111";
const RECIPE = "22222222-2222-4222-8222-222222222222";
const PLACE = "33333333-3333-4333-8333-333333333333";

describe("targetInput / targetKey", () => {
  test("each kind sends exactly one target", () => {
    assert.deepEqual(
      targetInput({ kind: "ITEM", itemType: "WINE", itemId: WINE }),
      { itemType: "WINE", itemId: WINE },
    );
    assert.deepEqual(targetInput({ kind: "RECIPE", recipeId: RECIPE }), {
      recipeId: RECIPE,
    });
    assert.deepEqual(targetInput({ kind: "PLACE", placeId: PLACE }), {
      placeId: PLACE,
    });
  });
  test("keys match the API's `key`", () => {
    assert.equal(
      targetKey({ kind: "ITEM", itemType: "SAKE", itemId: WINE }),
      `sake:${WINE}`,
    );
    assert.equal(
      targetKey({ kind: "RECIPE", recipeId: RECIPE }),
      `recipe:${RECIPE}`,
    );
    assert.equal(
      targetKey({ kind: "PLACE", placeId: PLACE }),
      `place:${PLACE}`,
    );
  });
});

describe("wantToTryMessage", () => {
  test("names the thing when it has a name", () => {
    assert.equal(wantToTryMessage(true, "Barolo"), "Barolo is on Want to try");
    assert.equal(
      wantToTryMessage(false, " Barolo "),
      "Barolo is off Want to try",
    );
  });
  test("falls back to the list's name", () => {
    assert.equal(wantToTryMessage(true), "Saved to Want to try");
    assert.equal(wantToTryMessage(false, "  "), "Removed from Want to try");
  });
});

describe("the ?kind= filter", () => {
  test("only the three kinds are read; anything else is everything", () => {
    assert.equal(filterFromParam("places"), "places");
    assert.equal(filterFromParam(["recipes", "items"]), "recipes");
    assert.equal(filterFromParam("bottles"), "all");
    assert.equal(filterFromParam(undefined), "all");
  });
  test("reaches the server as kinds, with the cursor", () => {
    assert.deepEqual(wantToTryVariables("all", null), {
      first: WANT_TO_TRY_PAGE_SIZE,
      after: null,
      kinds: null,
    });
    assert.deepEqual(wantToTryVariables("items", "c2").kinds, ["ITEM"]);
    assert.deepEqual(wantToTryVariables("places", null).kinds, ["PLACE"]);
    assert.deepEqual(wantToTryVariables("recipes", null).kinds, ["RECIPE"]);
  });
  test("every filter has its own empty line", () => {
    const titles = new Set(
      (["all", "items", "places", "recipes"] as const).map(
        (filter) => emptyCopy(filter).title,
      ),
    );
    assert.equal(titles.size, 4);
  });
});

const wineEntry = {
  __typename: "WantToTryEntry" as const,
  key: `wine:${WINE}`,
  kind: "ITEM" as const,
  savedAt: "2026-10-08T03:00:00.000Z",
  item: {
    __typename: "Wine" as const,
    id: WINE,
    type: "WINE" as const,
    name: "barolo riserva",
    country: "ITALY",
    isWantToTry: true,
    vintage: "2016-01-01",
    images: {
      edges: [
        {
          node: {
            __typename: "ItemImage" as const,
            id: "img",
            file: {
              __typename: "File" as const,
              id: "f",
              url: "https://files.test/b.jpg",
            },
          },
        },
      ],
    },
  },
  recipe: null,
  place: null,
};

const recipeEntry = {
  __typename: "WantToTryEntry" as const,
  key: `recipe:${RECIPE}`,
  kind: "RECIPE" as const,
  savedAt: "2026-10-08T02:00:00.000Z",
  item: null,
  recipe: {
    __typename: "Recipe" as const,
    id: RECIPE,
    name: "Paper Plane",
    type: "cocktail" as const,
    imageUrl: null,
    isWantToTry: true,
  },
  place: null,
};

const placeEntry = {
  __typename: "WantToTryEntry" as const,
  key: `place:${PLACE}`,
  kind: "PLACE" as const,
  savedAt: "2026-10-08T01:00:00.000Z",
  item: null,
  recipe: null,
  place: {
    __typename: "Place" as const,
    id: PLACE,
    name: "cork & barrel",
    displayName: "Cork & Barrel",
    primaryCategory: "wine_bar",
    locality: "Madison",
  },
};

describe("wantToTryRowFromEntry", () => {
  test("an item: vintage first, type and country, its own page, its photo", () => {
    const row = wantToTryRowFromEntry(wineEntry as never);
    assert.ok(row);
    assert.equal(row.title.startsWith("2016 "), true);
    assert.equal(row.description, "Wine · Italy");
    assert.equal(row.href, `/wines/${WINE}`);
    assert.equal(row.imageUrl, "https://files.test/b.jpg");
    assert.deepEqual(row.target, {
      kind: "ITEM",
      itemType: "WINE",
      itemId: WINE,
    });
  });
  test("a recipe links to its page", () => {
    const row = wantToTryRowFromEntry(recipeEntry as never);
    assert.ok(row);
    assert.equal(row.title, "Paper Plane");
    assert.equal(row.description, "Cocktail recipe");
    assert.equal(row.href, `/recipes/${RECIPE}`);
    assert.equal(row.itemType, null);
  });
  test("a place: its display name, category and town", () => {
    const row = wantToTryRowFromEntry(placeEntry as never);
    assert.ok(row);
    assert.equal(row.title, "Cork & Barrel");
    assert.equal(row.description, "Wine Bar · Madison");
    assert.equal(row.href, `/places/${PLACE}`);
  });
  test("an entry whose target the server nulled is skipped", () => {
    assert.equal(
      wantToTryRowFromEntry({ ...wineEntry, item: null } as never),
      null,
    );
    const page = wantToTryPage({
      edges: [
        { node: { ...recipeEntry, recipe: null } as never },
        { node: placeEntry as never },
      ],
      pageInfo: { hasNextPage: false, endCursor: "c1" },
      totalCount: 2,
    });
    assert.deepEqual(
      page.rows.map((row) => row.key),
      [`place:${PLACE}`],
    );
    assert.equal(page.totalCount, 2);
    assert.equal(page.endCursor, "c1");
  });
});

describe("placeIdsFromEntries", () => {
  test("the place ids, nulls dropped", () => {
    assert.deepEqual(
      placeIdsFromEntries([
        { node: { place: { id: "a" } } },
        { node: { place: null } },
        { node: { place: { id: "b" } } },
      ]),
      ["a", "b"],
    );
  });
});

describe("tryNextRows (insights' Try This Next, X08)", () => {
  const hit = (id: string, over: Record<string, unknown> = {}) => ({
    item: {
      __typename: "Wine",
      id,
      type: "WINE",
      name: `wine ${id}`,
      isWantToTry: false,
      vintage: "2019-01-01",
      ...over,
    },
  });

  test("the search's order, minus what is on the list and repeats, at most three", () => {
    const rows = tryNextRows(
      [
        hit("a"),
        hit("b"),
        hit("a"),
        hit("c", { isWantToTry: true }),
        hit("d"),
        hit("e"),
      ],
      new Set(["/wines/b"]),
    );
    assert.deepEqual(
      rows.map((row) => row.href),
      ["/wines/a", "/wines/c", "/wines/d"],
    );
    assert.equal(rows.length, TRY_NEXT_SHOWN);
    assert.equal(rows[1]?.saved, true);
    assert.equal(rows[0]?.title.startsWith("2019 "), true);
    assert.deepEqual(rows[0]?.target, {
      kind: "ITEM",
      itemType: "WINE",
      itemId: "a",
    });
  });

  test("nothing found is nothing shown — never padded", () => {
    assert.deepEqual(tryNextRows([], new Set()), []);
    assert.deepEqual(tryNextRows([hit("a")], new Set(["/wines/a"])), []);
  });
});
