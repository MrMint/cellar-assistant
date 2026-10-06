import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadRest, type RestConnection } from "./load-rest";

const page = (
  ids: string[],
  next: string | null,
): RestConnection<{ id: string }> => ({
  edges: ids.map((id) => ({ id })),
  pageInfo: { hasNextPage: next !== null, endCursor: next },
});

describe("loadRest", () => {
  test("a single page is returned as is, with no follow-up read", async () => {
    let calls = 0;
    const result = await loadRest(page(["a", "b"], null), async () => {
      calls += 1;
      return null;
    });
    assert.deepEqual(result.edges, [{ id: "a" }, { id: "b" }]);
    assert.equal(result.complete, true);
    assert.equal(calls, 0);
  });

  test("pages on with each endCursor until hasNextPage is false", async () => {
    const asked: string[] = [];
    const pages: Record<string, RestConnection<{ id: string }>> = {
      c1: page(["c", "d"], "c2"),
      c2: page(["e"], null),
    };
    const result = await loadRest(page(["a", "b"], "c1"), async (after) => {
      asked.push(after);
      return pages[after] ?? null;
    });
    assert.deepEqual(asked, ["c1", "c2"]);
    assert.deepEqual(
      result.edges.map((edge) => edge.id),
      ["a", "b", "c", "d", "e"],
    );
    assert.equal(result.complete, true);
  });

  test("a failed follow-up keeps the rows so far and says it was cut short", async () => {
    const result = await loadRest(page(["a"], "c1"), async () => null);
    assert.deepEqual(result.edges, [{ id: "a" }]);
    assert.equal(result.complete, false);
    // Where it stopped, so the caller can still offer "Show more".
    assert.deepEqual(result.pageInfo, { hasNextPage: true, endCursor: "c1" });
  });

  test("a cursor that does not advance stops instead of looping", async () => {
    let calls = 0;
    const result = await loadRest(page(["a"], "same"), async () => {
      calls += 1;
      return page(["b"], "same");
    });
    assert.equal(calls, 1);
    assert.equal(result.complete, false);
  });

  test("hasNextPage without a cursor is incomplete, not an endless read", async () => {
    const result = await loadRest(
      {
        edges: [{ id: "a" }],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
      async () => page(["b"], null),
    );
    assert.deepEqual(result.edges, [{ id: "a" }]);
    assert.equal(result.complete, false);
  });
});
