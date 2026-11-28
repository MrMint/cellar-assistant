import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cellarSearchSummaryText } from "./CellarSearchSummary";

describe("the line above a cellar search (X04)", () => {
  test("counts bottles, not cards", () => {
    assert.deepEqual(
      cellarSearchSummaryText({
        search: "lagavulin",
        bottleCount: 3,
        meaning: "USED",
      }),
      { count: "3 bottles match “lagavulin”", note: null },
    );
    assert.equal(
      cellarSearchSummaryText({
        search: "x",
        bottleCount: 1,
        meaning: "USED",
      }).count,
      "1 bottle matches “x”",
    );
  });

  test("says when the list is names only, even when it is empty", () => {
    assert.deepEqual(
      cellarSearchSummaryText({
        search: "smoky",
        bottleCount: 0,
        meaning: "UNAVAILABLE",
      }),
      {
        count: null,
        note: "Matching names only: searching by taste isn't available right now.",
      },
    );
  });
});
