/**
 * X18's GraphQL surface against a stub sidecar: `Viewer.counts` and
 * `friendProfile`. The rules (the friendship gate, each section's visibility,
 * the one NotFound) are `friends-collection-profile.test.ts` and
 * `user-actor-counts.test.ts` against real Postgres; this proves the wiring —
 * every call goes to the *viewer's* actors, the friend's id only ever travels
 * as an argument, and a refusal lands on the result union with its message
 * intact.
 */
import {
  MAX_PAGE_SIZE,
  NotFoundError,
  PROFILE_NOT_SHARED,
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
const FRIEND = "22222222-2222-4222-8222-222222222222";
const LIST = "33333333-3333-4333-8333-333333333333";
const CELLAR = "44444444-4444-4444-8444-444444444444";
const WINE = "55555555-5555-4555-8555-555555555555";
const ENTRY = "66666666-6666-4666-8666-666666666666";

const page = <T>(nodes: readonly T[]) => ({
  entries: nodes.map((node, index) => ({ cursor: `k:${index}`, node })),
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: nodes.length,
});

describe("Viewer.counts (X18)", () => {
  it("is one call to the viewer's own UserActor", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.counts": () => ({
        bottles: 12,
        logs: 40,
        places: 7,
        tierLists: 3,
      }),
    });
    const result = await run(
      "{ me { counts { bottles logs places tierLists } } }",
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toEqual({
      counts: { bottles: 12, logs: 40, places: 7, tierLists: 3 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: viewer.id,
      method: "counts",
    });
  });
});

describe("friendProfile (X18)", () => {
  const PROFILE = `{
    friendProfile(userId: "${FRIEND}") {
      __typename
      ... on FriendProfile {
        id
        since
        user { id displayName }
        tierLists(first: 5) { totalCount edges { node { id name } } }
        cellars(first: 5) { totalCount edges { node { id name } } }
        checkIns(first: 5) {
          totalCount
          edges { node { id score note item { id name } } }
        }
      }
      ... on ActorError { code message }
    }
  }`;

  it("reads every section from the viewer's FriendsCollectionActor, naming the friend as the argument", async () => {
    const { invoke, calls } = stubSidecar({
      "FriendsCollectionActor.profile": () => ({
        userId: FRIEND,
        since: "2026-10-01T00:00:00.000Z",
      }),
      "FriendsCollectionActor.profileTierLists": () => page([LIST]),
      "FriendsCollectionActor.profileCellars": () => page([CELLAR]),
      "FriendsCollectionActor.profileLogs": () =>
        page([
          {
            id: ENTRY,
            userId: FRIEND,
            createdById: FRIEND,
            item: { type: "WINE", id: WINE },
            score: 4.5,
            note: "smoky",
            tags: [],
            placeId: null,
            photoFileId: null,
            companionIds: [],
            fromCellar: false,
            createdAt: "2026-10-05T00:00:00.000Z",
            updatedAt: "2026-10-05T00:00:00.000Z",
          },
        ]),
      "UserActor.getProfile": (id) => ({
        id,
        displayName: "Sam",
        avatarUrl: null,
        locale: null,
        email: null,
      }),
      "TierListActor.get": () => ({
        id: LIST,
        name: "Reds",
        privacy: "FRIENDS",
        createdById: FRIEND,
        listType: "item",
        description: null,
        itemCount: 4,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        contentUpdatedAt: "2026-10-01T00:00:00.000Z",
      }),
      "CellarActor.get": () => ({
        id: CELLAR,
        name: "Bar cart",
        privacy: "FRIENDS",
        createdById: FRIEND,
        coOwnerIds: [],
        itemCount: 1,
        itemCounts: {
          total: 1,
          byType: { WINE: 1, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
        },
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      }),
      "ItemActor.get": () => ({
        id: WINE,
        name: "A Wine",
        description: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        createdById: FRIEND,
        barcodeCode: null,
        country: null,
        type: "WINE",
        vintage: null,
        variety: null,
        region: null,
        style: null,
        alcoholContentPercentage: null,
      }),
    });
    const result = await run(PROFILE, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendProfile).toMatchObject({
      __typename: "FriendProfile",
      id: FRIEND,
      since: "2026-10-01T00:00:00.000Z",
      user: { id: FRIEND, displayName: "Sam" },
      tierLists: { totalCount: 1, edges: [{ node: { id: LIST } }] },
      cellars: { totalCount: 1, edges: [{ node: { id: CELLAR } }] },
      checkIns: {
        totalCount: 1,
        edges: [
          {
            node: {
              id: ENTRY,
              score: 4.5,
              note: "smoky",
              item: { id: WINE, name: "A Wine" },
            },
          },
        ],
      },
    });

    const friendsCalls = calls.filter(
      (call) => call.actorType === "FriendsCollectionActor",
    );
    expect(friendsCalls.map((call) => call.method).sort()).toEqual([
      "profile",
      "profileCellars",
      "profileLogs",
      "profileTierLists",
    ]);
    for (const call of friendsCalls) {
      // Addressed to the viewer's own collection; the friend is an argument.
      expect(call.actorId).toBe(viewerCollectionActorId(viewer.id));
    }
    expect(
      friendsCalls.find((call) => call.method === "profileLogs")?.args[1],
    ).toEqual({ profileOf: FRIEND });
  });

  it("puts the gate's NotFound on the result union, message intact, and reads nothing else", async () => {
    const { invoke, calls } = stubSidecar({
      "FriendsCollectionActor.profile": () => {
        throw new NotFoundError(PROFILE_NOT_SHARED);
      },
    });
    const result = await run(PROFILE, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendProfile).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: PROFILE_NOT_SHARED,
    });
    // No profile read: "this account exists" is not answered before the gate.
    expect(calls.map((call) => `${call.actorType}.${call.method}`)).toEqual([
      "FriendsCollectionActor.profile",
    ]);
  });

  it("refuses an anonymous caller without calling an actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(PROFILE, testContext(invoke, null));
    expect(result.data?.friendProfile).toMatchObject({
      __typename: "ForbiddenError",
    });
    expect(calls).toEqual([]);
  });
});

describe("friendProfile sections page within the server cap (leftovers 6)", () => {
  const sidecar = () =>
    stubSidecar({
      "FriendsCollectionActor.profile": () => ({
        userId: FRIEND,
        since: "2026-10-01T00:00:00.000Z",
      }),
      "FriendsCollectionActor.profileTierLists": () => page([]),
      "FriendsCollectionActor.profileCellars": () => page([]),
      "FriendsCollectionActor.profileLogs": () => page([]),
    });
  const sections = (first: number, after?: string) => {
    const args =
      after === undefined
        ? `first: ${first}`
        : `first: ${first}, after: ${JSON.stringify(after)}`;
    return `{ friendProfile(userId: "${FRIEND}") { __typename ... on FriendProfile {
      tierLists(${args}) { totalCount }
      cellars(${args}) { totalCount }
      checkIns(${args}) { totalCount } } } }`;
  };
  const pageOf = (
    calls: ReturnType<typeof stubSidecar>["calls"],
    method: string,
  ) => calls.find((call) => call.method === method)?.args[2];

  it("clamps a request above the cap to the cap instead of blanking the profile", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(sections(500), testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendProfile).toMatchObject({
      __typename: "FriendProfile",
    });
    for (const method of [
      "profileTierLists",
      "profileCellars",
      "profileLogs",
    ]) {
      expect(pageOf(calls, method)).toMatchObject({ first: MAX_PAGE_SIZE });
    }
  });

  it("passes a page past the first 20 through as asked: its size and its cursor", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(sections(20, "k:19"), testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(pageOf(calls, "profileTierLists")).toEqual({
      first: 20,
      after: "k:19",
    });
    expect(pageOf(calls, "profileCellars")).toEqual({
      first: 20,
      after: "k:19",
    });
  });
});
