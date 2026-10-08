/**
 * N07: the Insights tab never says "Generating" for a list that will not
 * generate. Each case is one way the old inference was wrong.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type InsightsViewInput, insightsView } from "./insights-view.ts";

const now = new Date("2026-10-07T12:00:00.000Z");
const opts = { now, locale: "en-US", timeZone: "UTC" } as const;

const view = (over: Partial<InsightsViewInput>) =>
  insightsView(
    {
      status: "PENDING",
      failureReason: null,
      retryAt: null,
      hasInsights: false,
      itemCount: 5,
      ...over,
    },
    opts,
  );

describe("insightsView", () => {
  test("PENDING with nothing yet: the skeleton, and a poll", () => {
    assert.deepEqual(view({}), {
      generating: true,
      poll: true,
      notice: null,
      hint: null,
    });
  });

  test("UNAVAILABLE: a calm notice, no skeleton, no poll, no operator text", () => {
    const result = view({ status: "UNAVAILABLE" });
    assert.equal(result.generating, false);
    assert.equal(result.poll, false);
    assert.equal(result.notice?.kind, "unavailable");
    assert.doesNotMatch(
      `${result.notice?.title} ${result.notice?.message}`,
      /AI_PROVIDER|ollama|Generating/i,
    );
  });

  test("FAILED on a spent allowance says when, and does not poll", () => {
    const result = view({
      status: "FAILED",
      failureReason: "USER_CAP",
      retryAt: "2026-10-07T15:40:00.000Z",
    });
    assert.equal(result.generating, false);
    assert.equal(result.poll, false);
    assert.equal(result.notice?.kind, "user-cap");
    assert.match(result.notice?.message ?? "", /after 3:40 PM/);
  });

  test("FAILED with no reason is a plain, non-retry failure", () => {
    const result = view({ status: "FAILED" });
    assert.equal(result.notice?.title, "Couldn't generate insights");
    assert.equal(result.notice?.canRetry, false);
  });

  test("FAILED NOTHING_READ asks for more detail on the entries", () => {
    assert.match(
      view({ status: "FAILED", failureReason: "NOTHING_READ" }).notice
        ?.message ?? "",
      /names or notes/,
    );
  });

  test("a refresh held by the daily limit keeps the old insights and says when", () => {
    const result = view({
      hasInsights: true,
      retryAt: "2026-10-08T09:00:00.000Z",
    });
    assert.equal(result.generating, false);
    assert.equal(result.poll, false);
    assert.match(result.hint ?? "", /tomorrow after 9:00 AM/);
  });

  test("a refresh far off shows no skeleton even with nothing generated yet", () => {
    const result = view({ retryAt: "2026-10-08T09:00:00.000Z" });
    assert.equal(result.generating, false);
    assert.equal(result.poll, false);
  });

  test("NOT_ENOUGH_ENTRIES and IDLE are quiet hints", () => {
    assert.match(
      view({ status: "NOT_ENOUGH_ENTRIES", itemCount: 2 }).hint ?? "",
      /at least 3/,
    );
    assert.equal(
      view({ status: "NOT_ENOUGH_ENTRIES", itemCount: 0 }).hint,
      null,
    );
    assert.match(view({ status: "IDLE" }).hint ?? "", /next change/);
  });

  test("READY is nothing but the insights", () => {
    assert.deepEqual(view({ status: "READY", hasInsights: true }), {
      generating: false,
      poll: false,
      notice: null,
      hint: null,
    });
  });

  test("an older API without a status falls back to the old inference", () => {
    assert.equal(view({ status: null }).generating, true);
    assert.equal(view({ status: null, itemCount: 2 }).generating, false);
  });
});
