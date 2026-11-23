/**
 * L10 · `Item.seenAt`: the resolver hands the viewer's position to
 * `ItemActor.seenAt` and shapes its rows; a signed-out viewer gets `[]`
 * without a call. The privacy itself is the actor's (`lib/seen-at.test.ts`).
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
const WINE_ID = "22222222-2222-4222-8222-222222222222";
const PLACE_ID = "33333333-3333-4333-8333-333333333333";

const wine = {
  id: WINE_ID,
  type: "WINE" as const,
  name: "A Wine",
  description: null,
  country: null,
  createdById: viewer.id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  barcodeCode: null,
  barcodeType: null,
  variety: null,
  style: null,
  vintage: null,
  region: null,
  subRegion: null,
  alcoholContentPercentage: null,
  specialDesignation: null,
  vineyardDesignation: null,
};

const QUERY = `{
  item(id: "${WINE_ID}", type: WINE) {
    __typename
    ... on QueryItemSuccess {
      data {
        __typename
        seenAt(near: { lat: 37.77, lng: -122.42 }, first: 5) {
          totalCount
          edges { node {
            place { id }
            placeName kind at friendName distanceMeters
          } }
        }
      }
    }
  }
}`;

describe("Item.seenAt (L10)", () => {
  it("passes near/first to ItemActor.seenAt and shapes the rows", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => wine,
      "ItemActor.seenAt": () => [
        {
          placeId: PLACE_ID,
          placeName: "Near bar",
          kind: "FRIEND_LOG",
          at: "2026-10-01T00:00:00.000Z",
          friendName: "Maya",
          distanceMeters: 620.5,
        },
      ],
    });
    const result = await run(QUERY, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({
      __typename: "QueryItemSuccess",
      data: {
        __typename: "Wine",
        seenAt: {
          totalCount: 1,
          edges: [
            {
              node: {
                place: { id: PLACE_ID },
                placeName: "Near bar",
                kind: "FRIEND_LOG",
                at: "2026-10-01T00:00:00.000Z",
                friendName: "Maya",
                distanceMeters: 620.5,
              },
            },
          ],
        },
      },
    });
    const call = calls.find((c) => c.method === "seenAt");
    expect(call?.actorId).toBe(`wine:${WINE_ID}`);
    expect(call?.args[1]).toEqual({
      near: { lat: 37.77, lng: -122.42 },
      first: 5,
    });
  });

  it("a signed-out viewer gets [] without asking the actor", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => wine,
      "ItemActor.seenAt": () => {
        throw new Error("not called");
      },
    });
    const result = await run(QUERY, testContext(invoke, null));
    const item = result.data?.item as
      | { data?: { seenAt?: unknown } }
      | undefined;
    if (item?.data !== undefined)
      expect(item.data.seenAt).toEqual({ totalCount: 0, edges: [] });
    expect(calls.some((c) => c.method === "seenAt")).toBe(false);
  });
});
