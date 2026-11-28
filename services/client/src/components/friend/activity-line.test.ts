import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { friendActivityLine } from "./activity-line";

const now = Date.parse("2026-11-20T12:00:00Z");
const base = {
  occurredAt: "2026-11-20T10:00:00Z",
  rank: null,
  place: null,
  item: { name: "Demo Valley Pinot" },
};

describe("friendActivityLine (F-51)", () => {
  test("a ranking names the item and its rank, with how long ago", () => {
    assert.equal(
      friendActivityLine({ ...base, kind: "TIER_LISTED", rank: 1 }, now),
      "Ranked Demo Valley Pinot #1 · about 2 hours ago",
    );
  });
  test("a log reads Logged; no clock yet leaves the time off", () => {
    assert.equal(
      friendActivityLine({ ...base, kind: "CHECKED_IN" }, null),
      "Logged Demo Valley Pinot",
    );
  });
  test("no activity is null", () => {
    assert.equal(friendActivityLine(null, now), null);
  });
});
