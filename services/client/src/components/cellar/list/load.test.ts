/**
 * F-145: the whole cellar is read page after page, with no 2000 cap.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const PAGES = 25;
let calls = 0;
mock.module("@/lib/api/urql-server", () => ({
  apiServerQuery: async () => {
    calls += 1;
    const last = calls === PAGES;
    return {
      cellar: {
        __typename: "Cellar",
        itemGroups: {
          bottleCount: PAGES * 100,
          edges: [],
          pageInfo: {
            hasNextPage: !last,
            endCursor: last ? null : `c${calls}`,
          },
        },
      },
    };
  },
}));

const { loadWholeCellar } = await import("./load");

describe("loadWholeCellar (F-145)", () => {
  test("reads past 20 pages and is never capped", async () => {
    const result = await loadWholeCellar("c1", {
      search: "",
      status: "in-cellar",
    });
    assert.equal(calls, PAGES);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.capped, false);
  });
});
