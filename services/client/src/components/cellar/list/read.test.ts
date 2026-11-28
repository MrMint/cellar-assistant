/**
 * F-4: a tile's style is words, never the stored enum.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { listBottleFromNode } from "./read";

const node = (beerStyle: string) =>
  ({
    count: 1,
    openCount: 0,
    match: null,
    lead: {
      id: "b1",
      item: {
        id: "i1",
        type: "BEER",
        name: "Hazy Afternoon",
        beerStyle,
        myReview: null,
      },
    },
  }) as never;

describe("listBottleFromNode", () => {
  test("style reads as words (F-4)", () => {
    assert.equal(listBottleFromNode("c1", node("PALE_ALE")).style, "Pale ale");
    assert.equal(
      listBottleFromNode("c1", node("INDIA_PALE_ALE")).style,
      "India pale ale",
    );
  });
});
