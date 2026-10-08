import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  askFromStatus,
  ENRICHMENT_SKELETON_CAP_MS,
  enrichmentView,
  enrichmentViewChangesIn,
} from "./enrichment-view";

describe("enrichmentView (N22, D16)", () => {
  const queued = { kind: "queued", at: 1_000 } as const;

  test("the skeleton shows for at most 8 s after the ask was queued", () => {
    assert.equal(ENRICHMENT_SKELETON_CAP_MS, 8_000);
    assert.equal(
      enrichmentView({ hasEnrichment: false, ask: queued, now: 1_000 }),
      "loading",
    );
    assert.equal(
      enrichmentView({ hasEnrichment: false, ask: queued, now: 8_999 }),
      "loading",
    );
    assert.equal(
      enrichmentView({ hasEnrichment: false, ask: queued, now: 9_000 }),
      "pending",
    );
    assert.equal(
      enrichmentView({ hasEnrichment: false, ask: queued, now: 181_000 }),
      "pending",
    );
  });

  test("an out-of-budget answer is a calm pending, never a spinner", () => {
    assert.equal(
      enrichmentView({
        hasEnrichment: false,
        ask: { kind: "budget_denied" },
        now: 0,
      }),
      "pending",
    );
  });

  test("details that arrived, or nothing asked, say nothing", () => {
    assert.equal(
      enrichmentView({ hasEnrichment: true, ask: queued, now: 1_000 }),
      "idle",
    );
    assert.equal(
      enrichmentView({ hasEnrichment: false, ask: { kind: "none" }, now: 0 }),
      "idle",
    );
  });

  test("reports when the skeleton will turn into pending", () => {
    assert.equal(
      enrichmentViewChangesIn({
        hasEnrichment: false,
        ask: queued,
        now: 3_000,
      }),
      6_000,
    );
    assert.equal(
      enrichmentViewChangesIn({
        hasEnrichment: false,
        ask: queued,
        now: 9_500,
      }),
      null,
    );
    assert.equal(
      enrichmentViewChangesIn({
        hasEnrichment: false,
        ask: { kind: "budget_denied" },
        now: 0,
      }),
      null,
    );
  });

  test("maps enrichPlace's statuses", () => {
    assert.deepEqual(askFromStatus("QUEUED", 5), { kind: "queued", at: 5 });
    assert.deepEqual(askFromStatus("BUDGET_DENIED", 5), {
      kind: "budget_denied",
    });
    assert.deepEqual(askFromStatus("FRESH", 5), { kind: "none" });
    assert.deepEqual(askFromStatus(null, 5), { kind: "none" });
  });
});
