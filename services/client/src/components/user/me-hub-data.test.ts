import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { badgeText, EMPTY_ME_HUB, meHubFromResult } from "./me-hub-data";

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

describe("badgeText", () => {
  test("the count, capped where the read stops", () => {
    assert.equal(badgeText(1), "1");
    assert.equal(badgeText(42), "42");
    assert.equal(badgeText(100), "99+");
  });
});
