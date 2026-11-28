/**
 * N07: the rule `TierListActor` reports `insightsStatus` by. The original
 * defect was a client that showed "Generating Insights" for every list with
 * no insights; each case below is one way that was wrong.
 */
import { describe, expect, it } from "vitest";
import type { InsightsStatusInput } from "./tier-list-insights-status.ts";
import {
  INSIGHTS_PENDING_STALE_MS,
  tierListInsightsStatus,
} from "./tier-list-insights-status.ts";

const T = (minutes: number): Date =>
  new Date(Date.UTC(2026, 9, 7, 12, minutes));

const DAY_MS = 24 * 60 * 60_000;

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
  throttleMs: DAY_MS,
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
    const yesterday = new Date(T(1).getTime() - DAY_MS);
    expect(
      statusOf({ requestedAt: T(5), generatedAt: yesterday, retryAt: T(45) })
        .retryAt,
    ).toBe(T(45).toISOString());
    expect(
      statusOf({ requestedAt: T(25), generatedAt: yesterday, retryAt: T(10) })
        .retryAt,
    ).toBeNull();
  });

  it("knows a change inside the throttle waits for it, before any delivery deferred it", () => {
    // Insights generated at T(1); a change at T(20) with no `retryAt` yet:
    // the next run is a day after T(1), not "on the way".
    const result = statusOf({
      requestedAt: T(20),
      generatedAt: T(1),
      hasInsights: true,
    });
    expect(result).toEqual({
      status: "PENDING",
      failureReason: null,
      retryAt: new Date(T(1).getTime() + DAY_MS).toISOString(),
    });
  });

  it("stops reading PENDING once a request is long past due — a delivery that died outside the generator", () => {
    const requestedAt = T(0);
    const justInside = new Date(
      requestedAt.getTime() + INSIGHTS_PENDING_STALE_MS,
    );
    const past = new Date(justInside.getTime() + 60_000);
    expect(statusOf({ requestedAt, now: justInside }).status).toBe("PENDING");
    expect(statusOf({ requestedAt, now: past })).toEqual({
      status: "FAILED",
      failureReason: null,
      retryAt: null,
    });
  });

  it("measures staleness from when a throttled refresh was due, not from the change", () => {
    const generatedAt = T(0);
    const due = new Date(generatedAt.getTime() + DAY_MS);
    // A change an hour after generation is not stale 23 hours later: it is
    // waiting for the throttle, and says when.
    expect(
      statusOf({
        requestedAt: T(60),
        generatedAt,
        hasInsights: true,
        now: new Date(due.getTime() - 60_000),
      }).status,
    ).toBe("PENDING");
    expect(
      statusOf({
        requestedAt: T(60),
        generatedAt,
        hasInsights: true,
        now: new Date(due.getTime() + INSIGHTS_PENDING_STALE_MS + 60_000),
      }).status,
    ).toBe("FAILED");
  });

  it("goes back to PENDING when a change arrives after a stale request", () => {
    const now = new Date(T(0).getTime() + 2 * INSIGHTS_PENDING_STALE_MS);
    expect(
      statusOf({ requestedAt: new Date(now.getTime() - 60_000), now }).status,
    ).toBe("PENDING");
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
