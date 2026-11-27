import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  badgeText,
  countTiles,
  EMPTY_ME_EXTRAS,
  EMPTY_ME_HUB,
  meCountsFromResult,
  meExtrasFromResult,
  meHubFromResult,
} from "./me-hub-data";

describe("meHubFromResult", () => {
  test("pinned lists, their total, and only PENDING incoming requests", () => {
    const data = meHubFromResult({
      myTierLists: {
        __typename: "TierListConnection",
        totalCount: 5,
        edges: [{ node: { id: "t1", name: "Reds", itemCount: 3 } }],
      },
      myFriendRequests: {
        __typename: "FriendRequestConnection",
        edges: [
          { node: { id: "r1", status: "PENDING" } },
          { node: { id: "r2", status: "ACCEPTED" } },
          { node: { id: "r3", status: "PENDING" } },
        ],
      },
    } as unknown as Parameters<typeof meHubFromResult>[0]);
    assert.deepEqual(data, {
      counts: null,
      pinnedTierLists: [{ id: "t1", name: "Reds", itemCount: 3 }],
      tierListCount: 5,
      pendingFriendRequests: 2,
    });
  });

  test("a failed half reads as empty, not as an error", () => {
    const data = meHubFromResult({
      myTierLists: { __typename: "InternalError", message: "x" },
      myFriendRequests: { __typename: "ForbiddenError", message: "x" },
    } as unknown as Parameters<typeof meHubFromResult>[0]);
    assert.deepEqual(data, EMPTY_ME_HUB);
    assert.deepEqual(meHubFromResult(null), EMPTY_ME_HUB);
  });
});

describe("meCountsFromResult", () => {
  test("the viewer's counts, or null when there is no viewer or no data", () => {
    const counts = { bottles: 4, logs: 9, places: 2, tierLists: 5 };
    assert.deepEqual(meCountsFromResult({ me: { id: "u1", counts } }), counts);
    assert.equal(meCountsFromResult({ me: null }), null);
    assert.equal(meCountsFromResult(null), null);
  });
});

describe("countTiles", () => {
  test("names each noun, singular at one, in a fixed order", () => {
    assert.deepEqual(
      countTiles({ bottles: 53, logs: 1, places: 14, tierLists: 2 }).map(
        (tile) => `${tile.value} ${tile.noun}`,
      ),
      ["53 bottles", "1 log", "14 places", "2 tier lists"],
    );
  });

  test("a zero count is not a tile; nothing known is no row", () => {
    assert.deepEqual(
      countTiles({ bottles: 0, logs: 3, places: 0, tierLists: 1 }).map(
        (tile) => tile.key,
      ),
      ["logs", "tierLists"],
    );
    assert.deepEqual(
      countTiles({ bottles: 0, logs: 0, places: 0, tierLists: 0 }),
      [],
    );
    assert.deepEqual(countTiles(null), []);
  });
});

describe("badgeText", () => {
  test("the count, capped where the read stops", () => {
    assert.equal(badgeText(1), "1");
    assert.equal(badgeText(42), "42");
    assert.equal(badgeText(100), "99+");
  });
});

describe("meExtrasFromResult", () => {
  const result = (requests: unknown[]) =>
    ({
      me: {
        id: "me",
        favorites: { totalCount: 27 },
        wantToTry: { totalCount: 9 },
      },
      myFriends: { __typename: "FriendConnection", totalCount: 3 },
      myTierLists: {
        __typename: "TierListConnection",
        edges: [
          {
            node: {
              id: "t1",
              items: {
                edges: [
                  { node: { band: 5 } },
                  { node: { band: 5 } },
                  { node: { band: 3 } },
                ],
              },
            },
          },
        ],
      },
      myFriendRequests: {
        __typename: "FriendRequestConnection",
        edges: requests,
      },
    }) as unknown as Parameters<typeof meExtrasFromResult>[0];

  test("counts, and each pinned list's bands in order, best first", () => {
    const extras = meExtrasFromResult(result([]));
    assert.equal(extras.loved, 27);
    assert.equal(extras.wantToTry, 9);
    assert.equal(extras.friends, 3);
    assert.deepEqual(extras.bands.t1, [
      { band: 5, count: 2 },
      { band: 3, count: 1 },
    ]);
  });

  test("Accept is offered only on a pending request someone sent the viewer", () => {
    // An outgoing request is the viewer's own: accepting it would make a
    // friendship the other person never agreed to (the wrong write).
    const extras = meExtrasFromResult(
      result([
        {
          node: {
            id: "in",
            status: "PENDING",
            direction: "INCOMING",
            user: { id: "u1", displayName: "Test Two", avatarUrl: null },
          },
        },
        {
          node: {
            id: "out",
            status: "PENDING",
            direction: "OUTGOING",
            user: { id: "u2", displayName: "Someone", avatarUrl: null },
          },
        },
        {
          node: {
            id: "done",
            status: "ACCEPTED",
            direction: "INCOMING",
            user: { id: "u3", displayName: "Other", avatarUrl: null },
          },
        },
      ]),
    );
    assert.deepEqual(
      extras.requests.map((request) => request.id),
      ["in"],
    );
  });

  test("a failed read is no counts and no requests, never an error", () => {
    const extras = meExtrasFromResult(null);
    assert.deepEqual(extras, EMPTY_ME_EXTRAS);
  });
});
