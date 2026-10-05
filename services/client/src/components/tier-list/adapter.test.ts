/**
 * The tier-list adapters, pinned against what `82450ad1`'s
 * `tier-lists/[tierListId]/page.tsx` resolved and what its board sent.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { validateTierListInput } from "./actions";
import {
  aiInsightsFromJson,
  bandMapOf,
  entryTypeOf,
  insightsItemsFromNodes,
  itemDisplayFromNode,
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
      reviewScore: 4,
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
    assert.equal(row.reviewScore, null);
    assert.equal(row.publicRating, null);
    assert.equal(row.publicRatingCount, null);
  });

  test("a wine: variety · year · country, the viewer's own review score, no public rating", () => {
    const row = itemDisplayFromNode(
      itemNode({
        name: "Chateau X",
        country: "France",
        wineVariety: "Merlot",
        wineVintage: "2015-01-01",
        myReview: { score: 4.5 },
      }),
    );
    assert.equal(row.name, "Chateau X");
    assert.equal(row.subtitle, "Merlot · 2015 · France");
    assert.equal(row.href, "/wines/item-1");
    assert.equal(row.reviewScore, 4.5);
    assert.equal(row.publicRating, null);
  });

  test("each item type's old subtitle field", () => {
    const sub = (item: Partial<NonNullable<TierListItemNode["item"]>>) =>
      itemDisplayFromNode(itemNode(item)).subtitle;
    assert.equal(sub({ type: "BEER", beerStyle: "IPA" }), "IPA");
    assert.equal(sub({ type: "SPIRIT", spiritKind: "Bourbon" }), "Bourbon");
    assert.equal(sub({ type: "COFFEE", country: "Ethiopia" }), "Ethiopia");
    assert.equal(
      sub({ type: "SAKE", sakeCategory: "Junmai", sakeRegion: "Niigata" }),
      "Junmai · Niigata",
    );
    assert.equal(sub({ type: "TEA", teaCategory: "Oolong" }), "Oolong");
    assert.equal(sub({ type: "BEER" }), "");
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
    isEditingLocked: true,
    aiInsights: null,
    contentUpdatedAt: "2026-10-01T00:00:00Z",
  };

  test("owner is creator-only; count is the rows held; place stats for place lists", () => {
    const { data, insightsData } = tierListDataFrom(core, [placeNode()], "me");
    assert.equal(data.isOwner, true);
    assert.equal(data.isEditingLocked, true);
    assert.equal(data.itemCount, 1);
    assert.equal(insightsData.showPlaceStats, true);
    assert.equal(
      tierListDataFrom(core, [], "someone-else").data.isOwner,
      false,
    );
    assert.equal(tierListDataFrom(core, [], null).data.isOwner, false);
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
