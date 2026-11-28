/**
 * W-22: a tier list's insights job that did not produce anything is not an
 * error on Home. Lives beside the tier list because it is the list's
 * insights; the words themselves are `components/home/ai-jobs.ts`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type AiJob, aiJobOutcome, toastFor } from "../home/ai-jobs";

const job = (overrides: Partial<AiJob>): AiJob => ({
  __typename: "AiJob",
  id: "TIER_LIST_INSIGHTS:t1",
  kind: "TIER_LIST_INSIGHTS",
  status: "FAILED",
  subjectId: "t1",
  itemType: null,
  placeId: null,
  placeName: null,
  count: null,
  tierListName: "Wines, ranked",
  recipeId: null,
  recipeName: null,
  startedAt: "2026-10-09T12:00:00.000Z",
  finishedAt: "2026-10-09T12:01:00.000Z",
  failureCode: null,
  failureReason: null,
  retryAt: null,
  ...overrides,
});

describe("insights on Home (W-22)", () => {
  test("an unexplained insights failure is calm, with no Try again", () => {
    const outcome = aiJobOutcome(job({}));
    assert.equal(outcome.tone, "neutral");
    assert.equal(outcome.canRetry, false);
    assert.doesNotMatch(outcome.message, /try again/i);
    const toast = toastFor(job({}));
    assert.equal(toast?.tone, undefined, "not a red toast");
    assert.equal(toast?.actionLabel, "Open");
  });

  test("a list too thin to read does not talk about photos", () => {
    const outcome = aiJobOutcome(
      job({ failureCode: "CONFLICT", failureReason: "NOTHING_READ" }),
    );
    assert.doesNotMatch(outcome.message, /photo/i);
    assert.equal(outcome.tone, "neutral");
  });

  test("a limit keeps its own words", () => {
    const outcome = aiJobOutcome(
      job({ failureCode: "BUDGET_EXCEEDED", failureReason: "SERVICE_BUDGET" }),
    );
    assert.equal(outcome.kind, "service-budget");
    assert.match(outcome.message, /paused/);
  });

  test("other kinds still fail loudly", () => {
    assert.equal(aiJobOutcome(job({ kind: "MENU_SCAN" })).tone, "danger");
  });
});
