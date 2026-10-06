/**
 * The `/search` adapters, pinned against `82450ad1`'s page: which branch the
 * URL selects, the stats line's copy, and what a hit becomes on a card.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { richTextFromReviewText } from "@/components/common/rich-text";
import {
  activityEntryFromNode,
  activityFeedFromNodes,
  activityKindsFromParams,
  apiActivityKinds,
  barcodeSearchHref,
  collectionStatsLine,
  imageSearchHref,
  MAX_BARCODE_LENGTH,
  nearbyPlacesFromNodes,
  searchResultFromCard,
  searchResultsFromNodes,
  searchStateFromParams,
} from "./adapter";
import {
  BARCODE_SEARCH_LIMIT,
  ITEM_SEARCH_LIMIT,
  ITEM_SEARCH_MAX_DISTANCE,
  NEARBY_PLACES_LIMIT,
  RECENT_ACTIVITY_CAP,
  RECENT_ACTIVITY_PER_KIND,
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
      imageFileId: null,
      legacyImageLink: false,
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
  test("?image= carries an uploaded photo's file id, not result rows (G32)", () => {
    const id = "0B5F8C2E-9D61-4C7A-8F0E-3A1B2C4D5E6F";
    const state = searchStateFromParams({ image: ` ${id} ` });
    assert.equal(state.imageFileId, id.toLowerCase());
    assert.equal(state.hasActiveSearch, true);
    assert.equal(searchStateFromParams({ image: "../etc" }).imageFileId, null);
  });
  test("an old image-results link, with no photo behind it, asks for a new one", () => {
    const legacy = (params: Record<string, string>) =>
      searchStateFromParams(params as never);
    assert.equal(legacy({ image_results: "%5B%5D" }).legacyImageLink, true);
    assert.equal(legacy({ image_no_results: "true" }).legacyImageLink, true);
    assert.equal(legacy({ image_no_results: "false" }).legacyImageLink, false);
    assert.equal(legacy({ image_results: "%5B%5D" }).imageFileId, null);
  });
  test("the old stub's ?barcode_no_results= is ignored", () => {
    assert.equal(
      searchStateFromParams({ barcode_no_results: "true" } as never)
        .hasActiveSearch,
      false,
    );
  });
});

describe("imageSearchHref", () => {
  test("a file id goes to ?image= and round-trips", () => {
    const id = "0b5f8c2e-9d61-4c7a-8f0e-3a1b2c4d5e6f";
    const href = imageSearchHref(id) ?? "";
    assert.equal(href, `/search?image=${id}`);
    const back = new URL(href, "http://x").searchParams.get("image") ?? "";
    assert.equal(searchStateFromParams({ image: back }).imageFileId, id);
  });
  test("anything that is not a file id goes nowhere", () => {
    assert.equal(imageSearchHref("not-a-file"), null);
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

/* -------------------------------------------------------------------------- */
/* Discovery (UI parity G31)                                                   */
/* -------------------------------------------------------------------------- */

describe("activityKindsFromParams (the old ?activity= parse)", () => {
  test("no param, or an empty one, is no filter", () => {
    assert.deepEqual(activityKindsFromParams({}), []);
    assert.deepEqual(activityKindsFromParams({ activity: "" }), []);
  });
  test("known kinds kept in order, unknown dropped, repeats once", () => {
    assert.deepEqual(
      activityKindsFromParams({ activity: "tier-listed,bogus,added,added" }),
      ["tier-listed", "added"],
    );
  });
  test("maps to the API's enum", () => {
    assert.deepEqual(apiActivityKinds(["added", "reviewed", "tier-listed"]), [
      "ADDED",
      "REVIEWED",
      "TIER_LISTED",
    ]);
  });
});

const friend = {
  __typename: "UserProfile",
  id: "u2",
  displayName: "Fran Friend",
  avatarUrl: null,
};

const image = (url: string, placeholder: string | null = null) => ({
  edges: [
    {
      node: {
        __typename: "ItemImage",
        id: "i1",
        placeholder,
        file: { __typename: "File", id: "f1", url },
      },
    },
  ],
});

const entry = (over: Record<string, unknown>) =>
  ({
    __typename: "ActivityEntry",
    id: "REVIEWED:r1",
    kind: "REVIEWED",
    occurredAt: "2026-10-05T12:00:00.000Z",
    rank: null,
    cellarItemId: null,
    user: friend,
    item: {
      __typename: "Wine",
      id: "w1",
      type: "WINE",
      name: "Barolo",
      images: { edges: [] },
      vintage: "2016-01-01",
    },
    place: null,
    review: { __typename: "ItemReview", id: "r1", score: 4.5, text: null },
    tierListItem: null,
    cellar: null,
    ...over,
  }) as never;

describe("activityEntryFromNode (the old buildActivityFeed's extractors)", () => {
  test("a review: vintage before a wine's name, item href, score, author", () => {
    const result = activityEntryFromNode(
      entry({
        review: {
          __typename: "ItemReview",
          id: "r1",
          score: 4.5,
          text: { body: "lovely" },
        },
      }),
    );
    assert.deepEqual(result, {
      kind: "reviewed",
      id: "review-r1",
      timestamp: "2026-10-05T12:00:00.000Z",
      itemName: "2016 Barolo",
      itemType: "WINE",
      itemImageUrl: undefined,
      itemPlaceholder: null,
      itemHref: "/wines/w1",
      userId: "u2",
      userName: "Fran Friend",
      userAvatar: null,
      score: 4.5,
      // Through the shared `richTextFromReviewText`: the rewrite's
      // `{ body }` shape becomes a Lexical state, which RichTextDisplay needs.
      reviewText: richTextFromReviewText({ body: "lovely" }),
    });
    assert.match(
      String(result?.kind === "reviewed" && result.reviewText),
      /lovely/,
    );
  });

  test("a bottle added: 'Added to <cellar>', the presigned thumbnail", () => {
    const result = activityEntryFromNode(
      entry({
        id: "ADDED:b1",
        kind: "ADDED",
        cellarItemId: "b1",
        review: null,
        cellar: { __typename: "Cellar", id: "c1", name: "Home" },
        item: {
          __typename: "Sake",
          id: "s1",
          type: "SAKE",
          name: "Dassai",
          vintageYear: 2021,
          images: image("https://files.test/s1?sig", "png;base64,AAA"),
        },
      }),
    );
    assert.equal(result?.kind, "added");
    assert.equal(result?.id, "added-b1");
    assert.equal(result?.itemName, "2021 Dassai");
    assert.equal(result?.itemHref, "/sakes/s1");
    assert.equal(result?.itemImageUrl, "https://files.test/s1?sig");
    assert.equal(result?.itemPlaceholder, "png;base64,AAA");
    assert.equal(
      result?.kind === "added" ? result.cellarName : undefined,
      "Home",
    );
  });

  test("a tier-listed place: the list's href, its name and the rank", () => {
    const result = activityEntryFromNode(
      entry({
        id: "TIER_LISTED:t1",
        kind: "TIER_LISTED",
        rank: 2,
        item: null,
        review: null,
        place: {
          __typename: "Place",
          id: "p1",
          name: "corner bar",
          displayName: "Corner Bar",
          photos: { edges: [] },
        },
        tierListItem: {
          __typename: "TierListItem",
          id: "t1",
          tierListId: "l1",
          tierList: { __typename: "TierList", id: "l1", name: "Best bars" },
        },
      }),
    );
    assert.equal(result?.kind, "tier-listed");
    assert.equal(result?.itemName, "Corner Bar");
    assert.equal(result?.itemType, "PLACE");
    assert.equal(result?.itemHref, "/tier-lists/l1?item=t1");
    if (result?.kind === "tier-listed") {
      assert.equal(result.tierListName, "Best bars");
      assert.equal(result.rank, 2);
    }
  });

  test("an edge the server nulled (list no longer visible) drops the row", () => {
    assert.equal(
      activityEntryFromNode(
        entry({
          kind: "TIER_LISTED",
          review: null,
          tierListItem: {
            __typename: "TierListItem",
            id: "t1",
            tierListId: "l1",
            tierList: null,
          },
        }),
      ),
      null,
    );
    assert.equal(activityEntryFromNode(entry({ item: null })), null);
  });
});

describe("activityFeedFromNodes", () => {
  test("newest first, capped at the old eight", () => {
    const nodes = Array.from({ length: 12 }, (_, index) =>
      entry({
        id: `REVIEWED:r${index}`,
        occurredAt: `2026-10-05T12:${String(index).padStart(2, "0")}:00.000Z`,
        review: {
          __typename: "ItemReview",
          id: `r${index}`,
          score: 3,
          text: null,
        },
      }),
    );
    const feed = activityFeedFromNodes(nodes);
    assert.equal(feed.length, RECENT_ACTIVITY_CAP);
    assert.equal(feed[0]?.id, "review-r11");
    assert.equal(feed.at(-1)?.id, "review-r4");
  });
});

describe("nearbyPlacesFromNodes (searchMapPlaces + getPlaceSummaries)", () => {
  const place = (over: Record<string, unknown>) =>
    ({
      __typename: "NearbyPlace",
      distanceMeters: 120,
      place: {
        __typename: "Place",
        id: "p1",
        name: "Corner Bar",
        primaryCategory: "wine_bar",
        rating: 3.9,
        priceLevel: 1,
        location: { __typename: "LngLat", lng: -97.7, lat: 30.2 },
        enrichment: null,
        photos: { edges: [] },
        ...over,
      },
    }) as never;

  test("the place's own rating and price when there is no summary", () => {
    assert.deepEqual(nearbyPlacesFromNodes([place({})]), [
      {
        id: "p1",
        name: "Corner Bar",
        primaryCategory: "wine_bar",
        coordinates: [-97.7, 30.2],
        distanceMeters: 120,
        photoUrl: null,
        rating: 3.9,
        priceLevel: 1,
        openingHours: null,
      },
    ]);
  });

  test("the summary's Google rating, price, hours and photo win, as before", () => {
    const [result] = nearbyPlacesFromNodes([
      place({
        enrichment: {
          __typename: "PlaceEnrichment",
          placeId: "p1",
          googleOpeningHours: { open_now: true },
          googlePriceLevel: 3,
          googleRating: 4.6,
          googleUserRatingsTotal: 10,
        },
        photos: {
          edges: [
            {
              node: {
                __typename: "PlacePhoto",
                id: "ph1",
                file: { __typename: "File", id: "f", url: "https://x/p" },
              },
            },
          ],
        },
      }),
    ]);
    assert.equal(result?.rating, 4.6);
    assert.equal(result?.priceLevel, 3);
    assert.deepEqual(result?.openingHours, { open_now: true });
    assert.equal(result?.photoUrl, "https://x/p");
  });
});

test("discovery limits are the old page's and inside the API's caps", () => {
  assert.equal(RECENT_ACTIVITY_PER_KIND, 6, "limit: 6 per query");
  assert.equal(RECENT_ACTIVITY_CAP, 8, "entries.slice(0, 8)");
  assert.equal(NEARBY_PLACES_LIMIT, 6, "searchMapPlaces({ limit: 6 })");
  assert.ok(RECENT_ACTIVITY_PER_KIND <= 20 && NEARBY_PLACES_LIMIT <= 20);
});
