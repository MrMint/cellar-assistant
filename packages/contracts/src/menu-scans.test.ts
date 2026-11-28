/**
 * `bandOf`'s two boundaries, directly. §2.1: "AI verification in the 0.4–0.9
 * band" — inclusive at both ends, so `0.9` is auto and `0.4` is verified.
 * Changing either `>=` to `>` used to survive every suite in the repo.
 */
import { describe, expect, it } from "vitest";
import {
  bandOf,
  deriveMatchStatus,
  isMatchStatusSettled,
  MATCH_AUTO_CONFIDENCE,
  MATCH_MIN_CONFIDENCE,
  type MatchStatusFacts,
  MENU_SCAN_MATCH_STATUSES,
} from "./menu-scans.ts";

describe("bandOf", () => {
  it("is auto at exactly 0.9, and verify just below it", () => {
    expect(MATCH_AUTO_CONFIDENCE).toBe(0.9);
    expect(bandOf(0.9)).toBe("auto");
    expect(bandOf(1)).toBe("auto");
    expect(bandOf(0.8999)).toBe("verify");
  });

  it("is verify at exactly 0.4, and drop just below it", () => {
    expect(MATCH_MIN_CONFIDENCE).toBe(0.4);
    expect(bandOf(0.4)).toBe("verify");
    expect(bandOf(0.3999)).toBe("drop");
    expect(bandOf(0)).toBe("drop");
  });
});

describe("deriveMatchStatus (N06a)", () => {
  const eligible: MatchStatusFacts = {
    processingStatus: "completed",
    effectivePlaceId: "place-1",
    itemsDetected: 8,
    jobStatus: null,
    matchQueued: false,
    matchDeadLettered: false,
  };

  it("is waiting while extraction has not finished, whatever else is true", () => {
    for (const processingStatus of ["pending", "processing"] as const) {
      expect(
        deriveMatchStatus({
          ...eligible,
          processingStatus,
          jobStatus: "completed",
          matchQueued: true,
        }),
      ).toBe("waiting");
    }
  });

  it("is skipped when there is nothing to match", () => {
    expect(deriveMatchStatus({ ...eligible, processingStatus: "failed" })).toBe(
      "skipped",
    );
    expect(deriveMatchStatus({ ...eligible, effectivePlaceId: null })).toBe(
      "skipped",
    );
    expect(deriveMatchStatus({ ...eligible, itemsDetected: 0 })).toBe(
      "skipped",
    );
  });

  it("follows the job once it exists, ahead of any outbox fact", () => {
    const withJob = (jobStatus: string) =>
      deriveMatchStatus({
        ...eligible,
        jobStatus,
        matchQueued: true,
        matchDeadLettered: true,
      });
    expect(withJob("pending")).toBe("running");
    expect(withJob("running")).toBe("running");
    expect(withJob("completed")).toBe("completed");
    expect(withJob("failed")).toBe("failed");
    expect(withJob("cancelled")).toBe("failed");
  });

  it("is queued while the outbox still carries the start, failed once it is dead", () => {
    expect(deriveMatchStatus({ ...eligible, matchQueued: true })).toBe(
      "queued",
    );
    expect(deriveMatchStatus({ ...eligible, matchDeadLettered: true })).toBe(
      "failed",
    );
    // A live retry outranks an older dead row: something is still coming.
    expect(
      deriveMatchStatus({
        ...eligible,
        matchQueued: true,
        matchDeadLettered: true,
      }),
    ).toBe("queued");
  });

  it("settles an eligible scan with no trace of a run, so nobody polls forever", () => {
    expect(deriveMatchStatus(eligible)).toBe("completed");
  });

  it("calls exactly completed, failed and skipped settled", () => {
    expect(MENU_SCAN_MATCH_STATUSES.filter(isMatchStatusSettled)).toEqual([
      "completed",
      "failed",
      "skipped",
    ]);
  });
});
