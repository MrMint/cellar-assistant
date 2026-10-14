import { describe, expect, it } from "vitest";
import {
  type ActivityKind,
  activityFeedCursor,
  compareFeedEntries,
  isAfterFeedCursor,
  parseActivityFeedCursor,
} from "./collections.ts";
import { ValidationError } from "./errors.ts";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const e = (occurredAt: string, kind: ActivityKind, id: string) => ({
  occurredAt,
  kind,
  id,
});

describe("friends feed cursor (X10)", () => {
  it("round-trips an entry's place in the feed", () => {
    const cursor = activityFeedCursor(
      e("2026-10-05T12:00:00.123Z", "CHECKED_IN", ID_A),
    );
    expect(cursor).toBe(`feed:2026-10-05T12:00:00.123Z|CHECKED_IN|${ID_A}`);
    expect(parseActivityFeedCursor(cursor)).toEqual({
      at: "2026-10-05T12:00:00.123Z",
      kind: "CHECKED_IN",
      id: ID_A,
    });
  });

  it("refuses a cursor it did not mint", () => {
    for (const bad of [
      "offset:3",
      "feed:",
      `feed:2026-10-05T12:00:00Z|REVIEWED|${ID_A}`,
      `feed:2026-10-05T12:00:00.000Z|SHARED|${ID_A}`,
      "feed:2026-10-05T12:00:00.000Z|REVIEWED|not-a-uuid",
      `feed:2026-10-05T12:00:00.000Z|REVIEWED|${ID_A}|extra`,
    ]) {
      expect(() => parseActivityFeedCursor(bad), bad).toThrow(ValidationError);
    }
  });

  it("orders newest first, then kind A→Z, then id Z→A — and 'after' agrees with it", () => {
    const entries = [
      e("2026-10-05T12:00:00.000Z", "REVIEWED", ID_A),
      e("2026-10-05T13:00:00.000Z", "ADDED", ID_A),
      e("2026-10-05T12:00:00.000Z", "ADDED", ID_A),
      e("2026-10-05T12:00:00.000Z", "ADDED", ID_B),
    ];
    const sorted = [...entries].sort(compareFeedEntries);
    expect(sorted).toEqual([entries[1], entries[3], entries[2], entries[0]]);
    for (const [index, entry] of sorted.entries()) {
      const cursor = parseActivityFeedCursor(activityFeedCursor(entry));
      const after = sorted.filter((other) => isAfterFeedCursor(other, cursor));
      expect(after).toEqual(sorted.slice(index + 1));
    }
  });
});
