import { describe, expect, test } from "bun:test";
import { reviewDeleteWrite, reviewRestoreWrite } from "./review-plan";

/**
 * The review's delete and its Undo (Recipes-Page reviews). Delete removes
 * the viewer's own review and nothing else; Undo writes back the review
 * that was deleted — its stars and words — not whatever the composer holds.
 */
const words = JSON.stringify({
  root: {
    children: [{ children: [{ text: "Good" }], type: "paragraph" }],
    type: "root",
  },
});
const mine = { id: "rv1", userId: "me", score: 4, text: words };

describe("reviewDeleteWrite", () => {
  test("deletes the viewer's own review by its id", () => {
    expect(reviewDeleteWrite("r1", mine, "me")).toEqual({
      recipeId: "r1",
      reviewId: "rv1",
    });
  });
  test("never someone else's review", () => {
    expect(reviewDeleteWrite("r1", { ...mine, userId: "them" }, "me")).toBe(
      null,
    );
  });
  test("nothing without a viewer or a review", () => {
    expect(reviewDeleteWrite("r1", mine, null)).toBe(null);
    expect(reviewDeleteWrite("r1", null, "me")).toBe(null);
  });
});

describe("reviewRestoreWrite", () => {
  test("Undo writes back the deleted review's stars and words", () => {
    expect(reviewRestoreWrite(mine)).toEqual({ score: 4, text: words });
  });
  test("a text-only review comes back with no stars, not zero", () => {
    expect(reviewRestoreWrite({ ...mine, score: undefined })).toEqual({
      score: undefined,
      text: words,
    });
  });
  test("an emptied editor comes back as no text", () => {
    const empty = JSON.stringify({
      root: { children: [{ children: [], type: "paragraph" }], type: "root" },
    });
    expect(reviewRestoreWrite({ ...mine, text: empty })).toEqual({
      score: 4,
      text: undefined,
    });
  });
});
