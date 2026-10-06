/**
 * C3's GraphQL surface — the id half of §1.5, proved at the API boundary.
 *
 * > Pothos resolves ids through a DataLoader that batches into parallel
 * > entity-actor calls.
 *
 * C3's acceptance names the failure this guards against: *"assert call count =
 * page size, not page size × relations"*. So every test below asks for several
 * fields of every node — the shape that turns a naive resolver into an N+1 —
 * and asserts **one** collection call plus **one entity call per node**.
 *
 * `schema.test.ts` already covers `me.favorites` (the `Item` loader) and the
 * "no unbounded list field" rule; this file covers the four collections whose
 * DataLoaders C3 added, and the two catalog collections that deliberately
 * return projections and therefore make *no* entity call at all.
 */
import type { PageArgs } from "@cellar-assistant/contracts";
import {
  brandLinksCollectionActorId,
  brandsCollectionActorId,
  offsetPage,
  parseItemActorId,
  recipeGroupsCollectionActorId,
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

const ids = ["a1", "a2", "a3"];

const page = <T>(nodes: readonly T[], args: unknown) =>
  offsetPage(nodes, args as PageArgs);

describe("myCellars (§2.2 → ids → CellarActor.get)", () => {
  it("makes one collection call and one actor call per cellar", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarsCollectionActor.list": (_actorId, _ctx, args) => page(ids, args),
      "CellarActor.get": (actorId) => ({
        id: actorId,
        name: `Cellar ${actorId}`,
        privacy: "PRIVATE",
        createdById: viewer.id,
        coOwnerIds: [],
        itemCount: 4,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `{ myCellars(first: 3) {
           ... on CellarConnection {
             totalCount
             edges { cursor node { id name privacy itemCount createdById } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const connection = (result.data as { myCellars: { edges: unknown[] } })
      .myCellars;
    expect(connection.edges).toHaveLength(3);

    expect(calls.filter((c) => c.method === "list")).toHaveLength(1);
    // Five fields per node, three nodes, three actor calls — not fifteen.
    expect(
      calls.filter((c) => c.method === "get").map((c) => c.actorId),
    ).toEqual(ids);
    // The collection is addressed by the viewer's own id (§1.1).
    expect(calls[0]?.actorId).toBe(viewer.id);
  });

  it("refuses an anonymous request before any actor call", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `{ myCellars(first: 3) { __typename } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(
      (result.data as { myCellars: { __typename: string } }).myCellars
        .__typename,
    ).toBe("ForbiddenError");
    expect(calls).toEqual([]);
  });
});

describe("myTierLists (§2.2 → ids → TierListActor.get)", () => {
  it("batches the page into parallel TierListActor.get calls", async () => {
    const { invoke, calls } = stubSidecar({
      "TierListsCollectionActor.list": (_actorId, _ctx, args) =>
        page(ids, args),
      "TierListActor.get": (actorId) => ({
        id: actorId,
        name: `List ${actorId}`,
        description: null,
        createdById: viewer.id,
        privacy: "PUBLIC",
        listType: "place",
        isEditingLocked: false,
        itemCount: 7,
        aiInsights: null,
        insightsGeneratedAt: null,
        contentUpdatedAt: "2026-09-09T00:00:00.000Z",
        createdAt: null,
        updatedAt: null,
      }),
    });
    const result = await run(
      `{ myTierLists(first: 3) {
           ... on TierListConnection {
             edges { node { id name itemCount privacy contentUpdatedAt } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.filter((c) => c.method === "list")).toHaveLength(1);
    expect(
      calls.filter((c) => c.method === "get").map((c) => c.actorId),
    ).toEqual(ids);
  });
});

describe("myMenuScans (§2.2 → ids → MenuScanActor.get)", () => {
  it("batches the page and re-authorizes each scan in its own actor", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScansCollectionActor.list": (_actorId, _ctx, args) =>
        page(ids, args),
      "MenuScanActor.get": (actorId) => ({
        id: actorId,
        userId: viewer.id,
        placeId: null,
        estimatedPlaceId: null,
        manualPlaceOverride: null,
        effectivePlaceId: null,
        originalImageId: "f1",
        processedImageId: null,
        extractedText: null,
        processingStatus: "completed",
        processingError: null,
        confidenceScore: null,
        processingModel: null,
        processingDurationMs: null,
        itemsDetected: 12,
        itemsMatched: 3,
        scannedAt: null,
        processedAt: null,
        createdAt: null,
        updatedAt: null,
      }),
    });
    const result = await run(
      `{ myMenuScans(first: 3) {
           ... on MenuScanConnection {
             edges { node { id userId processingStatus itemsDetected itemsMatched } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.filter((c) => c.method === "list")).toHaveLength(1);
    expect(
      calls.filter((c) => c.method === "get").map((c) => c.actorId),
    ).toEqual(ids);
  });
});

describe("myFriends (§2.2 → ids → UserActor.getProfile)", () => {
  it("batches the friend ids into parallel getProfile calls", async () => {
    const friends = ids.map((id) => ({
      userId: id,
      since: "2026-09-09T00:00:00.000Z",
    }));
    const { invoke, calls } = stubSidecar({
      "FriendsCollectionActor.friends": (_actorId, _ctx, args) =>
        page(friends, args),
      "UserActor.getProfile": (actorId) => ({
        id: actorId,
        displayName: `User ${actorId}`,
        avatarUrl: null,
        locale: "en",
        email: null,
      }),
    });
    const result = await run(
      `{ myFriends(first: 3) {
           ... on FriendConnection {
             edges { node { since user { id displayName locale } } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.filter((c) => c.method === "friends")).toHaveLength(1);
    expect(
      calls.filter((c) => c.method === "getProfile").map((c) => c.actorId),
    ).toEqual(ids);
  });
});

describe("Item.checkIns (§2.2 → projection, no entity actor to load)", () => {
  it("returns rows whole and dataloads only the item they name", async () => {
    const wine = {
      id: "w1",
      type: "WINE" as const,
      name: "Chateau Test",
      description: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
      createdById: viewer.id,
      barcodeCode: null,
      country: null,
      vintage: null,
      variety: null,
      region: null,
      style: "RED",
      alcoholContentPercentage: null,
    };
    const checkIns = ["c1", "c2"].map((id) => ({
      id,
      userId: viewer.id,
      item: { type: "WINE" as const, id: "w1" },
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    }));
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => wine,
      "CheckInsCollectionActor.list": (_actorId, _ctx, _item, args) =>
        page(checkIns, args),
    });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           ... on QueryItemSuccess {
             data {
               id
               checkIns(first: 5) {
                 edges { node { id userId createdAt item { id name } } }
               }
             }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.filter((c) => c.method === "list")).toHaveLength(1);
    // Two `ItemActor.get` calls, not three: one is the root `item` field,
    // which resolves the actor directly, and the second is the DataLoader
    // batching *both* check-ins' `item` — they share one key. A third would
    // mean the loader was bypassed per row.
    expect(calls.filter((c) => c.method === "get")).toHaveLength(2);
    // The collection is keyed by the viewer, and the item travels as an argument.
    const list = calls.find((c) => c.method === "list");
    expect(list?.actorId).toBe(viewer.id);
    expect(list?.args[1]).toEqual({ type: "WINE", id: "w1" });
  });
});

describe("the two catalog collections return projections (§1.5)", () => {
  it("brands makes no entity-actor call at all", async () => {
    const rows = ids.map((id) => ({
      id,
      name: `Brand ${id}`,
      description: null,
      logoUrl: null,
      brandType: "winery" as const,
      parentBrandId: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    }));
    const { invoke, calls } = stubSidecar({
      "BrandsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page(rows, args),
    });
    const result = await run(
      `{ brands(first: 3) {
           ... on BrandConnection {
             edges { node { id name brandType } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    // One call, no fan-out: the projection *is* the answer.
    expect(calls).toHaveLength(1);
    // The filter is passed as well as hashed into the id, so the actor can
    // re-derive its own key on every turn.
    //
    // A7g widened `BrandsFilter` with `parentBrandId`, so this literal grew a
    // field. It is the *assertion* that was out of date and not the change:
    // what §1.5 asks of this field — a projection, and no entity-actor call —
    // is `expect(calls).toHaveLength(1)` above, and A7g's reverse edges route
    // through this same collection actor rather than reaching for
    // `BrandActor`, so that count is still one. `toEqual` is a whole-object
    // comparison, so widening the literal does not weaken it: a stray field or
    // a wrong value still fails here.
    expect(calls[0]?.args[1]).toEqual({ brandType: null, parentBrandId: null });
  });

  /**
   * A7g, and the half the assertion above cannot see: `parentBrandId` has to
   * reach the actor *and* the actor id, because `ScopedCollectionActorBase`
   * re-derives its key from the filter on every turn and refuses a mismatch.
   * Two brand pages must therefore be two activations, not one.
   */
  it("routes brands(parentBrandId:) to its own activation, still with no entity call", async () => {
    const parentId = "44444444-4444-4444-8444-444444444444";
    const { invoke, calls } = stubSidecar({
      "BrandsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page([], args),
    });
    const result = await run(
      `{ unfiltered: brands(first: 3) {
           ... on BrandConnection { totalCount }
         }
         children: brands(first: 3, parentBrandId: "${parentId}") {
           ... on BrandConnection { totalCount }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args[1]).toEqual({
      brandType: null,
      parentBrandId: parentId,
    });
    // Distinct filters are distinct actors — the point of hashing the filter
    // into the id rather than running one keyless `/brands` singleton (C3).
    expect(calls[0]?.actorId).not.toBe(calls[1]?.actorId);
    expect(calls[1]?.actorId).toBe(
      brandsCollectionActorId({ brandType: null, parentBrandId: parentId }),
    );
  });

  it("recipeGroups makes no entity-actor call at all", async () => {
    const rows = ids.map((id) => ({
      id,
      name: `Group ${id}`,
      description: null,
      category: "cocktail" as const,
      baseSpirit: "gin",
      tags: [],
      imageUrl: null,
      createdById: null,
      canonicalRecipeId: null,
      recipeCount: 2,
      createdAt: null,
      updatedAt: null,
    }));
    const { invoke, calls } = stubSidecar({
      "RecipeGroupsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page(rows, args),
    });
    const result = await run(
      `{ recipeGroups(first: 3, category: cocktail) {
           ... on RecipeGroupConnection {
             edges { node { id name category recipeCount baseSpirit } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[1]).toEqual({
      category: "cocktail",
      baseSpirit: null,
      term: null,
      orderBy: "NEWEST",
    });
  });

  it("recipeGroups(term) (UI parity G26) trims the term and addresses the actor its filter hashes to", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page([], args),
    });
    const result = await run(
      `{
        a: recipeGroups(first: 3, term: "  negroni ") {
          ... on RecipeGroupConnection { totalCount }
        }
        b: recipeGroups(first: 3, term: "   ") {
          ... on RecipeGroupConnection { totalCount }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const filters = calls.map((call) => call.args[1]);
    expect(filters).toContainEqual({
      category: null,
      baseSpirit: null,
      term: "negroni",
      orderBy: "NEWEST",
    });
    // Blank is no filter — and the same activation as no term at all.
    expect(filters).toContainEqual({
      category: null,
      baseSpirit: null,
      term: null,
      orderBy: "NEWEST",
    });
    const termCall = calls.find(
      (call) => (call.args[1] as { term: string | null }).term === "negroni",
    );
    expect(termCall?.actorId).toBe(
      recipeGroupsCollectionActorId({ term: "negroni" }),
    );
    expect(termCall?.actorId).not.toBe(recipeGroupsCollectionActorId({}));
  });

  it("recipeGroups(orderBy) (UI parity #15): NEWEST by default, NAME on request, each on its own activation", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page([], args),
    });
    const result = await run(
      `{
        byDefault: recipeGroups(first: 3) {
          ... on RecipeGroupConnection { totalCount }
        }
        newest: recipeGroups(first: 3, orderBy: NEWEST) {
          ... on RecipeGroupConnection { totalCount }
        }
        byName: recipeGroups(first: 3, orderBy: NAME) {
          ... on RecipeGroupConnection { totalCount }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const orders = calls.map(
      (call) => (call.args[1] as { orderBy: string }).orderBy,
    );
    expect(orders.sort()).toEqual(["NAME", "NEWEST", "NEWEST"]);
    const nameCall = calls.find(
      (call) => (call.args[1] as { orderBy: string }).orderBy === "NAME",
    );
    const newestIds = calls
      .filter(
        (call) => (call.args[1] as { orderBy: string }).orderBy === "NEWEST",
      )
      .map((call) => call.actorId);
    // Omitted and NEWEST are one activation — the one every orderBy-less
    // filter always had; NAME is another.
    expect(new Set(newestIds)).toEqual(
      new Set([recipeGroupsCollectionActorId({})]),
    );
    expect(nameCall?.actorId).toBe(
      recipeGroupsCollectionActorId({ orderBy: "NAME" }),
    );
    expect(nameCall?.actorId).not.toBe(recipeGroupsCollectionActorId({}));
  });

  it("recipeGroups(orderBy) refuses a value outside the enum", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page([], args),
    });
    const result = await run(
      `{ recipeGroups(first: 3, orderBy: CREATED_AT) { __typename } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors?.[0]?.message).toMatch(/"orderBy" has invalid value/);
    expect(calls).toHaveLength(0);
  });
});

describe("myDiscoveries (§2.2 → projection; scope withdrawn and replaced)", () => {
  it("is one call to the viewer's own collection actor", async () => {
    const rows = [
      {
        id: "s1",
        menuScanId: "scan-1",
        placeMenuItemId: "mi-1",
        placeId: "p-1",
        menuItemName: "Chateau Test 2019",
        target: {
          kind: "ITEM" as const,
          item: { type: "WINE" as const, id: "w1" },
        },
        confidenceScore: 0.91,
        matchReasoning: null,
        similarityMetrics: null,
        accepted: null,
        rejected: null,
        actedBy: null,
        actedAt: null,
        createdAt: null,
      },
    ];
    const { invoke, calls } = stubSidecar({
      "MatchSuggestionsCollectionActor.list": (_actorId, _ctx, args) =>
        page(rows, args),
    });
    const result = await run(
      `{ myDiscoveries(first: 10) {
           ... on MatchSuggestionConnection {
             edges { node { id menuScanId menuItemName confidenceScore targetKind } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls).toHaveLength(1);
    // Keyed by the viewer: the feed is the viewer's own scans, and the actor
    // refuses any caller who is not this id.
    expect(calls[0]?.actorId).toBe(viewer.id);
  });
});

/**
 * A7g's four reverse edges on `Brand`, at the §1.5 boundary.
 *
 * D4 recorded the gap — *"`Brand` has no reverse edges at all"* — and the four
 * fields that close it each make a different §1.5 claim. Each claim is one
 * assertion below, because the interesting failure is never "the field is
 * missing"; it is the field working while costing a call per row.
 */
describe("Brand's reverse edges (A7g, §1.5)", () => {
  const BRAND_ID = "22222222-2222-4222-8222-222222222222";
  const PARENT_ID = "33333333-3333-4333-8333-333333333333";

  const brandRow = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Brand ${id}`,
    description: null,
    logoUrl: null,
    brandType: "winery" as const,
    parentBrandId: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  });

  it("resolves a page of siblings' parents in ONE batch, not one call each", async () => {
    // The claim in `brand.ts`: `parentBrand` is a key handed to the same
    // `Brand` DataLoader, so it costs no round trip of its own. Three
    // siblings sharing a parent must therefore be four `BrandActor.get`
    // calls in total — three for the page's own rows plus one shared
    // parent — and not three more.
    const { invoke, calls } = stubSidecar({
      "BrandsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page(
          ids.map((id) => brandRow(id, { parentBrandId: PARENT_ID })),
          args,
        ),
      "BrandActor.get": (actorId) => brandRow(actorId),
    });
    const result = await run(
      `{ brands(first: 3) {
           ... on BrandConnection {
             edges { node { id parentBrand { id name } } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    // The page itself is a projection, so the only entity calls here are the
    // parents — one, for the one distinct parent id.
    expect(
      calls.filter((c) => c.method === "get").map((c) => c.actorId),
    ).toEqual([PARENT_ID]);
  });

  it("answers childBrands from the brands collection, never from BrandActor", async () => {
    // §1.5's rule for this field: a sub-brand list is the same catalog
    // projection the index is, scoped by `parentBrandId`. If this ever
    // reached for an entity actor it would be a `BrandActor → BrandActor`
    // fan-out — the N+1 the rule exists to forbid.
    const { invoke, calls } = stubSidecar({
      "BrandActor.get": () => brandRow(BRAND_ID),
      "BrandsCollectionActor.list": (_actorId, _ctx, _filter, args) =>
        page(
          ids.map((id) => brandRow(id)),
          args,
        ),
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           ... on Brand {
             childBrands(first: 3) {
               totalCount
               edges { node { id name brandType } }
             }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    // One `get` for the brand itself, one `list` for its children, nothing else.
    expect(calls.map((c) => `${c.actorType}.${c.method}`)).toEqual([
      "BrandActor.get",
      "BrandsCollectionActor.list",
    ]);
    const list = calls[1];
    expect(list?.args[1]).toEqual({
      brandType: null,
      parentBrandId: BRAND_ID,
    });
    expect(list?.actorId).toBe(
      brandsCollectionActorId({ brandType: null, parentBrandId: BRAND_ID }),
    );
  });

  it("answers items through BrandLinksCollectionActor and one batched Item fan-out", async () => {
    // The link tables belong to `ItemActor`/`PlaceActor` (`TABLE_WRITERS`), so
    // the reverse read is a collection actor's — asserted here by actor *type*,
    // because "which actor answers this" is the design decision, not an
    // implementation detail.
    const refs = [
      { type: "WINE" as const, id: "w1" },
      { type: "BEER" as const, id: "b1" },
    ];
    const { invoke, calls } = stubSidecar({
      "BrandActor.get": () => brandRow(BRAND_ID),
      "BrandLinksCollectionActor.items": (_actorId, _ctx, _filter, args) =>
        page(refs, args),
      "ItemActor.get": (actorId) => {
        const ref = parseItemActorId(actorId);
        return {
          id: ref?.id ?? actorId,
          type: ref?.type ?? "WINE",
          name: `Item ${actorId}`,
          description: null,
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
          createdById: viewer.id,
          barcodeCode: null,
        };
      },
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           ... on Brand {
             items(first: 5) {
               totalCount
               edges { node { id name createdAt createdById } }
             }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const links = calls.filter((c) => c.method === "items");
    expect(links).toHaveLength(1);
    expect(links[0]?.actorType).toBe("BrandLinksCollectionActor");
    expect(links[0]?.actorId).toBe(
      brandLinksCollectionActorId({ brandId: BRAND_ID }),
    );
    expect(links[0]?.args[1]).toEqual({ brandId: BRAND_ID });
    // Four fields per node, two nodes, two `ItemActor.get` calls — not eight.
    expect(
      calls.filter((c) => c.actorType === "ItemActor").map((c) => c.actorId),
    ).toEqual(["wine:w1", "beer:b1"]);
  });

  it("answers places with the link rows, and costs nothing extra for place.id", async () => {
    // `places` returns `place_brands` rows rather than places on purpose: the
    // relationship is on the link. `PlaceBrand.place` is a stub built from the
    // id already in hand, so selecting it alone must not activate `PlaceActor`.
    const rows = ["p1", "p2"].map((placeId, index) => ({
      id: `link-${placeId}`,
      placeId,
      brandId: BRAND_ID,
      relationshipType:
        index === 0 ? ("owned_by" as const) : ("serves" as const),
      createdAt: "2026-09-09T00:00:00.000Z",
    }));
    const { invoke, calls } = stubSidecar({
      "BrandActor.get": () => brandRow(BRAND_ID),
      "BrandLinksCollectionActor.places": (_actorId, _ctx, _filter, args) =>
        page(rows, args),
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           ... on Brand {
             places(first: 5) {
               totalCount
               edges { node { id relationshipType place { id } } }
             }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.map((c) => `${c.actorType}.${c.method}`)).toEqual([
      "BrandActor.get",
      "BrandLinksCollectionActor.places",
    ]);
    expect(calls[1]?.args[1]).toEqual({ brandId: BRAND_ID });
  });
});
