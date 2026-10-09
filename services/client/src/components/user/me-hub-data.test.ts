import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  badgeText,
  countTiles,
  EMPTY_ME_HUB,
  meHubFromResult,
} from "./me-hub-data";

describe("meHubFromResult", () => {
  test("pinned lists, their total, and only PENDING incoming requests", () => {
    const data = meHubFromResult({
      me: {
        id: "u1",
        counts: { bottles: 4, logs: 9, places: 2, tierLists: 5 },
      },
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
      counts: { bottles: 4, logs: 9, places: 2, tierLists: 5 },
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
