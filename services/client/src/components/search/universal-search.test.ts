/**
 * X12 — universal search's model: which sections a search shows, in what
 * order, the rows each one holds, and where "See all" goes.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  allResultsHref,
  bottleRows,
  boundsAround,
  brandRows,
  buildSections,
  distanceLabel,
  hasMore,
  itemRows,
  mapSearchHref,
  metresBetween,
  PLACE_NAME_MATCH,
  peopleRows,
  placeRows,
  recipeRows,
  SEARCH_SECTIONS,
  SECTION_PREVIEW_SIZE,
  searchUnanswered,
  sectionAnswered,
  sectionFromParam,
  sectionsToRead,
  seeAllHref,
  semanticSearchFrom,
  totalLabel,
} from "./universal-search";

const item = (over: Record<string, unknown> = {}) =>
  ({
    __typename: "Wine",
    id: "w1",
    type: "WINE",
    name: "Barolo",
    country: null,
    isFavorite: false,
    favoriteCount: 0,
    myReview: null,
    score: { average: 4.5, count: 2 },
    images: { edges: [] },
    brands: { edges: [] },
    vintage: "2016-01-01",
    variety: "Nebbiolo",
    ...over,
  }) as never;

const items = (...nodes: unknown[]) =>
  ({
    itemSearch: {
      __typename: "ItemSearchConnection",
      edges: nodes.map((node, i) => ({
        node: { __typename: "ItemSearchResult", id: `h${i}`, item: node },
      })),
    },
  }) as never;

const places = (
  ...nodes: { name: string; textRank?: number; trigram?: number }[]
) =>
  ({
    placeSearch: {
      __typename: "PlaceSearchConnection",
      edges: nodes.map((n, i) => ({
        node: {
          id: `p${i}`,
          name: n.name,
          primaryCategory: "wine_bar",
          locality: "Columbus",
          region: "OH",
          rating: null,
          textRank: n.textRank ?? 0,
          trigramSimilarity: n.trigram ?? 0,
          reviewStatus: "APPROVED",
        },
      })),
    },
  }) as never;

describe("sections and their links", () => {
  test("D10's order", () => {
    assert.deepEqual(SEARCH_SECTIONS, [
      "bottles",
      "items",
      "places",
      "recipes",
      "people",
      "brands",
    ]);
    assert.equal(SECTION_PREVIEW_SIZE, 3);
  });

  test("?in= opens a known section and ignores anything else", () => {
    assert.equal(sectionFromParam("items"), "items");
    assert.equal(sectionFromParam(["people", "items"]), "people");
    assert.equal(sectionFromParam("tabs"), null);
    assert.equal(sectionFromParam(undefined), null);
  });

  test("See all: always in place, its chip lit; places keep a way to the map", () => {
    assert.equal(
      seeAllHref("items", "red wine"),
      "/search?q=red%20wine&in=items",
    );
    assert.equal(
      seeAllHref("places", "Copper & Co"),
      "/search?q=Copper%20%26%20Co&in=places",
    );
    assert.equal(seeAllHref("brands", "krug"), "/search?q=krug&in=brands");
    assert.equal(mapSearchHref("Copper & Co"), "/map?search=Copper%20%26%20Co");
    assert.equal(allResultsHref("red wine"), "/search?q=red%20wine");
  });
});

describe("rows", () => {
  test("an item: name and vintage, type and variety, its score, its page", () => {
    const [row] = itemRows(items(item())).rows;
    assert.deepEqual(row, {
      key: "WINE:w1",
      title: "Barolo 2016",
      description: "Nebbiolo",
      href: "/wines/w1",
      // F-42: the desktop pane opens the item's page body.
      look: { kind: "item", itemId: "w1", itemType: "WINE" },
      thumb: { kind: "item", itemType: "WINE" },
      score: 4.5,
    });
  });

  test("an item with a photo shows it", () => {
    const [row] = itemRows(
      items(
        item({
          images: {
            edges: [
              {
                node: {
                  __typename: "ItemImage",
                  id: "i",
                  fileId: "f",
                  placeholder: null,
                  file: { __typename: "File", id: "f", url: "https://x/y.jpg" },
                },
              },
            ],
          },
        }),
      ),
    ).rows;
    assert.deepEqual(row?.thumb, { kind: "image", url: "https://x/y.jpg" });
  });

  test("a failed item search is no rows, not an error", () => {
    assert.deepEqual(
      itemRows({
        itemSearch: { __typename: "ConflictError", code: "CONFLICT" },
      } as never).rows,
      [],
    );
    assert.deepEqual(itemRows(undefined).rows, []);
  });

  test("a bottle: where it is and how many, opening the bottle in its cellar", () => {
    const { rows, total } = bottleRows({
      me: {
        __typename: "Viewer",
        id: "me",
        aiCapabilities: { semanticSearch: true },
        bottleSearch: {
          totalCount: 7,
          edges: [
            {
              node: {
                cellarItemId: "ci1",
                cellarId: "c1",
                cellarName: "Bar Cart",
                bottleCount: 2,
                item: item({
                  __typename: "Spirit",
                  type: "SPIRIT",
                  id: "s1",
                  name: "Lagavulin 16",
                  vintage: null,
                  variety: undefined,
                }),
              },
            },
            {
              node: {
                cellarItemId: "ci2",
                cellarId: "c2",
                cellarName: "Garage",
                bottleCount: 1,
                item: item({
                  __typename: "Spirit",
                  type: "SPIRIT",
                  id: "s1",
                  name: "Lagavulin 16",
                  vintage: null,
                  variety: undefined,
                }),
              },
            },
          ],
        },
      },
    } as never);
    assert.equal(total, 7);
    assert.deepEqual(
      rows.map((row) => [row.title, row.description, row.href]),
      [
        ["Lagavulin 16", "Bar Cart · 2 bottles", "/cellars/c1/spirits/ci1"],
        ["Lagavulin 16", "Garage", "/cellars/c2/spirits/ci2"],
      ],
    );
  });

  test("places: with no position, only the ones whose name matched", () => {
    const data = places(
      { name: "Copper Lantern", trigram: 0.9 },
      { name: "Some Wine Bar" },
      { name: "Lantern Room", textRank: 0.1 },
      { name: "Near Miss", trigram: PLACE_NAME_MATCH - 0.01 },
    );
    assert.deepEqual(
      placeRows(data, { bounded: false }).rows.map((row) => row.title),
      ["Copper Lantern", "Lantern Room"],
    );
    assert.equal(placeRows(data, { bounded: true }).rows.length, 4);
    const [row] = placeRows(data, { bounded: true }).rows;
    assert.equal(row?.description, "Wine Bar · Columbus");
    assert.equal(row?.href, "/places/p0");
  });

  test("a place under review says so", () => {
    const data = places({ name: "Mine", trigram: 1 }) as {
      placeSearch: { edges: { node: { reviewStatus: string } }[] };
    };
    const edge = data.placeSearch.edges[0];
    if (edge) edge.node.reviewStatus = "PENDING";
    const [row] = placeRows(data as never, { bounded: false }).rows;
    assert.equal(row?.description, "Wine Bar · Columbus · Under review");
  });

  test("recipes: one row per group, the group's name and page, and what you can make", () => {
    const hit = (
      recipeId: string,
      group: { id: string; name: string } | null,
      makeability: { status: string; missing: string[] } | null = null,
    ) => ({
      node: {
        recipeId,
        name: `${recipeId} v1`,
        description: null,
        type: "cocktail",
        recipeGroupId: group?.id ?? null,
        distance: null,
        recipe: {
          id: recipeId,
          imageUrl: null,
          recipeGroup: group,
          makeability,
        },
      },
    });
    const rows = recipeRows({
      recipeSearch: {
        __typename: "RecipeSearchConnection",
        edges: [
          hit(
            "r1",
            { id: "g1", name: "Negroni" },
            { status: "MAKE_NOW", missing: [] },
          ),
          hit("r2", { id: "g1", name: "Negroni" }),
          hit("r3", null, { status: "ONE_AWAY", missing: ["Campari"] }),
        ],
      },
    } as never).rows;
    assert.deepEqual(
      rows.map((row) => [row.title, row.description, row.href]),
      [
        // Ruling 4: a group is one row, with how many of its versions matched.
        [
          "Negroni",
          "Cocktail · 2 versions · You can make this",
          "/recipes/groups/g1",
        ],
        ["r3 v1", "Cocktail · Missing Campari", "/recipes/r3"],
      ],
    );
    assert.deepEqual(rows[0]?.thumb, { kind: "icon", icon: "recipe" });
  });

  test("a recipe's free-form picture is an external thumb, not a next/image one", () => {
    const [row] = recipeRows({
      recipeSearch: {
        __typename: "RecipeSearchConnection",
        edges: [
          {
            node: {
              recipeId: "r1",
              name: "Paper Plane",
              description: null,
              type: "cocktail",
              recipeGroupId: null,
              distance: 0.3,
              recipe: {
                id: "r1",
                imageUrl: "https://example.com/plane.jpg",
                recipeGroup: null,
                makeability: null,
              },
            },
          },
        ],
      },
    } as never).rows;
    assert.deepEqual(row?.thumb, {
      kind: "external",
      url: "https://example.com/plane.jpg",
    });
    assert.equal(row?.description, "Cocktail");
  });

  test("people: a friend opens their profile; anyone else ends in their action", () => {
    const rows = peopleRows({
      userSearch: {
        __typename: "UserSearchConnection",
        edges: [
          {
            node: {
              userId: "u1",
              displayName: "Alfred",
              avatarUrl: null,
              relation: "FRIEND",
            },
          },
          {
            node: {
              userId: "u2",
              displayName: "Alonzo",
              avatarUrl: null,
              relation: "REQUEST_RECEIVED",
              pendingRequestId: "req-2",
            },
          },
          {
            node: {
              userId: "u3",
              displayName: "Alberta",
              avatarUrl: null,
              relation: "NONE",
            },
          },
        ],
      },
    } as never).rows;
    assert.deepEqual(
      rows.map((row) => [row.title, row.description, row.href, row.person]),
      [
        ["Alfred", "Friend", "/users/u1", undefined],
        [
          "Alonzo",
          "Wants to be friends",
          undefined,
          {
            userId: "u2",
            name: "Alonzo",
            relation: "REQUEST_RECEIVED",
            requestId: "req-2",
          },
        ],
        [
          "Alberta",
          undefined,
          undefined,
          { userId: "u3", name: "Alberta", relation: "NONE", requestId: null },
        ],
      ],
    );
  });

  test("a brand: its kind and item count, zero hidden", () => {
    const rows = brandRows({
      brandSearch: {
        __typename: "BrandSearchConnection",
        edges: [
          {
            node: {
              id: "b1",
              brand: {
                id: "b1",
                name: "Ridge",
                brandType: "winery",
                itemCount: 3,
              },
            },
          },
          {
            node: {
              id: "b2",
              brand: { id: "b2", name: "New", brandType: null, itemCount: 0 },
            },
          },
        ],
      },
    } as never).rows;
    assert.deepEqual(
      rows.map((row) => [row.title, row.description, row.href]),
      [
        ["Ridge", "Winery · 3 drinks", "/brands/b1"],
        ["New", undefined, "/brands/b2"],
      ],
    );
  });
});

describe("answered, or failed", () => {
  const emptyPeople = {
    userSearch: { __typename: "UserSearchConnection", edges: [] },
  } as never;

  test("a connection answers, even an empty one; a rejection or an error type does not", () => {
    assert.equal(sectionAnswered("people", { people: emptyPeople }), true);
    assert.equal(sectionAnswered("people", {}), false);
    assert.equal(
      sectionAnswered("items", {
        items: {
          itemSearch: { __typename: "BudgetExceededError", message: "spent" },
        } as never,
      }),
      false,
    );
    assert.equal(
      sectionAnswered("bottles", { bottles: { me: null } as never }),
      false,
    );
  });

  test("the page is unanswered only when every section it asked failed", () => {
    assert.equal(searchUnanswered(SEARCH_SECTIONS, {}), true);
    // One empty answer is an answer: then "Nothing called …" is true.
    assert.equal(
      searchUnanswered(SEARCH_SECTIONS, { people: emptyPeople }),
      false,
    );
    // An opened section is judged on its own read.
    assert.equal(searchUnanswered(["items"], { people: emptyPeople }), true);
    assert.equal(searchUnanswered([], {}), false);
  });
});

describe("buildSections", () => {
  test("only sections with rows, in order; See all past three", () => {
    const sections = buildSections(
      {
        items: items(
          item({ id: "a" }),
          item({ id: "b" }),
          item({ id: "c" }),
          item({ id: "d" }),
        ),
        places: places({ name: "Copper Lantern", trigram: 1 }),
        people: {
          userSearch: { __typename: "UserSearchConnection", edges: [] },
        } as never,
      },
      { bounded: false },
    );
    assert.deepEqual(
      sections.map((s) => [s.section, s.label, s.rows.length, hasMore(s)]),
      [
        ["items", "Drinks", 4, true],
        ["places", "Places", 1, false],
      ],
    );
  });

  test("nothing anywhere is no sections — the page's empty state", () => {
    assert.deepEqual(buildSections({}, { bounded: true }), []);
  });

  test("bottles count past their rows", () => {
    const [bottles] = buildSections(
      {
        bottles: {
          me: {
            __typename: "Viewer",
            id: "me",
            aiCapabilities: { semanticSearch: false },
            bottleSearch: {
              totalCount: 9,
              edges: [
                {
                  node: {
                    cellarItemId: "ci1",
                    cellarId: "c1",
                    cellarName: "Bar",
                    bottleCount: 1,
                    item: item(),
                  },
                },
              ],
            },
          },
        } as never,
      },
      { bounded: true },
    );
    assert.equal(bottles?.total, 9);
    assert.equal(bottles && hasMore(bottles), true);
  });
});

describe("the AI line and the place box", () => {
  test("semantic search is read off the viewer, null when unknown", () => {
    assert.equal(
      semanticSearchFrom({
        me: { aiCapabilities: { semanticSearch: false } },
      } as never),
      false,
    );
    assert.equal(semanticSearchFrom(undefined), null);
  });

  test("the box is about 0.3° each way, wider in longitude away from the equator", () => {
    const box = boundsAround({ latitude: 60, longitude: 10 });
    assert.ok(Math.abs(box.north - 60.3) < 1e-9);
    assert.ok(Math.abs(box.south - 59.7) < 1e-9);
    assert.ok(Math.abs(box.east - 10.6) < 1e-9);
    const pole = boundsAround({ latitude: 89.9, longitude: 179.9 });
    assert.equal(pole.north, 90);
    assert.equal(pole.east, 180);
  });
});

describe("totals (MC-search, CROSS-LOT: never a limit as a total)", () => {
  const counted = (total: number | null, lowerBound: boolean) =>
    ({
      itemSearch: {
        __typename: "ItemSearchConnection",
        totalCount: total,
        totalIsLowerBound: lowerBound,
        edges: [item({ id: "a" }), item({ id: "b" })].map((node, i) => ({
          node: { __typename: "ItemSearchResult", id: `h${i}`, item: node },
        })),
      },
    }) as never;

  test("the API's count, and '200+' when it is only a lower bound", () => {
    const exact = itemRows(counted(42, false));
    assert.equal(totalLabel(exact), "42");
    const capped = itemRows(counted(200, true));
    assert.equal(capped.total, 200);
    assert.equal(totalLabel(capped), "200+");
  });

  test("no count from the API is the rows in hand, never the limit", () => {
    const rows = itemRows(counted(null, true));
    assert.equal(totalLabel(rows), "2");
  });

  test("Drinks leaves out what Your bottles shows (ruling 1), and counts so", () => {
    const sections = buildSections(
      {
        bottles: {
          me: {
            __typename: "Viewer",
            id: "me",
            aiCapabilities: { semanticSearch: true },
            bottleSearch: {
              totalCount: 1,
              edges: [
                {
                  node: {
                    cellarItemId: "ci1",
                    cellarId: "c1",
                    cellarName: "Garage",
                    bottleCount: 1,
                    item: item({ id: "a" }),
                  },
                },
              ],
            },
          },
        } as never,
        items: counted(10, false),
      },
      { bounded: false },
    );
    const [bottles, drinks] = sections;
    assert.equal(bottles?.context, "in Garage");
    assert.deepEqual(
      drinks?.rows.map((row) => row.key),
      ["WINE:b"],
    );
    assert.equal(drinks?.total, 9);
  });
});

describe("distance from you", () => {
  test("Here within 25 m; metres, then kilometres, with a narrow space", () => {
    assert.equal(distanceLabel(10), "Here");
    assert.equal(distanceLabel(142.4), "142\u202fm");
    assert.equal(distanceLabel(1400), "1.4\u202fkm");
    assert.equal(distanceLabel(23_000), "23\u202fkm");
  });

  test("a place row reads its distance from the origin, and names it", () => {
    const data = {
      placeSearch: {
        __typename: "PlaceSearchConnection",
        totalCount: 79,
        totalIsLowerBound: false,
        edges: [
          {
            node: {
              id: "p0",
              name: "Corner Cafe",
              primaryCategory: "cafe",
              locality: "Columbus",
              region: "OH",
              rating: 4.7,
              location: { lat: 40.001, lng: -83 },
              textRank: 1,
              trigramSimilarity: 1,
              reviewStatus: "APPROVED",
            },
          },
        ],
      },
    } as never;
    const placesSection = placeRows(data, {
      bounded: true,
      origin: { latitude: 40, longitude: -83 },
    });
    assert.equal(placesSection.context, "from you");
    assert.equal(placesSection.total, 79);
    assert.equal(placesSection.rows[0]?.description, "Cafe · 111\u202fm");
    assert.equal(placesSection.rows[0]?.rating, 4.7);
    assert.ok(
      Math.abs(
        metresBetween(
          { latitude: 40, longitude: -83 },
          { lat: 40.001, lng: -83 },
        ) - 111,
      ) < 1,
    );
  });
});

describe("fix round (R1)", () => {
  const recipeHit = (recipeId: string, groupId: string | null) => ({
    node: {
      recipeId,
      name: `${recipeId} v1`,
      description: null,
      type: "cocktail",
      recipeGroupId: groupId,
      distance: null,
      recipe: {
        id: recipeId,
        imageUrl: null,
        recipeGroup: groupId === null ? null : { id: groupId, name: groupId },
        makeability: null,
      },
    },
  });

  test("F-104: groups folded from one page of a longer list read 'n+'", () => {
    const rows = recipeRows({
      recipeSearch: {
        __typename: "RecipeSearchConnection",
        totalCount: 45,
        totalIsLowerBound: false,
        edges: [
          recipeHit("r1", "g1"),
          recipeHit("r2", "g1"),
          recipeHit("r3", null),
        ],
      },
    } as never);
    assert.equal(rows.total, 2);
    assert.equal(totalLabel(rows), "2+");
  });

  test("F-104: every hit in hand, folded, is an exact count of groups", () => {
    const rows = recipeRows({
      recipeSearch: {
        __typename: "RecipeSearchConnection",
        totalCount: 3,
        totalIsLowerBound: false,
        edges: [
          recipeHit("r1", "g1"),
          recipeHit("r2", "g1"),
          recipeHit("r3", null),
        ],
      },
    } as never);
    assert.equal(totalLabel(rows), "2");
  });

  test("F-98: See all on Drinks still reads your bottles, to leave them out", () => {
    assert.deepEqual(sectionsToRead(null), [...SEARCH_SECTIONS]);
    assert.deepEqual(sectionsToRead("items"), ["bottles", "items"]);
    assert.deepEqual(sectionsToRead("places"), ["places"]);
  });
});
