/**
 * The cellar schema, executed against a stub sidecar (B1).
 *
 * `services/actors/src/actors/cellar-actor.test.ts` proves the behaviour against
 * real Postgres — visibility, the owner-set transaction, `bulkCheckIn`'s
 * friend rule. This file proves the half that lives here: that each field is
 * one actor call with `ctx` first and the arguments after it, that child lists
 * are connections paged from the owner (§1.5), that `CellarItem.item` goes
 * through the shared `Item` DataLoader, and that a typed actor error lands on
 * the `<Command>Result` union rather than in `errors` (§8.3).
 */
import type { CellarItemsArgs, PageArgs } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  NotFoundError,
  offsetPage,
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

const CELLAR_ID = "22222222-2222-4222-8222-222222222222";
const WINE_ID = "33333333-3333-4333-8333-333333333333";

const cellar = {
  id: CELLAR_ID,
  name: "Reds",
  privacy: "FRIENDS" as const,
  createdById: viewer.id,
  coOwnerIds: [] as string[],
  itemCount: 1,
  itemCounts: {
    total: 1,
    byType: { WINE: 1, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
  },
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const cellarItem = {
  id: "44444444-4444-4444-8444-444444444444",
  cellarId: CELLAR_ID,
  createdBy: viewer.id,
  item: { type: "WINE" as const, id: WINE_ID },
  openAt: null,
  emptyAt: null,
  percentageRemaining: 100,
  displayImageId: null,
  sourceType: "manual" as const,
  sourcePlaceId: null,
  sourceMenuItemId: null,
  distance: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const checkIn = {
  id: "55555555-5555-4555-8555-555555555555",
  userId: viewer.id,
  cellarItemId: cellarItem.id,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const wine = {
  id: WINE_ID,
  type: "WINE" as const,
  name: "Test Wine",
  description: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  createdById: viewer.id,
  barcodeCode: null,
  country: "France",
  vintage: "2020-01-01",
  variety: "Pinot Noir",
  region: "Burgundy",
  style: "RED",
  alcoholContentPercentage: 13.5,
};

const cellarSidecar = () =>
  stubSidecar({
    "CellarActor.get": () => cellar,
    "CellarActor.items": (_actorId, _ctx, args) =>
      offsetPage([cellarItem], (args as CellarItemsArgs).page),
    "CellarActor.checkIns": (_actorId, _ctx, page) =>
      offsetPage([checkIn], page as PageArgs),
    "ItemActor.get": () => wine,
  });

describe("Query.cellar (B1)", () => {
  it("names the cellar id as the actor id and passes ctx first", async () => {
    const { invoke, calls } = cellarSidecar();
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") {
           __typename
           ... on Cellar { id name privacy createdById coOwnerIds itemCount }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({
      __typename: "Cellar",
      id: CELLAR_ID,
      name: "Reds",
      privacy: "FRIENDS",
      createdById: viewer.id,
      coOwnerIds: [],
      itemCount: 1,
    });
    expect(calls[0]).toMatchObject({
      actorType: "CellarActor",
      actorId: CELLAR_ID,
      method: "get",
    });
    expect(calls[0]?.args[0]).toEqual({
      viewerId: viewer.id,
      kind: "user",
      requestId: "req-test",
    });
  });

  it("puts a NotFoundError on the result union, not in `errors` (§8.3)", async () => {
    const { invoke } = stubSidecar({
      "CellarActor.get": () => {
        throw new NotFoundError("CellarActor(x) has no row");
      },
    });
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") {
           __typename ... on ActorError { code message }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: "CellarActor(x) has no row",
    });
  });
});

describe("Cellar.items / Cellar.checkIns (§1.5)", () => {
  it("pages from the owner and resolves items through the DataLoader", async () => {
    const { invoke, calls } = cellarSidecar();
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           items(first: 10, sort: PERCENTAGE_ASC) {
             totalCount
             pageInfo { hasNextPage }
             edges { cursor node {
               id percentageRemaining sourceType distance
               item { __typename id name ... on Wine { variety } }
             } }
           }
           checkIns(first: 10) { totalCount edges { node { id userId } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const data = result.data?.cellar as {
      items: { edges: { node: Record<string, unknown> }[]; totalCount: number };
      checkIns: { totalCount: number };
    };
    expect(data.items.totalCount).toBe(1);
    expect(data.items.edges[0]?.node).toMatchObject({
      id: cellarItem.id,
      percentageRemaining: 100,
      sourceType: "manual",
      distance: null,
      item: { __typename: "Wine", id: WINE_ID, variety: "Pinot Noir" },
    });
    expect(data.checkIns.totalCount).toBe(1);

    // The `Item` loader is addressed by `wine:<uuid>`, not by a raw uuid.
    expect(
      calls.filter((call) => call.actorType === "ItemActor"),
    ).toMatchObject([{ actorId: itemActorId(cellarItem.item), method: "get" }]);
    // `sort` reaches the actor; paging is normalised into `PageArgs`.
    expect(calls.find((call) => call.method === "items")?.args[1]).toEqual({
      page: { first: 10, after: null },
      sort: "PERCENTAGE_ASC",
      semanticQuery: null,
      // G2: no filter asked for is still a filter — ACTIVE is the default.
      types: null,
      status: "ACTIVE",
    });
  });

  it("forwards a semanticQuery and refuses backward paging", async () => {
    const { invoke, calls } = cellarSidecar();
    const ok = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           items(first: 5, semanticQuery: "something oaky") { edges { cursor } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(ok.errors).toBeUndefined();
    expect(
      calls.find((call) => call.method === "items")?.args[1],
    ).toMatchObject({ semanticQuery: "something oaky" });

    const backward = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           checkIns(last: 5) { edges { cursor } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(backward.errors?.[0]?.message).toMatch(/backward pagination/);
  });
});

describe("cellar mutations (§8.3)", () => {
  it("createCellar mints the actor id and sends only the fields given", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.create": (actorId, _ctx, input) => ({
        ...cellar,
        id: actorId,
        ...(input as Record<string, unknown>),
        coOwnerIds: [],
        itemCount: 0,
      }),
    });
    const result = await run(
      `mutation { createCellar(input: { name: "Reds" }) {
         __typename ... on Cellar { name itemCount }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.createCellar).toEqual({
      __typename: "Cellar",
      name: "Reds",
      itemCount: 0,
    });
    // A fresh uuid, not a client-supplied one.
    expect(calls[0]?.actorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // `privacy`/`coOwnerIds` were absent, so they are absent on the wire too —
    // the actor distinguishes "leave it" from "clear it".
    expect(calls[0]?.args[1]).toEqual({ name: "Reds" });
  });

  it("updateCellar omits an absent coOwnerIds and forwards an empty one", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.update": () => cellar,
    });
    await run(
      `mutation { updateCellar(cellarId: "${CELLAR_ID}", input: { name: "R" }) {
         __typename } }`,
      testContext(invoke, viewer),
    );
    expect(calls[0]?.args[1]).toEqual({ name: "R" });

    await run(
      `mutation { updateCellar(cellarId: "${CELLAR_ID}", input: { coOwnerIds: [] }) {
         __typename } }`,
      testContext(invoke, viewer),
    );
    expect(calls[1]?.args[1]).toEqual({ coOwnerIds: [] });
  });

  it("addItemToCellar collapses the polymorphic FK into an ItemRef", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.addItem": () => cellarItem,
      "ItemActor.get": () => wine,
    });
    const result = await run(
      `mutation { addItemToCellar(
           cellarId: "${CELLAR_ID}",
           input: { item: { type: WINE, id: "${WINE_ID}" }, percentageRemaining: 80 }
         ) { __typename ... on CellarItem { id item { id } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args[1]).toMatchObject({
      item: { type: "WINE", id: WINE_ID },
      percentageRemaining: 80,
    });
  });

  it("bulkCheckIn returns a connection, and surfaces ForbiddenError typed", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.bulkCheckIn": (_actorId, _ctx, _cellarItemId, userIds) =>
        (userIds as string[]).map((userId, index) => ({
          ...checkIn,
          id: `id-${index}`,
          userId,
        })),
    });
    const result = await run(
      `mutation { bulkCheckIn(
           cellarId: "${CELLAR_ID}",
           cellarItemId: "${cellarItem.id}",
           userIds: ["${viewer.id}", "friend"]
         ) { __typename ... on BulkCheckInPayload {
               cellarItemId
               checkIns(first: 10) { totalCount edges { node { userId } } }
             } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.bulkCheckIn).toEqual({
      __typename: "BulkCheckInPayload",
      cellarItemId: cellarItem.id,
      checkIns: {
        totalCount: 2,
        edges: [
          { node: { userId: viewer.id } },
          { node: { userId: "friend" } },
        ],
      },
    });
    expect(calls[0]?.args.slice(1)).toEqual([
      cellarItem.id,
      [viewer.id, "friend"],
    ]);

    const denied = stubSidecar({
      "CellarActor.bulkCheckIn": () => {
        throw new ForbiddenError(
          "cannot check in on behalf of x: not a friend",
        );
      },
    });
    const refusal = await run(
      `mutation { bulkCheckIn(
           cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}",
           userIds: ["x"]
         ) { __typename ... on ActorError { code } } }`,
      testContext(denied.invoke, viewer),
    );
    expect(refusal.data?.bulkCheckIn).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
  });

  it("every other command maps onto exactly one actor method", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.delete": () => ({ id: CELLAR_ID }),
      "CellarActor.removeItem": () => ({ id: cellarItem.id }),
      "CellarActor.updateItem": () => cellarItem,
      "CellarActor.setItemPercentage": () => cellarItem,
      "CellarActor.openItem": () => cellarItem,
      "CellarActor.emptyItem": () => cellarItem,
      "CellarActor.checkIn": () => checkIn,
      "ItemActor.get": () => wine,
    });
    const result = await run(
      `mutation {
         deleteCellar(cellarId: "${CELLAR_ID}") { __typename }
         removeItemFromCellar(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}") { __typename }
         updateCellarItem(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}", input: { openAt: null }) { __typename }
         setCellarItemPercentage(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}", percentageRemaining: 25) { __typename }
         openCellarItem(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}") { __typename }
         emptyCellarItem(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}") { __typename }
         checkIn(cellarId: "${CELLAR_ID}", cellarItemId: "${cellarItem.id}") { __typename }
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.map((call) => call.method)).toEqual([
      "delete",
      "removeItem",
      "updateItem",
      "setItemPercentage",
      "openItem",
      "emptyItem",
      "checkIn",
    ]);
    // An explicitly-null `openAt` means "clear it" and must survive the trip.
    expect(calls[2]?.args[2]).toEqual({ openAt: null });
    // An omitted `checkInId` is `undefined`, never a fabricated id.
    expect(calls[6]?.args).toEqual([
      { viewerId: viewer.id, kind: "user", requestId: "req-test" },
      cellarItem.id,
      undefined,
    ]);
  });
});

describe("UI parity wave A: counts, filters, stats", () => {
  it("G1: itemCounts exposes the actor's non-empty per-type counts", async () => {
    const { invoke } = cellarSidecar();
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           itemCount
           itemCounts { total wine beer spirit coffee sake tea }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({
      itemCount: 1,
      itemCounts: {
        total: 1,
        wine: 1,
        beer: 0,
        spirit: 0,
        coffee: 0,
        sake: 0,
        tea: 0,
      },
    });
  });

  it("G2/G3: types, status and NAME_ASC reach the actor as given", async () => {
    const { invoke, calls } = cellarSidecar();
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           items(first: 5, types: [WINE, TEA], status: ALL, sort: NAME_ASC) {
             totalCount
           }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls.find((call) => call.method === "items")?.args[1]).toEqual({
      page: { first: 5, after: null },
      sort: "NAME_ASC",
      semanticQuery: null,
      types: ["WINE", "TEA"],
      status: "ALL",
    });
  });

  it("G2: an explicit null status is the default, not 'no filter'", async () => {
    const { invoke, calls } = cellarSidecar();
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") { ... on Cellar {
           items(first: 5, status: null) { totalCount }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(
      calls.find((call) => call.method === "items")?.args[1],
    ).toMatchObject({ status: "ACTIVE" });
  });

  it("a cellar you may not see leaks no counts and resolves no profile", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarActor.get": () => {
        throw new NotFoundError("CellarActor(x) has no row");
      },
      "UserActor.getProfile": () => {
        throw new Error("must not be called");
      },
    });
    const result = await run(
      `{ cellar(id: "${CELLAR_ID}") {
           __typename
           ... on Cellar {
             itemCounts { total }
             createdBy { id }
             coOwners(first: 5) { edges { node { id } } }
           }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({ __typename: "NotFoundError" });
    expect(calls.map((call) => `${call.actorType}.${call.method}`)).toEqual([
      "CellarActor.get",
    ]);
  });

  it("G36: me.collectionStats is one call to the viewer's own collection actor", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarsCollectionActor.stats": () => ({
        cellarCount: 2,
        itemCounts: {
          total: 3,
          byType: { WINE: 2, BEER: 1, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
        },
      }),
    });
    const result = await run(
      `{ me { collectionStats { cellarCount itemCounts { total wine beer } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toEqual({
      collectionStats: {
        cellarCount: 2,
        itemCounts: { total: 3, wine: 2, beer: 1 },
      },
    });
    expect(calls).toMatchObject([
      {
        actorType: "CellarsCollectionActor",
        actorId: viewer.id,
        method: "stats",
      },
    ]);
  });

  it("G36: an anonymous viewer has no `me`, so no stats call", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `{ me { collectionStats { cellarCount } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toBeNull();
    expect(calls).toEqual([]);
  });
});
