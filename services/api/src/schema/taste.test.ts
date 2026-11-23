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
          types { itemType count }
          archetype { key title loves { label itemType count average } lessKeen { label } }
        } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.tasteProfile).toEqual({
      __typename: "TasteProfile",
      ratingCount: 12,
      line: profile.line,
      linePhrasedByAi: false,
      types: [{ itemType: "WINE", count: 12 }],
      archetype: {
        key: "DEVOTED",
        title: "Devoted to Nebbiolo",
        loves: [
          { label: "Nebbiolo", itemType: "WINE", count: 5, average: 4.8 },
        ],
        lessKeen: [{ label: "Merlot" }],
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
          userId name shared agreed byType { itemType shared agreed }
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
      byType: [{ itemType: "WINE", shared: 9, agreed: 7 }],
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

describe("friendTasteAgreements", () => {
  it("serves a gated row with agreed null", async () => {
    const { invoke } = stubSidecar({
      "TasteActor.friendAgreements": () => [
        agreement,
        { ...agreement, name: "Sam", shared: 2, agreed: null, byType: [] },
      ],
    });
    const result = await run(
      `{ friendTasteAgreements { __typename
          ... on QueryFriendTasteAgreementsSuccess { data { name shared agreed } }
        } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendTasteAgreements).toEqual({
      __typename: "QueryFriendTasteAgreementsSuccess",
      data: [
        { name: "Maya", shared: 9, agreed: 7 },
        { name: "Sam", shared: 2, agreed: null },
      ],
    });
  });
});
