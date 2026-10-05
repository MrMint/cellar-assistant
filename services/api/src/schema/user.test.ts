/**
 * The user aggregate's GraphQL surface, against a stub sidecar (B4).
 *
 * `services/actors/src/actors/user-actor.test.ts` proves the *behaviour* against
 * real Postgres and a real outbox. What is proved here is the half that lives
 * in this process and nowhere else:
 *
 *   - every friend mutation is addressed to the **viewer's own** actor, never
 *     to the other party's (§1.2 — an actor writes only its own rows);
 *   - `ctx` is bound by the context factory and passed first, so a resolver
 *     cannot forge, reorder or forget it (§8.2);
 *   - a typed actor error lands on the field's `<Command>Result` union rather
 *     than as a generic failure (§8.3);
 *   - the three `system` methods have no field at all.
 */
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const alice = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@test.com",
  emailVerified: true,
  role: "user" as const,
};
const BOB = "22222222-2222-4222-8222-222222222222";

const profile = (id: string, name: string, email: string | null = null) => ({
  id,
  displayName: name,
  avatarUrl: null,
  locale: "en",
  email,
});

describe("user profile", () => {
  it("reads another user through their own UserActor", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.getProfile": (actorId) => profile(actorId, "Bob"),
    });
    const result = await run(
      `{ user(id: "${BOB}") { __typename ... on UserProfile { id displayName email } } }`,
      testContext(invoke, alice),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.user).toEqual({
      __typename: "UserProfile",
      id: BOB,
      displayName: "Bob",
      email: null,
    });
    expect(calls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: BOB,
      method: "getProfile",
    });
    // §8.2: ctx first, bound by the context factory.
    expect(calls[0]?.args[0]).toEqual({
      viewerId: alice.id,
      kind: "user",
      requestId: "req-test",
    });
  });

  it("puts the viewer's own profile on `me`", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.getProfile": (actorId) =>
        profile(actorId, "Alice", "alice@test.com"),
    });
    const result = await run(
      `{ me { id profile { displayName email } } }`,
      testContext(invoke, alice),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toEqual({
      id: alice.id,
      profile: { displayName: "Alice", email: "alice@test.com" },
    });
    expect(calls[0]?.actorId).toBe(alice.id);
  });

  it("maps a typed actor error onto the field's result union", async () => {
    const { invoke } = stubSidecar({
      "UserActor.getProfile": () => {
        throw new ForbiddenError("sign in to view a profile");
      },
    });
    const result = await run(
      `{ user(id: "${BOB}") { __typename ... on ActorError { code message } } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.user).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: "sign in to view a profile",
    });
  });
});

describe("friend mutations address the viewer's own actor (§1.2)", () => {
  it("sends a request from the viewer, naming the recipient as an argument", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.sendFriendRequest": (actorId, _ctx, friendId) => ({
        id: "33333333-3333-4333-8333-333333333333",
        requesterId: actorId,
        recipientId: String(friendId),
        status: "PENDING",
        direction: "OUTGOING",
        otherUser: profile(String(friendId), "Bob"),
      }),
      // C3: `FriendRequest.user` is an id resolved through the `UserProfile`
      // DataLoader now, not a profile inlined in the mutation's payload.
      "UserActor.getProfile": (actorId) => profile(actorId, "Bob"),
    });
    const result = await run(
      `mutation {
         sendFriendRequest(userId: "${BOB}") {
           __typename
           ... on FriendRequest { requesterId recipientId direction user { displayName } }
         }
       }`,
      testContext(invoke, alice),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sendFriendRequest).toEqual({
      __typename: "FriendRequest",
      requesterId: alice.id,
      recipientId: BOB,
      direction: "OUTGOING",
      user: { displayName: "Bob" },
    });
    // The actor id is the viewer, not the recipient.
    expect(calls[0]).toMatchObject({
      actorId: alice.id,
      args: [expect.anything(), BOB],
    });
  });

  it("accepts on the recipient's (= the viewer's) actor and hides the outbox row id", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.acceptFriendRequest": (actorId, _ctx, requestId) => ({
        requestId: String(requestId),
        friendId: BOB,
        friendRowInserted: true,
        outboxRowId: "44444444-4444-4444-8444-444444444444",
        actorId,
      }),
    });
    const result = await run(
      `mutation {
         acceptFriendRequest(requestId: "55555555-5555-4555-8555-555555555555") {
           __typename
           ... on AcceptFriendRequestPayload { requestId friendId created }
         }
       }`,
      testContext(invoke, alice),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.acceptFriendRequest).toEqual({
      __typename: "AcceptFriendRequestPayload",
      requestId: "55555555-5555-4555-8555-555555555555",
      friendId: BOB,
      created: true,
    });
    expect(calls[0]?.actorId).toBe(alice.id);
    // The delivery handle is internal; nothing in the schema exposes it.
    expect(JSON.stringify(result.data)).not.toContain("44444444");
  });

  it("surfaces the three sendFriendRequest rejections as typed errors", async () => {
    const cases = [
      [
        new ValidationError("you cannot send yourself a friend request"),
        "ValidationError",
      ],
      [new ConflictError("you are already friends"), "ConflictError"],
      [
        new ConflictError("you already have a pending friend request"),
        "ConflictError",
      ],
    ] as const;
    for (const [error, typeName] of cases) {
      const { invoke } = stubSidecar({
        "UserActor.sendFriendRequest": () => {
          throw error;
        },
      });
      const result = await run(
        `mutation { sendFriendRequest(userId: "${BOB}") {
           __typename ... on ActorError { message } } }`,
        testContext(invoke, alice),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.sendFriendRequest).toMatchObject({
        __typename: typeName,
        message: error.message,
      });
    }
  });

  it("refuses every viewer-scoped field for an anonymous request", async () => {
    const { invoke, calls } = stubSidecar({});
    for (const document of [
      `mutation { sendFriendRequest(userId: "${BOB}") { __typename } }`,
      `mutation { removeFriend(userId: "${BOB}") { __typename } }`,
      `mutation { toggleFavorite(type: WINE, itemId: "${BOB}") { __typename } }`,
      `{ myFriends(first: 5) { __typename } }`,
      `{ myFriendRequests(direction: INCOMING, first: 5) { __typename } }`,
    ]) {
      const result = await run(document, testContext(invoke));
      expect(result.errors).toBeUndefined();
      const field = Object.values(result.data ?? {})[0] as {
        __typename: string;
      };
      expect(field.__typename).toBe("ForbiddenError");
    }
    // Nothing reached the sidecar: the refusal happens before the call.
    expect(calls).toEqual([]);
  });
});

describe("the system half of the handshake has no GraphQL surface (§1.6)", () => {
  it("exposes no field for confirmFriendship, removeFriendOtherSide or withdrawFriendRequest", () => {
    const roots = [
      ...Object.keys(schema.getQueryType()?.getFields() ?? {}),
      ...Object.keys(schema.getMutationType()?.getFields() ?? {}),
    ].map((name) => name.toLowerCase());
    for (const forbidden of [
      "confirmfriendship",
      "removefriendotherside",
      "withdrawfriendrequest",
    ]) {
      expect(roots).not.toContain(forbidden);
    }
  });
});

describe("place interactions", () => {
  it("has no way for a client to set visitCount (§2.1)", () => {
    const input = schema.getType("RecordPlaceInteractionInput");
    const fields = Object.keys(
      (input as { getFields(): Record<string, unknown> }).getFields(),
    );
    expect(fields).not.toContain("visitCount");
    expect(fields).toEqual(
      expect.arrayContaining(["placeId", "isVisited", "wantToVisit"]),
    );
  });

  it("passes only what the client said, and reads back the computed count", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.recordPlaceInteraction": (_actorId, _ctx, input) => ({
        id: "66666666-6666-4666-8666-666666666666",
        placeId: (input as { placeId: string }).placeId,
        isFavorite: false,
        isVisited: true,
        wantToVisit: false,
        rating: null,
        notes: null,
        tags: [],
        lastVisitedAt: "2026-09-09T00:00:00.000Z",
        visitCount: 3,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `mutation {
         recordPlaceInteraction(input: { placeId: "${BOB}", isVisited: true }) {
           __typename ... on PlaceInteraction { visitCount isVisited }
         }
       }`,
      testContext(invoke, alice),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recordPlaceInteraction).toEqual({
      __typename: "PlaceInteraction",
      visitCount: 3,
      isVisited: true,
    });
    // Absent fields are absent, not `null`: the actor keeps their stored value.
    expect(calls[0]?.args[1]).toEqual({ placeId: BOB, isVisited: true });
  });
});
