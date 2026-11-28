import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isReviewStatus,
  isUnshared,
  REVIEW_POLL_LIMIT_MS,
  reviewBadge,
  reviewExplanation,
  reviewPinLabel,
  reviewVerdictNotice,
  shouldPollReview,
  visibleSuggestions,
} from "./place-review";

describe("review status (X27 / D28)", () => {
  test("only the two creator-only states are unshared", () => {
    assert.equal(isUnshared("PENDING"), true);
    assert.equal(isUnshared("REJECTED"), true);
    assert.equal(isUnshared("APPROVED"), false);
    assert.equal(isUnshared(null), false);
    assert.equal(isUnshared(undefined), false);
  });

  test("isReviewStatus is the three enum values and nothing else", () => {
    for (const value of ["PENDING", "APPROVED", "REJECTED"]) {
      assert.equal(isReviewStatus(value), true);
    }
    for (const value of ["pending", "", null, undefined, 1]) {
      assert.equal(isReviewStatus(value), false);
    }
  });

  test("a shared place carries no badge and no pin label", () => {
    assert.equal(reviewBadge("APPROVED"), null);
    assert.equal(reviewBadge(null), null);
    assert.equal(reviewPinLabel("APPROVED"), null);
  });

  test("pending and rejected say so in words, and say who can see them", () => {
    const pending = reviewBadge("PENDING");
    assert.equal(pending?.label, "Under review");
    assert.equal(pending?.tone, "pending");
    assert.match(pending?.description ?? "", /only you/i);
    const rejected = reviewBadge("REJECTED");
    assert.equal(rejected?.label, "Not approved");
    assert.equal(rejected?.tone, "rejected");
    assert.match(rejected?.description ?? "", /only you/i);
    assert.equal(reviewPinLabel("PENDING"), "Under review");
  });

  test("a rejection explains itself with the reviewer's reason, or a plain fallback", () => {
    assert.match(
      reviewExplanation("REJECTED", "Looks like a private residence."),
      /^Looks like a private residence\. Only you can see it\./,
    );
    assert.match(
      reviewExplanation("REJECTED", "   "),
      /^This place couldn't be confirmed/,
    );
    assert.match(reviewExplanation("PENDING", null), /Only you can see it/);
  });
});

describe("waiting for the verdict", () => {
  test("polls a pending place, for a bounded time, and nothing else", () => {
    assert.equal(shouldPollReview("PENDING", 0, 1_000), true);
    assert.equal(
      shouldPollReview("PENDING", 0, REVIEW_POLL_LIMIT_MS + 1),
      false,
    );
    assert.equal(shouldPollReview("APPROVED", 0, 1_000), false);
    assert.equal(shouldPollReview("REJECTED", 0, 1_000), false);
  });

  test("announces only a verdict landing on a place that was pending", () => {
    assert.deepEqual(reviewVerdictNotice("PENDING", "APPROVED"), {
      message: "Approved — it's on the map for everyone",
      tone: "success",
    });
    assert.equal(reviewVerdictNotice("PENDING", "REJECTED")?.tone, "error");
    assert.equal(reviewVerdictNotice("PENDING", "PENDING"), null);
    assert.equal(reviewVerdictNotice(undefined, "APPROVED"), null);
    assert.equal(reviewVerdictNotice("REJECTED", "APPROVED"), null);
  });
});

describe("also tagged as …", () => {
  test("drops what the place has, what was just taken, and repeats", () => {
    assert.deepEqual(
      visibleSuggestions(
        ["cocktail_bar", "wine_bar", "restaurant", "cocktail_bar", "pub"],
        ["wine_bar"],
        new Set(["pub"]),
      ),
      ["cocktail_bar", "restaurant"],
    );
    assert.deepEqual(visibleSuggestions([], ["bar"], new Set()), []);
  });
});
