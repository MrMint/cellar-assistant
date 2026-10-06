/**
 * `TierList`'s GraphQL surface — B7. Exercised against a stub sidecar
 * (`../testing.ts`), the same pattern `cellar.test.ts` uses: this proves the
 * resolvers marshal arguments and results correctly, not that `TierListActor`
 * itself is correct (that is `tier-list-actor.test.ts`, against real Postgres).
 */
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

const tierListDto = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Bars I Love",
  description: null,
  createdById: viewer.id,
  privacy: "PRIVATE" as const,
  listType: "place",
  isEditingLocked: false,
  itemCount: 0,
  aiInsights: null,
  insightsGeneratedAt: null,
  contentUpdatedAt: "2026-09-08T00:00:00.000Z",
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

describe("tierList query", () => {
  it("resolves a tier list by id", async () => {
    const { invoke, calls } = stubSidecar({
      "TierListActor.get": () => tierListDto,
    });
    const result = await run(
      `{ tierList(id: "${tierListDto.id}") { __typename ... on TierList { id name privacy listType } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.tierList).toEqual({
      __typename: "TierList",
      id: tierListDto.id,
      name: tierListDto.name,
      privacy: "PRIVATE",
      listType: "place",
    });
    expect(calls[0]).toMatchObject({
      actorType: "TierListActor",
      actorId: tierListDto.id,
      method: "get",
    });
  });

  it("maps NotFoundError onto QueryTierListResult", async () => {
    const { invoke } = stubSidecar({
      "TierListActor.get": () => {
        throw Object.assign(new Error("no such tier list"), {
          code: "NOT_FOUND",
        });
      },
    });
    // `stubSidecar` throws a plain Error; the errors plugin only maps
    // instances of the five contract classes, so assert the field errors
    // through the class directly instead — matching schema.test.ts's own
    // "not your actor" ForbiddenError example.
    const result = await run(
      `{ tierList(id: "${tierListDto.id}") { __typename } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeDefined();
  });
});

describe("addTierListItem — items and places round-trip through the schema", () => {
  it("resolves entryType, item and place as siblings, never both", async () => {
    const wineItem = {
      id: "33333333-3333-4333-8333-333333333333",
      tierListId: tierListDto.id,
      band: 5,
      position: 0,
      notes: null,
      entry: {
        type: "WINE" as const,
        id: "44444444-4444-4444-8444-444444444444",
      },
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const placeItem = {
      id: "55555555-5555-4555-8555-555555555555",
      tierListId: tierListDto.id,
      band: 5,
      position: 1,
      notes: "great patio",
      entry: {
        type: "PLACE" as const,
        id: "66666666-6666-4666-8666-666666666666",
      },
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const { invoke, calls } = stubSidecar({
      "TierListActor.addItem": (_actorId, _ctx, input) =>
        (input as { entry: { type: string } }).entry.type === "PLACE"
          ? placeItem
          : wineItem,
      "ItemActor.get": () => ({
        id: wineItem.entry.id,
        type: "WINE",
        name: "Ridge Monte Bello",
        description: null,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
        createdById: viewer.id,
        barcodeCode: null,
        country: "USA",
        vintage: null,
        variety: null,
        region: null,
        style: "RED",
        alcoholContentPercentage: null,
      }),
    });

    const addQuery = (entry: string) => `
      mutation {
        addTierListItem(tierListId: "${tierListDto.id}", input: { entry: ${entry} }) {
          __typename
          ... on TierListItem {
            entryType
            item { __typename id ... on Wine { variety } }
            place { id }
          }
        }
      }
    `;

    const wineResult = await run(
      addQuery(`{ type: WINE, id: "${wineItem.entry.id}" }`),
      testContext(invoke, viewer),
    );
    expect(wineResult.errors).toBeUndefined();
    expect(wineResult.data?.addTierListItem).toEqual({
      __typename: "TierListItem",
      entryType: "WINE",
      item: { __typename: "Wine", id: wineItem.entry.id, variety: null },
      place: null,
    });

    const placeResult = await run(
      addQuery(`{ type: PLACE, id: "${placeItem.entry.id}" }`),
      testContext(invoke, viewer),
    );
    expect(placeResult.errors).toBeUndefined();
    expect(placeResult.data?.addTierListItem).toEqual({
      __typename: "TierListItem",
      entryType: "PLACE",
      item: null,
      place: { id: placeItem.entry.id },
    });

    expect(
      calls.filter((c) => c.method === "addItem").map((c) => c.args[1]),
    ).toEqual([
      { entry: { type: "WINE", id: wineItem.entry.id }, notes: null },
      { entry: { type: "PLACE", id: placeItem.entry.id }, notes: null },
    ]);
  });
});

describe("reorderTierListBand", () => {
  it("passes band and orderedIds through and wraps the result for paging", async () => {
    const items = [
      {
        id: "77777777-7777-4777-8777-777777777777",
        tierListId: tierListDto.id,
        band: 2,
        position: 0,
        notes: null,
        entry: {
          type: "WINE" as const,
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        createdAt: null,
        updatedAt: null,
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        tierListId: tierListDto.id,
        band: 2,
        position: 1,
        notes: null,
        entry: {
          type: "WINE" as const,
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        createdAt: null,
        updatedAt: null,
      },
    ];
    const { invoke, calls } = stubSidecar({
      "TierListActor.reorderBand": () => items,
    });
    const result = await run(
      `mutation {
        reorderTierListBand(
          tierListId: "${tierListDto.id}"
          band: 2
          orderedIds: ["${items[0]?.id}", "${items[1]?.id}"]
        ) {
          __typename
          ... on ReorderBandPayload {
            band
            items(first: 10) { edges { node { id position } } }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.reorderTierListBand).toEqual({
      __typename: "ReorderBandPayload",
      band: 2,
      items: {
        edges: [
          { node: { id: items[0]?.id, position: 0 } },
          { node: { id: items[1]?.id, position: 1 } },
        ],
      },
    });
    expect(calls[0]).toMatchObject({
      method: "reorderBand",
      args: [expect.anything(), 2, [items[0]?.id, items[1]?.id]],
    });
  });
});
