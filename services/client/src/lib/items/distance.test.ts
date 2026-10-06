import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDistance } from "./distance.ts";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe("formatDistance (date-fns wording)", () => {
  const cases: [number, string][] = [
    [10_000, "less than a minute"],
    [MIN, "1 minute"],
    [5 * MIN, "5 minutes"],
    [60 * MIN, "about 1 hour"],
    [5 * 60 * MIN, "about 5 hours"],
    [30 * 60 * MIN, "1 day"],
    [3 * 1440 * MIN, "3 days"],
    [40 * 1440 * MIN, "about 1 month"],
    [100 * 1440 * MIN, "3 months"],
    [400 * 1440 * MIN, "about 1 year"],
    [600 * 1440 * MIN, "over 1 year"],
    [700 * 1440 * MIN, "almost 2 years"],
  ];
  for (const [ms, expected] of cases) {
    test(`${ms} ms → ${expected}`, () => {
      assert.equal(formatDistance(ago(ms), NOW), expected);
    });
  }

  test("a bad instant is blank, not NaN", () => {
    assert.equal(formatDistance("not a date", NOW), "");
  });
});
