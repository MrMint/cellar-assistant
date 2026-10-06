/**
 * The map adapters and `searchMapPlaces`, pinned against what `82450ad1`'s
 * `map/actions.ts`, `place-actions.ts`, `places/queries.ts` and
 * `menuScanning.ts` produced.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { searchMapPlaces, validateCreatePlaceInput } from "./actions";
import {
  attributionLines,
  duplicateFrom,
  enrichmentFrom,
  googlePrefillFields,
  interactionFrom,
  looksLikeAddress,
  mapItemsFromBrowse,
  matchedItemHref,
  menuItemFrom,
  photosFrom,
  placeResultFromNode,
  scanSummaryFrom,
  semanticResultsFrom,
  suggestionFrom,
  tierListEntriesFrom,
  visitStatusFilterFor,
} from "./adapter";
import type { PlaceCluster, PlaceResult } from "./types";

const bounds = { north: 1, south: 0, east: 1, west: 0 };

describe("placeResultFromNode", () => {
  test("snake_case, [lng, lat], and the old scores when params are given", () => {
    const place = placeResultFromNode(
      {
        id: "p1",
        name: "Bar",
        categories: ["wine_bar"],
        primaryCategory: "wine_bar",
        rating: 4.5,
        location: { lng: -89.4, lat: 43.07 },
        streetAddress: "1 Main",
      },
      { bounds, itemTypes: ["wine"] },
    );
    assert.deepEqual(place.location.coordinates, [-89.4, 43.07]);
    assert.equal(place.primary_category, "wine_bar");
    assert.equal(place.street_address, "1 Main");
    assert.equal(place.rating, 4.5);
    assert.equal(typeof place.overallQuality, "number");
    assert.ok((place.itemTypeScores?.wine ?? 0) > 0);
  });

  test("no params, no scores; empty name and categories fall back as before", () => {
    const place = placeResultFromNode({ id: "p", name: "", categories: [] });
    assert.equal(place.name, "Unknown Place");
    assert.deepEqual(place.categories, ["unknown"]);
    assert.equal(place.overallQuality, undefined);
  });
});

describe("mapItemsFromBrowse", () => {
  test("markers and clusters; a cluster or marker with no position is dropped", () => {
    const items = mapItemsFromBrowse(
      [
        {
          __typename: "MapPlace",
          id: "a",
          name: "A",
          categories: ["bar"],
          location: { lng: 1, lat: 2 },
        },
        { __typename: "MapPlace", id: "b", name: "B", categories: [] },
        {
          __typename: "MapCluster",
          clusterId: 7,
          count: 12,
          center: { lng: 3, lat: 4 },
        },
        { __typename: "MapCluster", clusterId: 8, count: 2, center: null },
      ],
      { bounds },
    );
    assert.equal(items.length, 2);
    assert.equal((items[0] as PlaceResult).id, "a");
    const cluster = items[1] as PlaceCluster;
    assert.equal(cluster.is_cluster, true);
    assert.equal(cluster.cluster_count, 12);
    assert.deepEqual(cluster.cluster_center.coordinates, [3, 4]);
  });
});

describe("semanticResultsFrom", () => {
  const hit = (id: string, combinedScore: number, categories = ["bar"]) => ({
    id,
    name: id,
    categories,
    location: { lng: 0, lat: 0 },
    combinedScore,
  });

  test("the old adaptive cut-off and normalisation", () => {
    const results = semanticResultsFrom(
      [hit("top", 0.8), hit("mid", 0.4), hit("weak", 0.1)],
      { bounds, semanticQuery: "bar" },
    );
    // threshold = max(80 × 0.33, 5) = 26.4 → "weak" (10) goes.
    assert.deepEqual(
      results.map((r) => r.id),
      ["top", "mid"],
    );
    assert.equal(results[0]?.overallRelevance, 100);
    assert.equal(results[1]?.overallRelevance, 50);
    assert.equal(results[0]?.matchReason, "semantic_match");
  });

  test("item types narrow by item-type score", () => {
    const results = semanticResultsFrom(
      [hit("cafe", 0.9, ["coffee_shop"]), hit("brew", 0.9, ["brewery"])],
      { bounds, itemTypes: ["coffee"], semanticQuery: "x" },
    );
    assert.deepEqual(
      results.map((r) => r.id),
      ["cafe"],
    );
  });
});

describe("visitStatusFilterFor", () => {
  test("one status maps; favourites and pairs filter nothing (G34)", () => {
    assert.equal(visitStatusFilterFor(["visited"]), "VISITED");
    assert.equal(visitStatusFilterFor(["unvisited"]), "UNVISITED");
    assert.equal(visitStatusFilterFor(["favorites"]), null);
    assert.equal(visitStatusFilterFor(["visited", "unvisited"]), null);
    assert.equal(visitStatusFilterFor([]), null);
  });
});

describe("looksLikeAddress", () => {
  test("the old heuristic", () => {
    assert.equal(looksLikeAddress("123 Main St"), true);
    assert.equal(looksLikeAddress("near 53703"), true);
    assert.equal(looksLikeAddress("Elm St 42, Berlin"), true);
    assert.equal(looksLikeAddress("natural wine bar"), false);
  });
});

describe("one place", () => {
  test("enrichmentFrom is the old transformDbEnrichment", () => {
    assert.equal(enrichmentFrom(null), null);
    const e = enrichmentFrom({
      googlePlaceId: "g1",
      googleName: "Bar",
      googleRating: 4.2,
      googleTypes: ["bar"],
      googleBusinessStatus: "OPERATIONAL",
      attributions: ["<a>Yelp</a>"],
    });
    assert.equal(e?.name, "Bar");
    assert.equal(e?.rating, 4.2);
    assert.deepEqual(e?.types, ["bar"]);
    assert.deepEqual(e?.attributions, ["<a>Yelp</a>"]);
  });

  test("photos ordered by display order, presigned url or null", () => {
    const photos = photosFrom([
      { id: "b", displayOrder: 2, file: { url: "https://x/b" } },
      {
        id: "a",
        displayOrder: 1,
        file: null,
        attributions: [{ displayName: "Ann" }],
      },
    ]);
    assert.deepEqual(
      photos.map((p) => [p.id, p.url]),
      [
        ["a", null],
        ["b", "https://x/b"],
      ],
    );
  });

  test("attributionLines: strings (tags stripped) and named objects, deduplicated", () => {
    assert.deepEqual(
      attributionLines([
        '<a href="https://yelp.com">Yelp</a>',
        { displayName: "Ann" },
        { provider: "Yelp" },
        42,
        null,
      ]),
      ["Yelp", "Ann"],
    );
    assert.deepEqual(attributionLines("nope"), []);
  });

  test("interactionFrom is the old user_place_interactions row", () => {
    assert.equal(interactionFrom(null), undefined);
    const row = interactionFrom({
      id: "i",
      isFavorite: true,
      isVisited: false,
      visitCount: 3,
      lastVisitedAt: "2026-01-01T00:00:00Z",
    });
    assert.equal(row?.is_favorite, true);
    assert.equal(row?.visit_count, 3);
    assert.equal(row?.last_visited_at, "2026-01-01T00:00:00Z");
  });

  test("menuItemFrom collapses the per-type relations into matched_item (G18)", () => {
    const line = menuItemFrom({
      id: "l1",
      name: "Junmai",
      price: 12,
      detectedItemType: "sake",
      extractedAttributes: { search_name: "junmai", region: "Niigata" },
      matchedItem: {
        id: "s1",
        type: "sake",
        item: { id: "s1", name: "Kubota" },
      },
    });
    assert.equal(line.menu_item_name, "Junmai");
    assert.deepEqual(line.matched_item, {
      id: "s1",
      name: "Kubota",
      type: "sake",
    });
    // The pipeline's own matching key is not a menu attribute.
    assert.deepEqual(line.extracted_attributes, { region: "Niigata" });
    assert.equal(menuItemFrom({ id: "l2", name: "x" }).matched_item, null);
  });

  test("matchedItemHref only for item types with a page", () => {
    assert.equal(matchedItemHref({ id: "w", type: "wine" }), "/wines/w");
    assert.equal(matchedItemHref({ id: "c", type: "cocktail" }), null);
  });

  test("tierListEntriesFrom keeps a list that went invisible as null", () => {
    assert.deepEqual(
      tierListEntriesFrom([
        { id: "e1", band: 5, tierList: { id: "t", name: "Best" } },
        { id: "e2", band: 1, tierList: null },
      ]),
      [
        { id: "e1", band: 5, tier_list: { id: "t", name: "Best" } },
        { id: "e2", band: 1, tier_list: null },
      ],
    );
  });
});

describe("create place", () => {
  test("duplicateFrom is the old DuplicatePlace", () => {
    assert.deepEqual(
      duplicateFrom({
        placeId: "p",
        name: "Bar",
        distanceMeters: 12,
        similarity: 0.8,
        place: {
          primaryCategory: "bar",
          streetAddress: "1 Main",
          locality: "M",
        },
      }),
      {
        id: "p",
        name: "Bar",
        primary_category: "bar",
        street_address: "1 Main",
        locality: "M",
        similarity: 0.8,
        distance_m: 12,
      },
    );
  });

  test("the old input validation messages", () => {
    const base = {
      name: "Bar",
      categories: ["bar"],
      latitude: 0,
      longitude: 0,
    };
    assert.equal(validateCreatePlaceInput(base), null);
    assert.match(
      validateCreatePlaceInput({ ...base, name: "x" }) ?? "",
      /between 2 and 200/,
    );
    assert.match(
      validateCreatePlaceInput({ ...base, categories: [] }) ?? "",
      /At least one category/,
    );
    assert.match(
      validateCreatePlaceInput({ ...base, country_code: "USA" }) ?? "",
      /2-letter/,
    );
    assert.match(
      validateCreatePlaceInput({ ...base, website: "not a url" }) ?? "",
      /valid website/,
    );
  });
});

describe("scans and suggestions", () => {
  test("scanSummaryFrom", () => {
    const row = scanSummaryFrom({
      id: "s",
      processingStatus: "failed",
      processingError: "Could not read the photo.",
      itemsDetected: 0,
      place: { id: "p", name: "Bar" },
    });
    assert.equal(row.processing_status, "failed");
    assert.equal(row.processing_error, "Could not read the photo.");
    assert.deepEqual(row.place, { id: "p", name: "Bar" });
  });

  test("suggestionFrom: pending, and where the suggestion links", () => {
    const view = suggestionFrom({
      id: "m",
      menuScanId: "s",
      placeMenuItemId: "l",
      menuItemName: "Pinot",
      confidenceScore: 0.7,
      suggestedItem: { id: "w", type: "WINE", name: "Pinot Noir" },
    });
    assert.equal(view.pending, true);
    assert.deepEqual(view.suggested, {
      id: "w",
      name: "Pinot Noir",
      href: "/wines/w",
    });
    const recipe = suggestionFrom({
      id: "m2",
      placeMenuItemId: "l",
      menuItemName: "Negroni",
      confidenceScore: 0.9,
      accepted: true,
      suggestedRecipe: { id: "r", name: "Negroni" },
    });
    assert.equal(recipe.pending, false);
    assert.equal(recipe.suggested?.href, "/recipes/r");
  });
});

// ---------------------------------------------------------------------------
// searchMapPlaces against a scripted client
// ---------------------------------------------------------------------------

type Call = { op: string; variables: Record<string, unknown> };

const opName = (document: unknown): string => {
  const definitions = (
    document as { definitions?: { name?: { value?: string } }[] }
  ).definitions;
  return definitions?.[0]?.name?.value ?? "?";
};

const scriptedClient = (
  answer: (op: string, variables: Record<string, unknown>) => unknown,
) => {
  const calls: Call[] = [];
  const client = {
    query: (document: unknown, variables: Record<string, unknown>) => {
      const op = opName(document);
      calls.push({ op, variables });
      return { toPromise: async () => ({ data: answer(op, variables) }) };
    },
  } as unknown as Client;
  return { client, calls };
};

const browsePage = (from: number, count: number, hasNextPage: boolean) => ({
  mapBrowse: {
    __typename: "MapEntryConnection",
    totalCount: 450,
    pageInfo: {
      hasNextPage,
      endCursor: hasNextPage ? `c${from + count}` : null,
    },
    edges: Array.from({ length: count }, (_, i) => ({
      cursor: `c${from + i}`,
      node: {
        __typename: "MapPlace",
        id: `p${from + i}`,
        name: `P${from + i}`,
        categories: ["bar"],
        location: { lng: 0, lat: 0 },
      },
    })),
  },
});

describe("searchMapPlaces", () => {
  test("browse walks every page up to the 500-feature limit (not just 100)", async () => {
    const { client, calls } = scriptedClient((_op, variables) => {
      const after = variables.after as string | null;
      const from = after === null ? 0 : Number(after.slice(1));
      return browsePage(from, Math.min(100, 450 - from), from + 100 < 450);
    });
    const result = await searchMapPlaces(client, {
      bounds,
      visitStatuses: ["visited"],
      tierListIds: ["t1"],
    });
    assert.equal(result.mapItems.length, 450);
    assert.equal(calls.length, 5);
    assert.ok(calls.every((c) => c.op === "MapBrowse"));
    assert.equal(calls[0]?.variables.first, 100);
    assert.equal(calls[0]?.variables.limit, 500);
    assert.equal(calls[0]?.variables.visitStatus, "VISITED");
    assert.deepEqual(calls[0]?.variables.tierListIds, ["t1"]);
    assert.equal(calls[1]?.variables.after, "c100");
    assert.equal(result.isSemanticSearch, false);
  });

  test("an address-shaped query is geocoded and nothing else is asked", async () => {
    const { client, calls } = scriptedClient(() => ({
      geocode: { latitude: 43, longitude: -89, displayName: "1 Main St" },
    }));
    const result = await searchMapPlaces(client, {
      bounds,
      semanticQuery: "123 Main St",
    });
    assert.deepEqual(
      calls.map((c) => c.op),
      ["MapGeocode"],
    );
    assert.deepEqual(result.geocodeResult, {
      latitude: 43,
      longitude: -89,
      displayName: "1 Main St",
    });
  });

  test("a meaning search is global by default and bounded when asked", async () => {
    const { client, calls } = scriptedClient(() => ({
      placeSearch: {
        __typename: "PlaceSearchConnection",
        totalCount: 0,
        edges: [],
      },
    }));
    await searchMapPlaces(client, { bounds, semanticQuery: "natural wine" });
    await searchMapPlaces(client, {
      bounds,
      semanticQuery: "natural wine",
      globalSearch: false,
    });
    assert.equal(calls[0]?.op, "MapPlaceSearch");
    assert.equal(calls[0]?.variables.bounds, null);
    assert.equal(calls[0]?.variables.first, 50);
    assert.deepEqual(calls[1]?.variables.bounds, bounds);
  });

  test("a typed error is thrown with the actor's own words", async () => {
    const { client } = scriptedClient(() => ({
      placeSearch: {
        __typename: "ConflictError",
        code: "CONFLICT",
        reason: null,
        message: "No embedding provider is configured.",
      },
    }));
    await assert.rejects(
      searchMapPlaces(client, { bounds, semanticQuery: "wine" }),
      /No embedding provider/,
    );
  });
});

describe("googlePrefillFields (G21 — the old prefillFromGoogle)", () => {
  const valid = (phone: string) => phone.startsWith("+");

  test("fills name, phone, website and the summary as the description", () => {
    assert.deepEqual(
      googlePrefillFields(
        {
          name: "Stagger Lee",
          phone: "+16145550100",
          website: "https://stagger.test",
          editorialSummary: "A dim, friendly bar.",
        },
        valid,
      ),
      {
        name: "Stagger Lee",
        phone: "+16145550100",
        website: "https://stagger.test",
        description: "A dim, friendly bar.",
      },
    );
  });

  test("leaves absent fields — and a phone the form would reject — alone", () => {
    assert.deepEqual(
      googlePrefillFields(
        {
          name: null,
          phone: "(614) 555-0100",
          website: null,
          editorialSummary: "",
        },
        valid,
      ),
      {},
    );
  });
});
