/**
 * Map, place and menu-scan edges (UI parity wave C), executed against a stub
 * sidecar — the same three properties `reverse-edges.test.ts` checks:
 *
 * - **Cost.** A page of rows is one batched actor call, not one per row.
 * - **Visibility.** What the owning actor withholds stays withheld, and an
 *   anonymous viewer costs no call at all.
 * - **Shape.** What comes back lands on the right row.
 */
import type { PageArgs, PlaceMenuItemDto } from "@cellar-assistant/contracts";
import {
  NotFoundError,
  offsetPage,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const stamp = "2026-10-04T00:00:00.000Z";
const P1 = "a0000001-0000-4000-8000-000000000001";
const P2 = "a0000002-0000-4000-8000-000000000002";
const P3 = "a0000003-0000-4000-8000-000000000003";
const LIST = "b0000001-0000-4000-8000-000000000001";
const SCAN = "c0000001-0000-4000-8000-000000000001";
const FILE = "c0000002-0000-4000-8000-000000000002";
const WINE = "d0000001-0000-4000-8000-000000000001";
const BEER = "d0000002-0000-4000-8000-000000000002";
const L1 = "e0000001-0000-4000-8000-000000000001";
const L2 = "e0000002-0000-4000-8000-000000000002";
const L3 = "e0000003-0000-4000-8000-000000000003";

const page = <T>(rows: readonly T[], args: unknown) =>
  offsetPage(rows, args as PageArgs);

const callsTo = (
  calls: ReturnType<typeof stubSidecar>["calls"],
  method: string,
) => calls.filter((call) => call.method === method);

const placeDto = (id: string) => ({
  id,
  name: `Place ${id.slice(0, 2)}`,
  displayName: null,
  categories: ["bar"],
  primaryCategory: "bar",
  location: { lng: -122.4, lat: 37.7 },
  streetAddress: null,
  locality: null,
  region: null,
  postcode: null,
  countryCode: null,
  phone: null,
  website: null,
  email: null,
  hours: null,
  priceLevel: null,
  rating: 4,
  reviewCount: null,
  confidence: null,
  description: null,
  source: "user",
  overtureId: null,
  googlePlaceId: null,
  isVerified: false,
  isActive: true,
  accessCount: 0,
  lastAccessedAt: null,
  createdById: viewer.id,
  createdAt: stamp,
  updatedAt: stamp,
  lastSyncAt: null,
});

const interaction = (placeId: string, rating: number | null) => ({
  id: `i-${placeId.slice(0, 4)}`,
  placeId,
  isFavorite: false,
  isVisited: rating !== null,
  wantToVisit: false,
  rating,
  notes: null,
  tags: [],
  lastVisitedAt: null,
  visitCount: rating === null ? 0 : 1,
  createdAt: stamp,
  updatedAt: stamp,
});

const line = (
  id: string,
  name: string,
  matchedItem: PlaceMenuItemDto["matchedItem"] = null,
): PlaceMenuItemDto => ({
  id,
  placeId: P1,
  placeMenuId: null,
  menuScanId: SCAN,
  name,
  description: null,
  price: 12,
  menuCategory: "Wine",
  detectedItemType: "wine",
  confidenceScore: 0.9,
  extractedAttributes: null,
  matchedItem,
  matchVerifiedById: null,
  matchVerifiedAt: null,
  isAvailable: true,
  seasonal: false,
  createdAt: stamp,
  updatedAt: stamp,
});

const placeEntry = (placeId: string) => ({
  id: `t-${placeId.slice(0, 4)}`,
  tierListId: LIST,
  band: 3,
  position: 0,
  notes: null,
  entry: { type: "PLACE" as const, id: placeId },
  createdAt: stamp,
  updatedAt: stamp,
});

const tierList = {
  id: LIST,
  name: "Bars",
  description: null,
  createdById: viewer.id,
  privacy: "PUBLIC" as const,
  listType: "place",
  isEditingLocked: false,
  itemCount: 4,
  aiInsights: null,
  insightsGeneratedAt: null,
  contentUpdatedAt: stamp,
  createdAt: stamp,
  updatedAt: stamp,
};

const scanDto = {
  id: SCAN,
  userId: viewer.id,
  placeId: P1,
  estimatedPlaceId: null,
  manualPlaceOverride: null,
  effectivePlaceId: P1,
  originalImageId: FILE,
  processedImageId: null,
  extractedText: null,
  processingStatus: "completed" as const,
  processingError: null,
  confidenceScore: null,
  processingModel: null,
  processingDurationMs: null,
  itemsDetected: 3,
  itemsMatched: 1,
  scannedAt: stamp,
  processedAt: stamp,
  createdAt: stamp,
  updatedAt: stamp,
};

const suggestion = (id: string, placeMenuItemId: string, placeId: string) => ({
  id,
  menuScanId: SCAN,
  placeMenuItemId,
  placeId,
  menuItemName: `Line ${placeMenuItemId.slice(0, 2)}`,
  target: { kind: "ITEM" as const, item: { type: "WINE" as const, id: WINE } },
  confidenceScore: 0.8,
  matchReasoning: null,
  similarityMetrics: null,
  accepted: null,
  rejected: null,
  actedBy: null,
  actedAt: null,
  createdAt: stamp,
});

const wine = (id: string) => ({
  id,
  type: "WINE" as const,
  name: `Wine ${id.slice(0, 2)}`,
  description: null,
  createdAt: stamp,
  updatedAt: stamp,
  createdById: viewer.id,
  barcodeCode: null,
  country: null,
  vintage: null,
  variety: null,
  region: null,
  style: "RED",
  specialDesignation: null,
  vineyardDesignation: null,
  alcoholContentPercentage: null,
});

/* -------------------------------------------------------------------------- */
/* G16                                                                         */
/* -------------------------------------------------------------------------- */

describe("Place.myInteraction (G16)", () => {
  // Four rows on the board, three distinct places; the viewer rated P1 and
  // saved P3, and never touched P2.
  const sidecar = () =>
    stubSidecar({
      "TierListActor.get": () => tierList,
      "TierListActor.items": (_id, _ctx, args) =>
        page([P1, P2, P3, P1].map(placeEntry), args),
      "UserActor.placeInteractionsFor": (_id, _ctx, ids) =>
        (ids as string[]).flatMap((id) =>
          id === P1
            ? [interaction(P1, 5)]
            : id === P3
              ? [interaction(P3, null)]
              : [],
        ),
    });

  const DOC = `{ tierList(id: "${LIST}") { ... on TierList {
    items(first: 10) { edges { node { place {
      id myInteraction { rating isVisited }
    } } } }
  } } }`;

  it("costs one placeInteractionsFor for the whole board, each place named once", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    const batched = callsTo(calls, "placeInteractionsFor");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.actorType).toBe("UserActor");
    expect(batched[0]?.actorId).toBe(viewer.id);
    expect(batched[0]?.args[1]).toEqual([P1, P2, P3]);

    const places = (
      result.data as {
        tierList: {
          items: {
            edges: {
              node: { place: { myInteraction: { rating: number } | null } };
            }[];
          };
        };
      }
    ).tierList.items.edges.map((edge) => edge.node.place.myInteraction);
    expect(places).toEqual([
      { rating: 5, isVisited: true },
      null,
      { rating: null, isVisited: false },
      { rating: 5, isVisited: true },
    ]);
  });

  it("an anonymous viewer gets null with no call", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(DOC, testContext(invoke, null));
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "placeInteractionsFor")).toEqual([]);
    expect(JSON.stringify(result.data)).not.toContain('"rating"');
  });

  it("a refused batch nulls the field on each row, not the board", async () => {
    const { invoke } = stubSidecar({
      "TierListActor.get": () => tierList,
      "TierListActor.items": (_id, _ctx, args) =>
        page([P1].map(placeEntry), args),
      "UserActor.placeInteractionsFor": () => {
        throw new Error("sidecar unavailable");
      },
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors?.[0]?.path).toContain("myInteraction");
    expect(JSON.stringify(result.data)).toContain(`"id":"${P1}"`);
  });
});

describe("PlaceInteraction.place (G16, saved places)", () => {
  it("hydrates each distinct place once, and costs nothing for `id` alone", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.placeInteractions": (_id, _ctx, args) =>
        page([interaction(P1, 4), interaction(P2, null)], args),
      "PlaceActor.get": (id) => placeDto(id),
    });
    const idsOnly = await run(
      `{ myPlaceInteractions(first: 5) { ... on PlaceInteractionConnection {
           edges { node { place { id } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(idsOnly.errors).toBeUndefined();
    expect(callsTo(calls, "get")).toEqual([]);

    const named = await run(
      `{ myPlaceInteractions(first: 5) { ... on PlaceInteractionConnection {
           edges { node { rating place { id name locality } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(named.errors).toBeUndefined();
    expect(
      callsTo(calls, "get")
        .map((call) => call.actorId)
        .sort(),
    ).toEqual([P1, P2]);
    expect(JSON.stringify(named.data)).toContain(`"name":"Place a0"`);
  });
});

/* -------------------------------------------------------------------------- */
/* G18                                                                         */
/* -------------------------------------------------------------------------- */

describe("MenuItemMatch.item (G18)", () => {
  const LINES = [
    line(L1, "House red", { type: "wine", id: WINE }),
    line(L2, "House red, large", { type: "wine", id: WINE }),
    line(L3, "Lager", { type: "beer", id: BEER }),
  ];
  const DOC = `{ place(id: "${P1}") { ... on Place {
    menuItems(first: 10) { edges { node {
      name matchedItem { type id item { __typename id name } }
    } } }
  } } }`;

  it("hands each match to the Item loader — one ItemActor.get per distinct item", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.get": () => placeDto(P1),
      "PlaceActor.menuItems": (_id, _ctx, args) => page(LINES, args),
      "ItemActor.get": (id) => {
        const [type, itemId] = String(id).split(":");
        return type === "wine"
          ? wine(itemId ?? "")
          : { ...wine(itemId ?? ""), type: "BEER", name: "Lager beer" };
      },
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(
      callsTo(calls, "get")
        .filter((call) => call.actorType === "ItemActor")
        .map((call) => call.actorId)
        .sort(),
    ).toEqual([`beer:${BEER}`, `wine:${WINE}`]);
    const items = (
      result.data as {
        place: {
          menuItems: {
            edges: { node: { matchedItem: { item: { id: string } } } }[];
          };
        };
      }
    ).place.menuItems.edges.map((edge) => edge.node.matchedItem.item.id);
    expect(items).toEqual([WINE, WINE, BEER]);
  });

  it("an anonymous viewer gets null with no item read", async () => {
    const { invoke, calls } = stubSidecar({
      "PlaceActor.get": () => placeDto(P1),
      "PlaceActor.menuItems": (_id, _ctx, args) => page(LINES, args),
    });
    const result = await run(DOC, testContext(invoke, null));
    expect(result.errors).toBeUndefined();
    expect(calls.filter((call) => call.actorType === "ItemActor")).toEqual([]);
    expect(JSON.stringify(result.data)).toContain('"item":null');
  });

  it("an item that has gone nulls that line's item, not the menu", async () => {
    const { invoke } = stubSidecar({
      "PlaceActor.get": () => placeDto(P1),
      "PlaceActor.menuItems": (_id, _ctx, args) => page([LINES[0]], args),
      "ItemActor.get": () => {
        throw new NotFoundError("ItemActor(wine:x) has no row");
      },
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors?.[0]?.path).toContain("item");
    expect(JSON.stringify(result.data)).toContain('"name":"House red"');
  });
});

/* -------------------------------------------------------------------------- */
/* G19                                                                         */
/* -------------------------------------------------------------------------- */

describe("MenuScan.menuItems (G19)", () => {
  it("pages every line through MenuScanActor.menuItems, one call per scan", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.get": () => scanDto,
      "MenuScanActor.menuItems": (_id, _ctx, args) =>
        page([line(L1, "A"), line(L2, "B"), line(L3, "C")], args),
    });
    const result = await run(
      `{ menuScan(id: "${SCAN}") { ... on MenuScan {
           menuItems(first: 2) {
             totalCount pageInfo { hasNextPage }
             edges { node { name menuCategory matchedItem { id } } }
           }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const listed = callsTo(calls, "menuItems");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.actorId).toBe(SCAN);
    expect(listed[0]?.args[1]).toEqual({ first: 2, after: null });
    expect(result.data?.menuScan).toEqual({
      menuItems: {
        totalCount: 3,
        pageInfo: { hasNextPage: true },
        edges: [
          { node: { name: "A", menuCategory: "Wine", matchedItem: null } },
          { node: { name: "B", menuCategory: "Wine", matchedItem: null } },
        ],
      },
    });
  });

  it("a scan that is not yours lists nothing — menuItems is never reached", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.get": () => {
        throw new NotFoundError(`MenuScanActor(${SCAN}) has no row`);
      },
      "MenuScanActor.menuItems": () => {
        throw new Error("must not be called");
      },
    });
    const result = await run(
      `{ menuScan(id: "${SCAN}") { __typename ... on MenuScan {
           menuItems(first: 2) { totalCount }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.menuScan).toEqual({ __typename: "NotFoundError" });
    expect(callsTo(calls, "menuItems")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* G20                                                                         */
/* -------------------------------------------------------------------------- */

describe("MatchSuggestion.place / placeMenuItem (G20)", () => {
  const SUGGESTIONS = [
    suggestion("s1", L1, P1),
    suggestion("s2", L2, P1),
    suggestion("s3", L3, P2),
  ];
  const DOC = `{ myDiscoveries(first: 10) { ... on MatchSuggestionConnection {
    edges { node {
      id
      place { id name }
      placeMenuItem { id price menuCategory }
    } }
  } } }`;

  it("costs one menuItemsOf per page and one PlaceActor.get per distinct place", async () => {
    const { invoke, calls } = stubSidecar({
      "MatchSuggestionsCollectionActor.list": (_id, _ctx, args) =>
        page(SUGGESTIONS, args),
      // L3 is withheld: not on one of the viewer's scans.
      "MatchSuggestionsCollectionActor.menuItemsOf": (_id, _ctx, ids) =>
        (ids as string[]).map((id) =>
          id === L3 ? null : line(id, `Line ${id}`),
        ),
      "PlaceActor.get": (id) => placeDto(id),
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    const batched = callsTo(calls, "menuItemsOf");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.actorId).toBe(viewerCollectionActorId(viewer.id));
    expect(batched[0]?.args[1]).toEqual([L1, L2, L3]);
    expect(
      callsTo(calls, "get")
        .map((call) => call.actorId)
        .sort(),
    ).toEqual([P1, P2]);

    const nodes = (
      result.data as {
        myDiscoveries: {
          edges: {
            node: {
              place: { id: string };
              placeMenuItem: { id: string } | null;
            };
          }[];
        };
      }
    ).myDiscoveries.edges.map((edge) => edge.node);
    expect(nodes.map((node) => node.place.id)).toEqual([P1, P1, P2]);
    expect(nodes.map((node) => node.placeMenuItem?.id ?? null)).toEqual([
      L1,
      L2,
      null,
    ]);
  });

  it("an anonymous viewer gets a null line with no call", async () => {
    // `menuScan` is the owner's alone in production; the stub lets an
    // anonymous request through so the loader's own gate is what is tested.
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.get": () => scanDto,
      "MenuScanActor.suggestions": (_id, _ctx, args) => page(SUGGESTIONS, args),
    });
    const result = await run(
      `{ menuScan(id: "${SCAN}") { ... on MenuScan {
           suggestions(first: 5) { edges { node { placeMenuItem { id } } } }
         } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "menuItemsOf")).toEqual([]);
    expect(JSON.stringify(result.data)).not.toContain(L1);
  });
});
