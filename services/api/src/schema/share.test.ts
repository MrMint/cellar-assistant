/**
 * X17's share and invite fields, against a stub sidecar. These prove the
 * resolvers marshal correctly **for an anonymous request** — the point of the
 * surface — and that a missing/private answer reaches the client as the
 * `NotFoundError` member of the result union. Whether something is shareable
 * is the actors' to decide (`tier-list-actor.test.ts` and friends).
 */
import { formatInviteToken, NotFoundError } from "@cellar-assistant/contracts";
import { execute, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

/** Validated first: `execute` alone silently skips a fragment on a typo'd type. */
const run = (document: string, context: ReturnType<typeof testContext>) => {
  const parsed = parse(document);
  expect(validate(schema, parsed)).toEqual([]);
  return execute({ schema, document: parsed, contextValue: context });
};

const LIST = "22222222-2222-4222-8222-222222222222";
const WINE = "44444444-4444-4444-8444-444444444444";
const INVITER = "11111111-1111-4111-8111-111111111111";
const SECRET = "AbCdEfGhIjKlMnOpQrSt_-";
const viewer = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "test2@test.com",
  emailVerified: true,
  role: "user" as const,
};

const sharedList = {
  id: LIST,
  name: "Fridge beers",
  description: null,
  listType: "beer",
  privacy: "PUBLIC" as const,
  ownerDisplayName: "Riley",
  updatedAt: "2026-10-08T00:00:00.000Z",
  entries: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      band: 5,
      position: 0,
      notes: "crisp",
      entryType: "WINE" as const,
      entryId: WINE,
      name: "Ridge",
      location: "California, US",
      imageFileId: "66666666-6666-4666-8666-666666666666",
    },
  ],
};

describe("sharedTierList", () => {
  it("answers an anonymous request, presigning the entry photo with that same ctx", async () => {
    const { invoke, calls } = stubSidecar({
      "TierListActor.getShared": () => sharedList,
      "FileActor.presignRead": () => ({
        url: "https://files.example/x.jpg",
        expiresAt: "2026-10-08T00:30:00.000Z",
      }),
    });
    const result = await run(
      `{ sharedTierList(id: "${LIST}") { __typename ... on SharedTierList {
           name ownerDisplayName privacy
           entries(first: 100) { edges { node { band name notes entryType entryId imageUrl } } } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sharedTierList).toEqual({
      __typename: "SharedTierList",
      name: "Fridge beers",
      ownerDisplayName: "Riley",
      privacy: "PUBLIC",
      entries: {
        edges: [
          {
            node: {
              band: 5,
              name: "Ridge",
              notes: "crisp",
              entryType: "WINE",
              entryId: WINE,
              imageUrl: "https://files.example/x.jpg",
            },
          },
        ],
      },
    });
    expect(calls[0]).toMatchObject({
      actorType: "TierListActor",
      actorId: LIST,
      method: "getShared",
    });
    expect(calls[1]?.actorType).toBe("FileActor");
  });

  it("a photo that cannot be signed is null, not a failed page", async () => {
    const { invoke } = stubSidecar({
      "TierListActor.getShared": () => sharedList,
      "FileActor.presignRead": () => {
        throw new NotFoundError("FileActor(x) has no row");
      },
    });
    const result = await run(
      `{ sharedTierList(id: "${LIST}") { ... on SharedTierList { entries { edges { node { imageUrl } } } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sharedTierList).toEqual({
      entries: { edges: [{ node: { imageUrl: null } }] },
    });
  });

  it("missing or private reaches the client as NotFoundError", async () => {
    const { invoke } = stubSidecar({
      "TierListActor.getShared": () => {
        throw new NotFoundError(`TierListActor(${LIST}) has no row`);
      },
    });
    const result = await run(
      `{ sharedTierList(id: "${LIST}") { __typename ... on NotFoundError { message } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sharedTierList).toMatchObject({
      __typename: "NotFoundError",
    });
  });
});

describe("sharedItem and sharedRecipe", () => {
  it("addresses ItemActor by its typed key and serves the whitelist", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.getShared": () => ({
        id: WINE,
        type: "WINE",
        name: "Ridge Monte Bello",
        description: null,
        country: "US",
        attributes: { vintage: "2016-01-01", style: "RED" },
        imageFileId: null,
        imagePlaceholder: null,
        scoreAverage: 4.5,
        scoreCount: 2,
      }),
    });
    const result = await run(
      `{ sharedItem(id: "${WINE}", type: WINE) { ... on SharedItem {
           type name attributes imageUrl scoreAverage scoreCount } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sharedItem).toEqual({
      type: "WINE",
      name: "Ridge Monte Bello",
      attributes: { vintage: "2016-01-01", style: "RED" },
      imageUrl: null,
      scoreAverage: 4.5,
      scoreCount: 2,
    });
    expect(calls[0]).toMatchObject({
      actorType: "ItemActor",
      actorId: `wine:${WINE}`,
      method: "getShared",
    });
  });

  it("serves a recipe's ingredients and steps", async () => {
    const { invoke } = stubSidecar({
      "RecipeActor.getShared": () => ({
        id: LIST,
        name: "Negroni",
        description: null,
        type: "cocktail",
        difficultyLevel: 1,
        prepTimeMinutes: 3,
        servingSize: 1,
        imageUrl: null,
        ingredients: [
          { name: "Campari", quantity: 30, unit: "ml", isOptional: false },
        ],
        instructions: [{ stepNumber: 1, text: "Stir with ice" }],
      }),
    });
    const result = await run(
      `{ sharedRecipe(id: "${LIST}") { ... on SharedRecipe {
           name type
           ingredients { edges { node { name quantity unit } } }
           instructions { edges { node { stepNumber text } } } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.sharedRecipe).toEqual({
      name: "Negroni",
      type: "cocktail",
      ingredients: {
        edges: [{ node: { name: "Campari", quantity: 30, unit: "ml" } }],
      },
      instructions: {
        edges: [{ node: { stepNumber: 1, text: "Stir with ice" } }],
      },
    });
  });
});

describe("friend invites", () => {
  const token = formatInviteToken(INVITER, SECRET);

  it("previews on the inviter's actor, anonymous allowed", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.previewFriendInvite": () => ({
        inviterId: INVITER,
        inviterDisplayName: "Riley",
        inviterAvatarUrl: null,
        status: "SIGNED_OUT",
      }),
    });
    const result = await run(
      `{ friendInvitePreview(token: "${token}") { ... on FriendInvitePreview {
           inviterDisplayName status } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendInvitePreview).toEqual({
      inviterDisplayName: "Riley",
      status: "SIGNED_OUT",
    });
    expect(calls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: INVITER,
      method: "previewFriendInvite",
      args: [expect.anything(), SECRET],
    });
  });

  it("F-81: the inviter's uploaded picture, presigned like every avatar", async () => {
    const FILE = "44444444-4444-4444-8444-444444444444";
    const { invoke, calls } = stubSidecar({
      "UserActor.previewFriendInvite": () => ({
        inviterId: INVITER,
        inviterDisplayName: "Riley",
        inviterAvatarUrl: "https://example.test/oauth.png",
        status: "SIGNED_OUT",
      }),
      "UserActor.getProfile": (actorId) => ({
        id: actorId,
        displayName: "Riley",
        avatarUrl: "https://example.test/oauth.png",
        avatarFileId: FILE,
        locale: "en",
        email: null,
      }),
      "FileActor.presignRead": () => ({
        url: "https://files.example.test/riley",
        expiresAt: "2026-11-27T00:30:00.000Z",
      }),
    });
    const result = await run(
      `{ friendInvitePreview(token: "${token}") { ... on FriendInvitePreview {
           inviterAvatarUrl } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendInvitePreview).toEqual({
      inviterAvatarUrl: "https://files.example.test/riley",
    });
    expect(calls.find((c) => c.actorType === "FileActor")?.actorId).toBe(FILE);
  });

  it("F-81: falls back to the stored image when the profile cannot be read", async () => {
    const { invoke } = stubSidecar({
      "UserActor.previewFriendInvite": () => ({
        inviterId: INVITER,
        inviterDisplayName: "Riley",
        inviterAvatarUrl: "https://example.test/oauth.png",
        status: "SIGNED_OUT",
      }),
      "UserActor.getProfile": () => {
        throw new NotFoundError(`UserActor(${INVITER}) has no row`);
      },
    });
    const result = await run(
      `{ friendInvitePreview(token: "${token}") { ... on FriendInvitePreview {
           inviterAvatarUrl } } }`,
      testContext(invoke, null),
    );
    expect(result.data?.friendInvitePreview).toEqual({
      inviterAvatarUrl: "https://example.test/oauth.png",
    });
  });

  it("a malformed token is NotFound without touching any actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `{ friendInvitePreview(token: "nope") { __typename } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.friendInvitePreview).toEqual({
      __typename: "NotFoundError",
    });
    expect(calls).toEqual([]);
  });

  it("accepting goes to the viewer's own actor with the parsed token", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.acceptFriendInvite": () => ({
        friendId: INVITER,
        becameFriends: true,
      }),
    });
    const result = await run(
      `mutation { acceptFriendInvite(token: "${token}") { ... on AcceptFriendInvitePayload {
           friendId becameFriends } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.acceptFriendInvite).toEqual({
      friendId: INVITER,
      becameFriends: true,
    });
    expect(calls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: viewer.id,
      method: "acceptFriendInvite",
      args: [expect.anything(), { inviterId: INVITER, secret: SECRET }],
    });
  });

  it("accepting, ensuring and resetting need a session", async () => {
    const { invoke, calls } = stubSidecar({});
    for (const mutation of [
      `acceptFriendInvite(token: "${token}")`,
      "ensureFriendInvite",
      "resetFriendInvite",
    ]) {
      const result = await run(
        `mutation { ${mutation} { __typename } }`,
        testContext(invoke, null),
      );
      expect(result.errors).toBeUndefined();
      expect(Object.values(result.data ?? {})[0]).toEqual({
        __typename: "ForbiddenError",
      });
    }
    expect(calls).toEqual([]);
  });
});
