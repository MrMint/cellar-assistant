/**
 * `/search`'s discovery fields (UI parity G31), executed against a stub
 * sidecar.
 *
 * What is worth pinning here is what the resolver does **not** do: it takes no
 * user id from the document (the old feed's `$userIds`), addresses only the
 * viewer's own actors, and hydrates every edge through a loader whose actor
 * applies its own rule — so a list or cellar refused at that layer nulls one
 * field, not the page. The cost is counted too: one actor call per distinct
 * person, item, list and cellar.
 */
import type { ActivityEntryDto, MapEntry } from "@cellar-assistant/contracts";
import {
  NotFoundError,
  offsetPage,
  type PageArgs,
} from "@cellar-assistant/contracts";
import { execute, GraphQLObjectType, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { distanceMeters, NEARBY_RADIUS_DEG } from "./discovery.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const FRIEND = "f2222222-2222-4222-8222-222222222222";
const WINE_ID = "33333333-3333-4333-8333-333333333333";
const LIST_ID = "44444444-4444-4444-8444-444444444444";
const CELLAR_ID = "c5555555-5555-4555-8555-555555555555";
const PLACE_ID = "d6666666-6666-4666-8666-666666666666";
const stamp = (minute: number) =>
  `2026-10-05T12:${String(minute).padStart(2, "0")}:00.000Z`;

const wine = {
  id: WINE_ID,
  type: "WINE" as const,
  name: "Test Wine",
  description: null,
  createdAt: stamp(0),
  updatedAt: stamp(0),
  createdById: viewer.id,
  barcodeCode: null,
  country: null,
  vintage: null,
  variety: null,
  region: null,
  style: "RED",
  alcoholContentPercentage: null,
};

const base = {
  placeId: null,
  review: null,
  tierListItem: null,
  rank: null,
  cellarId: null,
  cellarItemId: null,
};

/** One of each kind, plus a second review by the same friend of the same wine. */
const ENTRIES: ActivityEntryDto[] = [
  {
    ...base,
    kind: "TIER_LISTED",
    id: "t1",
    occurredAt: stamp(40),
    userId: FRIEND,
    item: null,
    placeId: PLACE_ID,
    tierListItem: {
      id: "t1",
      tierListId: LIST_ID,
      band: 5,
      position: 0,
      notes: null,
      entry: { type: "PLACE", id: PLACE_ID },
      createdAt: stamp(40),
      updatedAt: null,
    },
    rank: 1,
  },
  {
    ...base,
    kind: "REVIEWED",
    id: "r1",
    occurredAt: stamp(30),
    userId: FRIEND,
    item: { type: "WINE", id: WINE_ID },
    review: {
      id: "r1",
      itemId: WINE_ID,
      itemType: "WINE",
      userId: FRIEND,
      score: 4.5,
      text: null,
      createdAt: stamp(30),
      updatedAt: stamp(30),
    },
  },
  {
    ...base,
    kind: "REVIEWED",
    id: "r2",
    occurredAt: stamp(20),
    userId: FRIEND,
    item: { type: "WINE", id: WINE_ID },
    review: {
      id: "r2",
      itemId: WINE_ID,
      itemType: "WINE",
      userId: FRIEND,
      score: 3,
      text: null,
      createdAt: stamp(20),
      updatedAt: stamp(20),
    },
  },
  {
    ...base,
    kind: "ADDED",
    id: "b1",
    occurredAt: stamp(10),
    userId: viewer.id,
    item: { type: "WINE", id: WINE_ID },
    cellarId: CELLAR_ID,
    cellarItemId: "b1",
  },
];

const profile = (id: string) => ({
  id,
  displayName: `user ${id.slice(0, 1)}`,
  avatarUrl: null,
  locale: null,
  email: null,
});

const tierList = {
  id: LIST_ID,
  name: "Friend's bars",
  description: null,
  createdById: FRIEND,
  privacy: "FRIENDS" as const,
  listType: "place",
  isEditingLocked: false,
  itemCount: 1,
  aiInsights: null,
  insightsGeneratedAt: null,
  contentUpdatedAt: stamp(40),
  createdAt: stamp(0),
  updatedAt: stamp(0),
};

const cellar = {
  id: CELLAR_ID,
  name: "Home",
  privacy: "PRIVATE" as const,
  createdById: viewer.id,
  coOwnerIds: [],
  itemCount: 1,
  itemCounts: {
    total: 1,
    byType: { WINE: 1, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
  },
  createdAt: stamp(0),
  updatedAt: stamp(0),
};

const activitySidecar = (
  overrides: Record<string, (id: string, ...args: unknown[]) => unknown> = {},
) =>
  stubSidecar({
    "FriendsCollectionActor.recentActivity": () => ENTRIES,
    "UserActor.getProfile": (id) => profile(id),
    "ItemActor.get": () => wine,
    "TierListActor.get": () => tierList,
    "CellarActor.get": () => cellar,
    "PlaceActor.get": (id) => ({ id, name: "Corner Bar" }),
    ...overrides,
  });

const FEED = `{ me { recentActivity(first: 8) {
  totalCount
  edges { node {
    id kind occurredAt rank cellarItemId
    user { id displayName }
    item { id name }
    place { id name }
    review { id score }
    tierListItem { id tierList { id name } }
    cellar { id name }
  } }
} } }`;

type FeedNode = {
  id: string;
  kind: string;
  rank: number | null;
  user: { id: string } | null;
  item: { name: string } | null;
  place: { name: string } | null;
  review: { score: number } | null;
  tierListItem: { tierList: { name: string } | null } | null;
  cellar: { name: string } | null;
};

const nodesOf = (data: unknown): FeedNode[] =>
  (
    data as {
      me: { recentActivity: { edges: { node: FeedNode }[] } };
    }
  ).me.recentActivity.edges.map((edge) => edge.node);

describe("Viewer.recentActivity (UI parity G31)", () => {
  it("asks the viewer's own actor, with no user id, and defaults to all kinds × 6", async () => {
    const { invoke, calls } = activitySidecar();
    const result = await run(FEED, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    const feedCalls = calls.filter((c) => c.method === "recentActivity");
    expect(feedCalls).toEqual([
      {
        actorType: "FriendsCollectionActor",
        actorId: viewer.id,
        method: "recentActivity",
        args: [expect.anything(), { kinds: [], limit: 6 }],
      },
    ]);
  });

  it("passes kinds and limit through, and pages the merged set", async () => {
    const { invoke, calls } = activitySidecar();
    const result = await run(
      `{ me { recentActivity(kinds: [REVIEWED, TIER_LISTED], limit: 2, first: 2) {
           totalCount edges { node { id } } pageInfo { hasNextPage }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args[1]).toEqual({
      kinds: ["REVIEWED", "TIER_LISTED"],
      limit: 2,
    });
    expect(result.data?.me).toEqual({
      recentActivity: {
        totalCount: 4,
        edges: [
          { node: { id: "TIER_LISTED:t1" } },
          { node: { id: "REVIEWED:r1" } },
        ],
        pageInfo: { hasNextPage: true },
      },
    });
  });

  it("hydrates each edge through its loader: one call per distinct person, item, list and cellar", async () => {
    const { invoke, calls } = activitySidecar();
    const result = await run(FEED, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    const nodes = nodesOf(result.data);
    expect(nodes.map((n) => n.id)).toEqual([
      "TIER_LISTED:t1",
      "REVIEWED:r1",
      "REVIEWED:r2",
      "ADDED:b1",
    ]);
    expect(nodes[0]).toMatchObject({
      rank: 1,
      place: { name: "Corner Bar" },
      item: null,
      tierListItem: { tierList: { name: "Friend's bars" } },
    });
    expect(nodes[1]).toMatchObject({
      review: { score: 4.5 },
      item: { name: "Test Wine" },
      user: { id: FRIEND },
    });
    expect(nodes[3]).toMatchObject({
      cellar: { name: "Home" },
      user: { id: viewer.id },
    });

    const count = (type: string, method: string) =>
      calls.filter((c) => c.actorType === type && c.method === method);
    // Two people, one wine, one list, one cellar, one place — four entries.
    expect(
      count("UserActor", "getProfile")
        .map((c) => c.actorId)
        .sort(),
    ).toEqual([FRIEND, viewer.id].sort());
    expect(count("ItemActor", "get")).toHaveLength(1);
    expect(count("TierListActor", "get")).toHaveLength(1);
    expect(count("CellarActor", "get")).toHaveLength(1);
    expect(count("PlaceActor", "get")).toHaveLength(1);
    expect(count("FriendsCollectionActor", "recentActivity")).toHaveLength(1);
  });

  it("a list the TierList loader refuses nulls that edge — never its name — and not the page", async () => {
    const { invoke } = activitySidecar({
      "TierListActor.get": () => {
        throw new NotFoundError("TierListActor(x) has no row");
      },
    });
    const result = await run(FEED, testContext(invoke, viewer));
    const nodes = nodesOf(result.data);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]?.tierListItem).toEqual({ id: "t1", tierList: null });
    expect(JSON.stringify(result.data)).not.toContain("Friend's bars");
    expect(result.errors?.map((e) => e.path?.join("."))).toEqual([
      "me.recentActivity.edges.0.node.tierListItem.tierList",
    ]);
  });

  it("an anonymous request has no `me` and reaches no actor", async () => {
    const { invoke, calls } = activitySidecar();
    const result = await run(FEED, testContext(invoke, null));
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toBeNull();
    expect(calls).toEqual([]);
  });

  it("there is no argument for whose feed", () => {
    const viewerType = schema.getType("Viewer");
    const args =
      viewerType instanceof GraphQLObjectType
        ? (viewerType.getFields().recentActivity?.args.map((a) => a.name) ?? [])
        : [];
    expect(args.sort()).toEqual(
      ["after", "before", "first", "kinds", "last", "limit"].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */

const HERE = { lng: -97.74, lat: 30.27 };
const near = (lngOffset: number, latOffset: number) => ({
  lng: HERE.lng + lngOffset,
  lat: HERE.lat + latOffset,
});

const mapPlace = (id: string, location: { lng: number; lat: number } | null) =>
  ({
    kind: "place",
    placeId: id,
    name: `place ${id}`,
    location,
    primaryCategory: "bar",
    categories: ["bar"],
    rating: 4,
    confidence: 0.9,
    isVerified: true,
  }) satisfies MapEntry;

const FAR = "p0000003-0000-4000-8000-000000000003";
const NEAREST = "p0000001-0000-4000-8000-000000000001";
const MIDDLE = "p0000002-0000-4000-8000-000000000002";

const mapSidecar = () =>
  stubSidecar({
    "MapActor.browse": (_id, _ctx, _input, args) =>
      offsetPage(
        [
          mapPlace(FAR, near(0.015, 0.015)),
          {
            kind: "cluster",
            clusterId: 1,
            count: 12,
            center: near(0.001, 0.001),
          } satisfies MapEntry,
          mapPlace(NEAREST, near(0.0005, 0)),
          mapPlace("no-geometry", null),
          mapPlace(MIDDLE, near(0, 0.005)),
        ],
        args as PageArgs,
      ),
    "PlaceActor.get": (id) => ({ id, name: `Place ${id.slice(0, 2)}` }),
  });

describe("Viewer.nearbyPlaces (UI parity G31)", () => {
  it("browses the viewer's own map in the old ±0.018° box, drops clusters and sorts nearest first", async () => {
    const { invoke, calls } = mapSidecar();
    const result = await run(
      `{ me { nearbyPlaces(location: { lng: ${HERE.lng}, lat: ${HERE.lat} }, categories: ["bar"]) {
           edges { node { distanceMeters place { id name } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();

    const browse = calls.filter((c) => c.method === "browse");
    expect(browse).toHaveLength(1);
    expect(browse[0]?.actorType).toBe("MapActor");
    expect(browse[0]?.actorId).toBe(viewer.id);
    const input = browse[0]?.args[1] as {
      bounds: { north: number; south: number; east: number; west: number };
      categories: string[];
      limit: number;
    };
    expect(input.limit).toBe(6);
    expect(input.categories).toEqual(["bar"]);
    expect(input.bounds.north - input.bounds.south).toBeCloseTo(
      2 * NEARBY_RADIUS_DEG,
    );
    expect(input.bounds.west).toBeCloseTo(HERE.lng - NEARBY_RADIUS_DEG);

    const edges = (
      result.data as {
        me: {
          nearbyPlaces: {
            edges: {
              node: { distanceMeters: number; place: { id: string } };
            }[];
          };
        };
      }
    ).me.nearbyPlaces.edges;
    expect(edges.map((e) => e.node.place.id)).toEqual([NEAREST, MIDDLE, FAR]);
    expect(edges[0]?.node.distanceMeters).toBeCloseTo(
      distanceMeters(HERE, near(0.0005, 0)),
    );
    // One PlaceActor.get per place drawn.
    expect(calls.filter((c) => c.actorType === "PlaceActor")).toHaveLength(3);
  });

  it("refuses an out-of-range point or limit before addressing any actor", async () => {
    for (const args of [
      "location: { lng: 200, lat: 0 }",
      "location: { lng: 0, lat: 91 }",
      "location: { lng: 0, lat: 0 }, limit: 0",
      "location: { lng: 0, lat: 0 }, limit: 21",
    ]) {
      const { invoke, calls } = mapSidecar();
      const result = await run(
        `{ me { nearbyPlaces(${args}) { edges { node { distanceMeters } } } } }`,
        testContext(invoke, viewer),
      );
      expect(result.errors?.[0]?.message, args).toMatch(/limit|WGS-84/);
      expect(calls, args).toEqual([]);
    }
  });

  it("matches the old strip's haversine", () => {
    // ~111.2 km per degree of latitude.
    expect(distanceMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })).toBeCloseTo(
      111_195,
      -1,
    );
  });
});
