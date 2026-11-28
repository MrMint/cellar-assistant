/**
 * L03's three reads: each addresses `TasteActor` by the session's own id,
 * passes no viewer id through `args`, and puts the actor's refusals on the
 * result union.
 */
import {
  NotFoundError,
  PROFILE_NOT_SHARED,
  type TasteAgreementDto,
  type TasteProfileDto,
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

const FRIEND = "33333333-3333-4333-8333-333333333333";

const profile: TasteProfileDto = {
  ratingCount: 12,
  types: [{ type: "WINE", count: 12 }],
  archetype: {
    key: "DEVOTED",
    title: "Devoted to Nebbiolo",
    loves: [{ type: "WINE", label: "Nebbiolo", count: 5, average: 4.8 }],
    lessKeen: [{ type: "WINE", label: "Merlot", count: 3, average: 2 }],
  },
  line: "You rate Nebbiolo highest and Merlot lowest, across 1 type.",
  linePhrasedByAi: false,
};

const agreement: TasteAgreementDto = {
  userId: FRIEND,
  name: "Maya",
  avatarUrl: null,
  shared: 9,
  agreed: 7,
  byType: [{ type: "WINE", shared: 9, agreed: 7 }],
};

describe("tasteProfile", () => {
  it("reads the viewer's own TasteActor", async () => {
    const { invoke, calls } = stubSidecar({
      "TasteActor.profile": () => profile,
    });
    const result = await run(
      `{ tasteProfile { __typename ... on TasteProfile {
          ratingCount line linePhrasedByAi
          types { edges { node { itemType count } } }
          archetype { key title loves { edges { node { label itemType count average } } } lessKeen { edges { node { label } } } }
        } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.tasteProfile).toEqual({
      __typename: "TasteProfile",
      ratingCount: 12,
      line: profile.line,
      linePhrasedByAi: false,
      types: { edges: [{ node: { itemType: "WINE", count: 12 } }] },
      archetype: {
        key: "DEVOTED",
        title: "Devoted to Nebbiolo",
        loves: {
          edges: [
            {
              node: {
                label: "Nebbiolo",
                itemType: "WINE",
                count: 5,
                average: 4.8,
              },
            },
          ],
        },
        lessKeen: { edges: [{ node: { label: "Merlot" } }] },
      },
    });
    expect(calls[0]).toMatchObject({
      actorType: "TasteActor",
      actorId: viewer.id,
      method: "profile",
    });
  });

  it("refuses a signed-out caller before addressing any actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `{ tasteProfile { __typename ... on ActorError { code } } }`,
      testContext(invoke, null),
    );
    expect(result.data?.tasteProfile).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("tasteAgreement", () => {
  it("passes the user id to the viewer's actor and serves counts", async () => {
    const { invoke, calls } = stubSidecar({
      "TasteActor.agreement": () => agreement,
    });
    const result = await run(
      `{ tasteAgreement(userId: "${FRIEND}") { __typename ... on TasteAgreement {
          userId name shared agreed byType { edges { node { itemType shared agreed } } }
        } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.tasteAgreement).toEqual({
      __typename: "TasteAgreement",
      userId: FRIEND,
      name: "Maya",
      shared: 9,
      agreed: 7,
      byType: { edges: [{ node: { itemType: "WINE", shared: 9, agreed: 7 } }] },
    });
    expect(calls[0]).toMatchObject({
      actorId: viewer.id,
      method: "agreement",
      args: [expect.objectContaining({ viewerId: viewer.id }), FRIEND],
    });
  });

  it("a hidden or missing user is a NotFoundError on the union", async () => {
    const { invoke } = stubSidecar({
      "TasteActor.agreement": () => {
        throw new NotFoundError(PROFILE_NOT_SHARED);
      },
    });
    const result = await run(
      `{ tasteAgreement(userId: "nope") { __typename ... on ActorError { code message } } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.tasteAgreement).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: PROFILE_NOT_SHARED,
    });
  });
});

describe("TasteProfile.friends", () => {
  it("serves a gated row with agreed null", async () => {
    const { invoke } = stubSidecar({
      "TasteActor.profile": () => profile,
      "TasteActor.friendAgreements": () => [
        agreement,
        { ...agreement, name: "Sam", shared: 2, agreed: null, byType: [] },
      ],
    });
    const result = await run(
      `{ tasteProfile { ... on TasteProfile { friends { __typename
          ... on TasteAgreementConnection { edges { node { name shared agreed } } }
        } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(
      (result.data?.tasteProfile as { friends?: unknown } | undefined)?.friends,
    ).toEqual({
      __typename: "TasteAgreementConnection",
      edges: [
        { node: { name: "Maya", shared: 9, agreed: 7 } },
        { node: { name: "Sam", shared: 2, agreed: null } },
      ],
    });
  });
});

describe("tasteCompare (MC-compare)", () => {
  const WINE_ID = "55555555-5555-4555-8555-555555555555";
  const wine = {
    id: WINE_ID,
    name: "Demo Barolo",
    description: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    createdById: viewer.id,
    barcodeCode: null,
    country: "ITALY",
    type: "WINE" as const,
    vintage: "2019-01-01",
    variety: "NEBBIOLO",
    region: "Piedmont",
    style: "RED",
    alcoholContentPercentage: 14,
  };
  const COMPARE = `query ($userId: ID!, $itemType: ItemType) {
    tasteCompare(userId: $userId, itemType: $itemType) {
      __typename
      ... on TasteCompare {
        rows(first: 10) { edges { node { myScore theirScore item { id name type } } } }
      }
      ... on Error { message }
    }
  }`;
  const runCompare = (
    context: ReturnType<typeof testContext>,
    variables: Record<string, unknown>,
  ) =>
    execute({
      schema,
      document: parse(COMPARE),
      contextValue: context,
      variableValues: variables,
    });

  it("passes the friend and the kind chip to the viewer's actor, rows with their item", async () => {
    const { invoke, calls } = stubSidecar({
      "TasteActor.compare": () => [
        {
          item: { type: "WINE", id: WINE_ID },
          name: "Demo Barolo",
          myScore: 4.5,
          theirScore: 2,
        },
      ],
      "ItemActor.get": () => wine,
    });
    const result = await runCompare(testContext(invoke, viewer), {
      userId: FRIEND,
      itemType: "WINE",
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.tasteCompare).toEqual({
      __typename: "TasteCompare",
      rows: {
        edges: [
          {
            node: {
              myScore: 4.5,
              theirScore: 2,
              item: { id: WINE_ID, name: "Demo Barolo", type: "WINE" },
            },
          },
        ],
      },
    });
    const call = calls.find((c) => c.method === "compare");
    expect(call).toMatchObject({ actorType: "TasteActor", actorId: viewer.id });
    expect(call?.args[1]).toEqual({ userId: FRIEND, itemType: "WINE" });
  });

  it("refuses a signed-out caller before addressing any actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await runCompare(testContext(invoke), { userId: FRIEND });
    expect(result.data?.tasteCompare).toMatchObject({
      __typename: "ForbiddenError",
    });
    expect(calls).toHaveLength(0);
  });

  it("has no argument naming the viewer", () => {
    const field = schema.getQueryType()?.getFields().tasteCompare;
    expect(field?.args.map((arg) => arg.name).sort()).toEqual([
      "itemType",
      "userId",
    ]);
  });
});
