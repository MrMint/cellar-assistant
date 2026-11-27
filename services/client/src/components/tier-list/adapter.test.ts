/**
 * The tier-list adapters, pinned against what `82450ad1`'s
 * `tier-lists/[tierListId]/page.tsx` resolved and what its board sent.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { validateTierListInput } from "./actions";
import {
  addEntryFailureMessage,
  aiInsightsFromJson,
  bandMapOf,
  candidateHref,
  entryHref,
  entryTypeOf,
  insightsItemsFromNodes,
  itemDisplayFromNode,
  itemEntrySubtitle,
  itemTypeOfList,
  moveEntry,
  onListHrefs,
  placeEntrySubtitle,
  rankOf,
  reorderCallFor,
  type TierListItemNode,
  tierListDataFrom,
  tierListOptionsFor,
} from "./adapter";

const placeNode = (
  overrides: Partial<TierListItemNode> = {},
): TierListItemNode => ({
  id: "row-p",
  band: 4,
  position: 0,
  entryType: "PLACE",
  item: null,
  place: {
    id: "place-1",
    name: "raw name",
    displayName: "Bar Nine",
    primaryCategory: "wine_bar",
    locality: "Austin",
    region: "TX",
    countryCode: "US",
    myInteraction: { rating: 4 },
    enrichment: { googleRating: 4.6, googleUserRatingsTotal: 1234 },
  },
  ...overrides,
});

const itemNode = (
  item: Partial<NonNullable<TierListItemNode["item"]>>,
  overrides: Partial<TierListItemNode> = {},
): TierListItemNode => ({
  id: "row-i",
  band: 5,
  position: 0,
  entryType: item.type ?? "WINE",
  place: null,
  item: {
    id: "item-1",
    type: "WINE",
    name: "Thing",
    country: null,
    myReview: null,
    ...item,
  },
  ...overrides,
});

describe("itemDisplayFromNode (the old page's per-row resolution)", () => {
  test("a place: display name, category · locality · country, own rating, Google's", () => {
    const row = itemDisplayFromNode(placeNode());
    assert.deepEqual(row, {
      id: "row-p",
      band: 4,
      position: 0,
      name: "Bar Nine",
      subtitle: "Wine Bar · Austin · US",
      href: "/places/place-1",
      ownerScore: 4,
      viewerScore: 4,
      publicRating: 4.6,
      publicRatingCount: 1234,
    });
  });

  test("a place with no rating of the viewer's and no enrichment", () => {
    const row = itemDisplayFromNode(
      placeNode({
        place: {
          ...(placeNode().place ?? ({} as never)),
          myInteraction: null,
          enrichment: null,
        },
      }),
    );
    assert.equal(row.ownerScore, null);
    assert.equal(row.viewerScore, null);
    assert.equal(row.publicRating, null);
    assert.equal(row.publicRatingCount, null);
  });

  test("a wine: variety · year · country, the viewer's own review score, no public rating", () => {
    const row = itemDisplayFromNode(
      itemNode({
        name: "Chateau X",
        country: "FRANCE",
        wineVariety: "MERLOT",
        wineVintage: "2015-01-01",
        myReview: { score: 4.5 },
      }),
    );
    assert.equal(row.name, "Chateau X");
    assert.equal(row.subtitle, "Merlot · 2015 · France");
    assert.equal(row.href, "/wines/item-1");
    assert.equal(row.ownerScore, 4.5);
    assert.equal(row.viewerScore, 4.5);
    assert.equal(row.publicRating, null);
  });

  test("X23: on someone else's list the owner's score leads, yours beside it", () => {
    const row = itemDisplayFromNode(
      itemNode(
        { name: "Cloudy Bay", myReview: { score: 2.5 } },
        { ownerReview: { score: 4 } },
      ),
      false,
    );
    assert.equal(row.ownerScore, 4);
    assert.equal(row.viewerScore, 2.5);
  });

  test("X23: an owner who never rated it shows no score, not yours", () => {
    const row = itemDisplayFromNode(
      itemNode({ myReview: { score: 2.5 } }, { ownerReview: null }),
      false,
    );
    assert.equal(row.ownerScore, null);
    assert.equal(row.viewerScore, 2.5);
  });

  test("X23: a friend's place list never passes your place rating off as theirs", () => {
    const row = itemDisplayFromNode(placeNode(), false);
    assert.equal(row.ownerScore, null);
    assert.equal(row.viewerScore, 4);
  });

  test("each item type's old subtitle field", () => {
    const sub = (item: Partial<NonNullable<TierListItemNode["item"]>>) =>
      itemDisplayFromNode(itemNode(item)).subtitle;
    assert.equal(
      sub({ type: "BEER", beerStyle: "WOOD_AGED_BEER" }),
      "Wood-Aged Beer",
    );
    assert.equal(
      sub({ type: "SPIRIT", spiritKind: "BRANDY_COGNAC" }),
      "Brandy & Cognac",
    );
    assert.equal(sub({ type: "COFFEE", country: "ETHIOPIA" }), "Ethiopia");
    assert.equal(
      sub({
        type: "SAKE",
        sakeCategory: "junmai_ginjo",
        sakeRegion: "Niigata",
      }),
      "Junmai Ginjo · Niigata",
    );
    assert.equal(sub({ type: "TEA", teaCategory: "pu_erh" }), "Pu-erh");
    assert.equal(sub({ type: "BEER" }), "");
  });

  test("enum values go through utilities/formatters.ts, as on the item page (N17)", () => {
    assert.equal(
      itemEntrySubtitle({
        type: "WINE",
        country: "UNITED_STATES",
        wineVariety: "PINOT_GRIGIO_PINOT_GRIS",
        wineVintage: "2019-01-01",
      }),
      "Pinot Grigio · 2019 · United States",
    );
    assert.equal(
      placeEntrySubtitle({
        primaryCategory: "fast_food_restaurant",
        locality: null,
        countryCode: "US",
      }),
      "Fast Food Restaurant · US",
    );
  });

  test("an all-caps item name is shown smart-title-cased (N17)", () => {
    assert.equal(
      itemDisplayFromNode(itemNode({ name: "CASTELLO DI MONTEROSSO" })).name,
      "Castello di Monterosso",
    );
  });

  test("sake and tea link to their own routes", () => {
    assert.equal(
      itemDisplayFromNode(itemNode({ type: "SAKE" })).href,
      "/sakes/item-1",
    );
    assert.equal(
      itemDisplayFromNode(itemNode({ type: "TEA" })).href,
      "/teas/item-1",
    );
  });
});

describe("insights rows", () => {
  test("places carry their geography; items count by band only", () => {
    assert.deepEqual(
      insightsItemsFromNodes([placeNode(), itemNode({ name: "W" })]),
      [
        {
          id: "row-p",
          band: 4,
          name: "Bar Nine",
          countryCode: "US",
          region: "TX",
          primaryCategory: "wine_bar",
        },
        {
          id: "row-i",
          band: 5,
          name: "W",
          countryCode: null,
          region: null,
          primaryCategory: null,
        },
      ],
    );
  });

  test("aiInsights: null until generated, gated on palateProfile, blindSpots optional", () => {
    assert.equal(aiInsightsFromJson(null), null);
    assert.equal(aiInsightsFromJson({ blindSpots: "x" }), null);
    assert.equal(aiInsightsFromJson("nope"), null);
    const ai = aiInsightsFromJson({
      palateProfile: "You like bars.",
      archetype: "The Regular",
      generatedAt: "2026-10-01T00:00:00Z",
      hotTake: 3,
    });
    assert.equal(ai?.palateProfile, "You like bars.");
    assert.equal(ai?.blindSpots, undefined);
    assert.equal(ai?.archetype, "The Regular");
    assert.equal(ai?.hotTake, undefined);
    assert.equal(ai?.generatedAt, "2026-10-01T00:00:00Z");
  });
});

describe("tierListDataFrom", () => {
  const core = {
    id: "tl-1",
    name: "Bars",
    description: null,
    createdById: "me",
    privacy: "FRIENDS",
    listType: "place",
    aiInsights: null,
    contentUpdatedAt: "2026-10-01T00:00:00Z",
  };

  test("owner is creator-only; count is the rows held; place stats for place lists", () => {
    const { data, insightsData } = tierListDataFrom(core, [placeNode()], "me");
    assert.equal(data.isOwner, true);
    assert.equal(data.itemCount, 1);
    assert.equal(insightsData.showPlaceStats, true);
    assert.equal(
      tierListDataFrom(core, [], "someone-else").data.isOwner,
      false,
    );
    assert.equal(tierListDataFrom(core, [], null).data.isOwner, false);
    // D4: Undo / Redo are the owner's alone, whatever the server sent.
    const history = { canUndo: true, canRedo: false, undo: null, redo: null };
    assert.deepEqual(
      tierListDataFrom(core, [], "me", history).data.history,
      history,
    );
    assert.equal(
      tierListDataFrom(core, [], "someone-else", history).data.history,
      null,
    );
    // The owner's view: the rows' scores are the owner's own.
    assert.equal(
      tierListDataFrom(core, [placeNode()], "someone-else").data.items[0]
        ?.ownerScore,
      null,
    );
    assert.equal(
      tierListDataFrom({ ...core, listType: "wine" }, [], "me").insightsData
        .showPlaceStats,
      false,
    );
  });
});

describe("reorderCallFor (the full-band contract)", () => {
  const before = bandMapOf([
    { id: "a", band: 5 },
    { id: "b", band: 5 },
    { id: "c", band: 3 },
  ]);

  test("bandMapOf has all six bands, in row order", () => {
    assert.deepEqual(before, {
      5: ["a", "b"],
      4: [],
      3: ["c"],
      2: [],
      1: [],
      0: [],
    });
  });

  test("a same-band reorder sends that band's whole order", () => {
    const after = { ...before, 5: ["b", "a"] };
    assert.deepEqual(reorderCallFor(before, after, 5, 5), {
      band: 5,
      orderedIds: ["b", "a"],
    });
  });

  test("a cross-band move sends the destination band only, arrival included", () => {
    const after = { ...before, 5: ["b"], 3: ["a", "c"] };
    assert.deepEqual(reorderCallFor(before, after, 5, 3), {
      band: 3,
      orderedIds: ["a", "c"],
    });
  });

  test("a move into an empty band, emptying the source", () => {
    const solo = bandMapOf([{ id: "c", band: 3 }]);
    const after = { ...solo, 3: [], 4: ["c"] };
    assert.deepEqual(reorderCallFor(solo, after, 3, 4), {
      band: 4,
      orderedIds: ["c"],
    });
  });

  test("nothing moved is no call", () => {
    assert.equal(reorderCallFor(before, before, 5, 5), null);
  });
});

describe("tierListOptionsFor (the old GetTierListsForItem)", () => {
  const lists = [
    { id: "l1", name: "Mine, wine", listType: "wine", createdById: "me" },
    { id: "l2", name: "Mine, places", listType: "place", createdById: "me" },
    { id: "l3", name: "A friend's wine", listType: "wine", createdById: "f" },
    { id: "l4", name: "Mine, wine 2", listType: "wine", createdById: "me" },
  ];

  test("own lists of the type, marked with the entity's band", () => {
    assert.deepEqual(
      tierListOptionsFor(lists, [{ tierListId: "l4", band: 3 }], "me", "wine"),
      [
        { id: "l1", name: "Mine, wine", alreadyInBand: null },
        { id: "l4", name: "Mine, wine 2", alreadyInBand: 3 },
      ],
    );
  });

  test("band 0 (Unrated) still counts as already added; signed out is nothing", () => {
    assert.equal(
      tierListOptionsFor(
        lists,
        [{ tierListId: "l2", band: 0 }],
        "me",
        "place",
      )[0]?.alreadyInBand,
      0,
    );
    assert.deepEqual(tierListOptionsFor(lists, [], null, "wine"), []);
  });

  test("entryTypeOf", () => {
    assert.equal(entryTypeOf("place"), "PLACE");
    assert.equal(entryTypeOf("sake"), "SAKE");
  });
});

describe("validateTierListInput (the old server-action validation)", () => {
  test("messages", () => {
    assert.equal(
      validateTierListInput("  ", undefined, "PRIVATE"),
      "Name is required",
    );
    assert.equal(
      validateTierListInput("x".repeat(201), undefined, "PRIVATE"),
      "Name must be 200 characters or less",
    );
    assert.equal(
      validateTierListInput("ok", "d".repeat(2001), "PRIVATE"),
      "Description must be 2000 characters or less",
    );
    assert.equal(
      validateTierListInput("ok", undefined, "SECRET"),
      "Invalid privacy setting",
    );
    assert.equal(validateTierListInput("ok", undefined, "PUBLIC"), null);
  });
});

describe("the in-page add picker (already on the list, refusals in words)", () => {
  test("a candidate's href is the one its board row will have", () => {
    const wine = itemNode({ type: "WINE" });
    const place = placeNode();
    assert.equal(
      candidateHref({ id: wine.item?.id ?? "", entityType: "wine" }),
      entryHref(wine),
    );
    assert.equal(
      candidateHref({ id: place.place?.id ?? "", entityType: "place" }),
      entryHref(place),
    );
    const sake = itemNode({ type: "SAKE" });
    assert.equal(
      candidateHref({ id: sake.item?.id ?? "", entityType: "sake" }),
      entryHref(sake),
    );
  });

  test("what is on the board is known by href", () => {
    const onList = onListHrefs([
      itemDisplayFromNode(itemNode({ type: "WINE" })),
    ]);
    const wineId = itemNode({ type: "WINE" }).item?.id ?? "";
    assert.equal(
      onList.has(candidateHref({ id: wineId, entityType: "wine" })),
      true,
    );
    assert.equal(
      onList.has(candidateHref({ id: "someone-else", entityType: "wine" })),
      false,
    );
  });

  test("an add the actor refuses never shows its log-shaped message", () => {
    const raw =
      "WINE 9326b6bd-0000-0000-0000-000000000000 is already in tier list 02303bbf-0000-0000-0000-000000000000";
    assert.equal(
      addEntryFailureMessage({ code: "CONFLICT", message: raw }),
      "That's already on this list.",
    );
    for (const code of ["FORBIDDEN", "NOT_FOUND", "VALIDATION", "UNKNOWN"]) {
      const said = addEntryFailureMessage({ code, message: raw });
      assert.doesNotMatch(said, /[0-9a-f]{8}-/, code);
    }
    assert.equal(
      addEntryFailureMessage({ code: "TRANSPORT", message: "No answer." }),
      "No answer.",
    );
  });
});

describe("itemTypeOfList (X08: which lists offer Try This Next)", () => {
  test("an item list is its type; a place list or junk is none", () => {
    assert.equal(itemTypeOfList("wine"), "WINE");
    assert.equal(itemTypeOfList("SAKE"), "SAKE");
    assert.equal(itemTypeOfList("place"), null);
    assert.equal(itemTypeOfList("bottle"), null);
  });
});

describe("moves in Arrange (SPEC 16): one band order, one rank", () => {
  const map = () =>
    bandMapOf([
      { id: "a", band: 5 },
      { id: "b", band: 5 },
      { id: "c", band: 4 },
      { id: "d", band: 2 },
    ]);

  test("rankOf counts across the bands, best first", () => {
    const m = map();
    assert.equal(rankOf(m, "a"), 1);
    assert.equal(rankOf(m, "c"), 3);
    assert.equal(rankOf(m, "d"), 4);
    assert.equal(rankOf(m, "nope"), null);
  });

  test("up within a band swaps, and names that band in full", () => {
    const move = moveEntry(map(), "b", { kind: "up" });
    assert.ok(move);
    assert.deepEqual(move.call, { band: 5, orderedIds: ["b", "a"] });
    assert.equal(move.rank, 1);
    assert.equal(move.band, 5);
  });

  test("up from the top of a band goes to the end of the band above", () => {
    const move = moveEntry(map(), "c", { kind: "up" });
    assert.ok(move);
    assert.deepEqual(move.call, { band: 5, orderedIds: ["a", "b", "c"] });
    assert.equal(move.rank, 3);
  });

  test("down from the end of a band goes to the top of the band below, empty or not", () => {
    const move = moveEntry(map(), "c", { kind: "down" });
    assert.ok(move);
    assert.deepEqual(move.call, { band: 3, orderedIds: ["c"] });
    assert.equal(move.band, 3);
    assert.equal(move.rank, 3);
  });

  test("the very top cannot go up, the very bottom of Bad cannot go down", () => {
    assert.equal(moveEntry(map(), "a", { kind: "up" }), null);
    const bottom = bandMapOf([{ id: "z", band: 1 }]);
    assert.equal(moveEntry(bottom, "z", { kind: "down" }), null);
  });

  test("Move to band lands last in that band; its own band is no move", () => {
    const move = moveEntry(map(), "d", { kind: "band", band: 5 });
    assert.ok(move);
    assert.deepEqual(move.call, { band: 5, orderedIds: ["a", "b", "d"] });
    assert.equal(move.rank, 3);
    assert.equal(moveEntry(map(), "d", { kind: "band", band: 2 }), null);
  });

  test("the rank a move reports is the rank in the map it produces", () => {
    const move = moveEntry(map(), "d", { kind: "band", band: 4 });
    assert.ok(move);
    assert.equal(move.rank, rankOf(move.after, "d"));
  });
});
