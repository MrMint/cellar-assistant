import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diaryMonths, finishedLine, logLine, zonedParts } from "./diary";

describe("the Finished diary (X04)", () => {
  test("cuts dates in the page's zone", () => {
    assert.deepEqual(zonedParts("2026-11-01T03:00:00Z", "America/Chicago"), {
      year: 2026,
      month: 10,
      day: 31,
    });
    assert.equal(zonedParts("not a date", "UTC"), null);
    assert.equal(zonedParts("2026-11-01T03:00:00Z", "Not/AZone"), null);
  });

  test("heads entries by the month they were finished, in list order", () => {
    const months = diaryMonths(
      [
        { id: "a", emptyAt: "2026-10-20T12:00:00Z", openAt: null },
        { id: "b", emptyAt: "2026-10-02T12:00:00Z", openAt: null },
        { id: "c", emptyAt: "2026-09-30T12:00:00Z", openAt: null },
        { id: "d", emptyAt: null, openAt: null },
      ],
      "UTC",
    );
    assert.deepEqual(
      months.map((month) => [
        month.label,
        month.entries.map((entry) => entry.id),
      ]),
      [
        ["October 2026", ["a", "b"]],
        ["September 2026", ["c"]],
        ["No date", ["d"]],
      ],
    );
  });

  test("says when it was finished and how long it lasted open", () => {
    assert.equal(
      finishedLine(
        {
          id: "a",
          openAt: "2026-09-01T12:00:00Z",
          emptyAt: "2026-09-22T12:00:00Z",
        },
        "UTC",
      ),
      "Finished 22 Sep · lasted 3 weeks",
    );
    assert.equal(
      finishedLine(
        { id: "a", openAt: null, emptyAt: "2026-09-22T12:00:00Z" },
        "UTC",
      ),
      "Finished 22 Sep",
    );
  });

  test("your log is a count and your last score, or nothing", () => {
    assert.equal(
      logLine({ count: 3, lastScore: 4.5, lastNote: null }),
      "Your log: 3 pours · last 4.5★",
    );
    assert.equal(
      logLine({ count: 1, lastScore: null, lastNote: "x" }),
      "Your log: 1 pour",
    );
    assert.equal(logLine({ count: 0, lastScore: null, lastNote: null }), null);
    assert.equal(logLine(null), null);
  });
});
