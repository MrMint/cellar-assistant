/**
 * Value semantics of the N30 star rating: half steps 0.5–5, `null` for "not
 * rated", taps that reach the half on a second tap, and keys that clamp.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatRating,
  normalizeRating,
  RATING_LABELS,
  RATING_VALUES,
  ratingForKey,
  ratingLabel,
  ratingOptionName,
  ratingSummary,
  starFractions,
  tapStar,
} from "./rating";

describe("values", () => {
  test("ten half steps from 0.5 to 5, one label each", () => {
    assert.deepEqual(RATING_VALUES, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
    assert.equal(RATING_LABELS.length, RATING_VALUES.length);
  });

  test("normalizeRating snaps to a half step and clamps; 0 is not a score", () => {
    assert.equal(normalizeRating(3.5), 3.5);
    assert.equal(normalizeRating(3.74), 3.5);
    assert.equal(normalizeRating(3.75), 4);
    assert.equal(normalizeRating(0.1), 0.5);
    assert.equal(normalizeRating(9), 5);
    assert.equal(normalizeRating(0), null);
    assert.equal(normalizeRating(-1), null);
    assert.equal(normalizeRating(Number.NaN), null);
    assert.equal(normalizeRating(null), null);
    assert.equal(normalizeRating(undefined), null);
  });

  test("labels keep the old widget's words, indexed by half step", () => {
    assert.equal(ratingLabel(0.5), "Terrible");
    assert.equal(ratingLabel(1), "Bad");
    assert.equal(ratingLabel(3.5), "Good+");
    assert.equal(ratingLabel(5), "Outstanding");
    assert.equal(ratingLabel(null), null);
  });

  test("formatting and accessible names", () => {
    assert.equal(formatRating(4), "4");
    assert.equal(formatRating(3.5), "3.5");
    assert.equal(ratingOptionName(1), "1 star, Bad");
    assert.equal(ratingOptionName(0.5), "0.5 stars, Terrible");
    assert.equal(ratingOptionName(3.5), "3.5 stars, Good+");
    assert.equal(ratingSummary(3.5), "Rated 3.5 out of 5");
    assert.equal(ratingSummary(4.25), "Rated 4.25 out of 5");
    assert.equal(ratingSummary(7), "Rated 5 out of 5");
    assert.equal(ratingSummary(null), "Not rated");
  });
});

describe("tapStar", () => {
  test("a tap sets the whole star", () => {
    assert.equal(tapStar(4, null), 4);
    assert.equal(tapStar(4, 2), 4);
    assert.equal(tapStar(2, 4), 2);
  });

  test("tapping the current star drops to its half, and back again", () => {
    assert.equal(tapStar(4, 4), 3.5);
    assert.equal(tapStar(4, 3.5), 4);
    assert.equal(tapStar(1, 1), 0.5);
    assert.equal(tapStar(1, 0.5), 1);
  });

  test("a half on a different star is not the tapped star's value", () => {
    assert.equal(tapStar(3, 3.5), 3);
    assert.equal(tapStar(5, 4.5), 5);
  });
});

describe("ratingForKey", () => {
  test("arrows step by half a star in both orientations", () => {
    assert.equal(ratingForKey("ArrowRight", 3), 3.5);
    assert.equal(ratingForKey("ArrowUp", 3), 3.5);
    assert.equal(ratingForKey("ArrowLeft", 3), 2.5);
    assert.equal(ratingForKey("ArrowDown", 3), 2.5);
  });

  test("arrows clamp at the ends instead of wrapping like native radios", () => {
    assert.equal(ratingForKey("ArrowRight", 5), 5);
    assert.equal(ratingForKey("ArrowLeft", 0.5), 0.5);
  });

  test("PageUp/PageDown move a whole star; Home/End jump to the ends", () => {
    assert.equal(ratingForKey("PageUp", 3.5), 4.5);
    assert.equal(ratingForKey("PageUp", 4.5), 5);
    assert.equal(ratingForKey("PageDown", 1), 0.5);
    assert.equal(ratingForKey("Home", 3), 0.5);
    assert.equal(ratingForKey("End", 3), 5);
  });

  test("from 'not rated', a step lands on a valid value", () => {
    assert.equal(ratingForKey("ArrowRight", null), 0.5);
    assert.equal(ratingForKey("ArrowLeft", null), 0.5);
    assert.equal(ratingForKey("PageUp", null), 1);
    assert.equal(ratingForKey("End", null), 5);
  });

  test("keys that are not the rating's are left to the browser", () => {
    for (const key of ["Tab", " ", "Enter", "Escape", "a", "1"]) {
      assert.equal(ratingForKey(key, 3), undefined, key);
    }
  });

  test("every reachable value is a valid rating", () => {
    const keys = [
      "ArrowRight",
      "ArrowLeft",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ];
    for (const from of [null, ...RATING_VALUES]) {
      for (const key of keys) {
        const next = ratingForKey(key, from);
        assert.ok(
          next !== undefined && RATING_VALUES.includes(next),
          `${key} from ${from}`,
        );
      }
    }
  });
});

describe("starFractions", () => {
  test("halves fill halves", () => {
    assert.deepEqual(starFractions(3.5), [1, 1, 1, 0.5, 0]);
    assert.deepEqual(starFractions(5), [1, 1, 1, 1, 1]);
    assert.deepEqual(starFractions(0.5), [0.5, 0, 0, 0, 0]);
  });

  test("not rated is five empty stars; averages get exact fractions", () => {
    assert.deepEqual(starFractions(null), [0, 0, 0, 0, 0]);
    assert.deepEqual(starFractions(4.25), [1, 1, 1, 1, 0.25]);
    assert.deepEqual(starFractions(12), [1, 1, 1, 1, 1]);
  });
});
