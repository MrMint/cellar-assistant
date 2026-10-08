/**
 * N07: the rule `TierListActor` reports `insightsStatus` by. The original
 * defect was a client that showed "Generating Insights" for every list with
 * no insights; each case below is one way that was wrong.
 */
import { describe, expect, it } from "vitest";
import type { InsightsStatusInput } from "./tier-list-insights-status.ts";
import { tierListInsightsStatus } from "./tier-list-insights-status.ts";

const T = (minutes: number): Date =>
  new Date(Date.UTC(2026, 9, 7, 12, minutes));

const base: InsightsStatusInput = {
  itemCount: 5,
  minimumItems: 3,
  hasInsights: false,
  aiAvailable: true,
  requestedAt: null,
  generatedAt: null,
  failedAt: null,
  failure: null,
  retryAt: null,
  now: T(30),
};

const statusOf = (over: Partial<InsightsStatusInput>) =>
  tierListInsightsStatus({ ...base, ...over });

describe("tierListInsightsStatus (N07)", () => {
  it("never runs on a list too short to describe", () => {
    expect(statusOf({ itemCount: 2, requestedAt: T(1) }).status).toBe(
      "NOT_ENOUGH_ENTRIES",
    );
  });

  it("is UNAVAILABLE with no AI provider, never PENDING", () => {
    expect(statusOf({ aiAvailable: false, requestedAt: T(1) })).toEqual({
      status: "UNAVAILABLE",
      failureReason: null,
      retryAt: null,
    });
  });

  it("still shows earlier insights when the provider has gone", () => {
    expect(
      statusOf({ aiAvailable: false, hasInsights: true, generatedAt: T(1) })
        .status,
    ).toBe("READY");
  });

  it("is PENDING while a request is newer than the last answer", () => {
    expect(statusOf({ requestedAt: T(5) }).status).toBe("PENDING");
    expect(
      statusOf({ requestedAt: T(5), generatedAt: T(1), hasInsights: true })
        .status,
    ).toBe("PENDING");
  });

  it("reports when a throttled refresh will run, but not a time already past", () => {
    expect(
      statusOf({ requestedAt: T(5), generatedAt: T(1), retryAt: T(45) })
        .retryAt,
    ).toBe(T(45).toISOString());
    expect(
      statusOf({ requestedAt: T(5), generatedAt: T(1), retryAt: T(10) })
        .retryAt,
    ).toBeNull();
  });

  it("is READY once the answer is newer than the request", () => {
    expect(
      statusOf({ requestedAt: T(5), generatedAt: T(6), hasInsights: true }),
    ).toEqual({ status: "READY", failureReason: null, retryAt: null });
  });

  it("is FAILED with the stored reason and retry time when the latest attempt failed", () => {
    expect(
      statusOf({
        requestedAt: T(5),
        failedAt: T(6),
        failure: "BUDGET_EXCEEDED[USER_CAP]: per-user cap reached",
        retryAt: T(50),
      }),
    ).toEqual({
      status: "FAILED",
      failureReason: "USER_CAP",
      retryAt: T(50).toISOString(),
    });
  });

  it("reads a failure stored without a reason as FAILED with no reason", () => {
    const result = statusOf({
      requestedAt: T(5),
      failedAt: T(6),
      failure: "CONFLICT: ollama could not be reached",
    });
    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBeNull();
  });

  it("lets a newer change supersede a failure — that change asks again", () => {
    expect(
      statusOf({
        requestedAt: T(9),
        failedAt: T(6),
        failure: "CONFLICT[NOTHING_READ]: too few describable entries",
      }).status,
    ).toBe("PENDING");
  });

  it("lets a later success supersede a failure", () => {
    expect(
      statusOf({
        requestedAt: T(5),
        failedAt: T(6),
        generatedAt: T(8),
        hasInsights: true,
        failure: "CONFLICT: timeout",
      }).status,
    ).toBe("READY");
  });

  it("is IDLE for a list nobody has asked about yet", () => {
    expect(statusOf({}).status).toBe("IDLE");
  });
});
