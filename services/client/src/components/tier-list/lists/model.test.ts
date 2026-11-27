import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bandStrip,
  canEditList,
  fromRatingsLine,
  kindNoun,
  privacyLine,
  rankOf,
  shortDate,
} from "./model";

describe("kindNoun", () => {
  test("counts in the list's own words", () => {
    assert.equal(kindNoun("place", 113), "113 places");
    assert.equal(kindNoun("place", 1), "1 place");
    assert.equal(kindNoun("tea", 4), "4 teas");
    assert.equal(kindNoun("sake", 2), "2 sake");
    assert.equal(kindNoun("coffee", 1), "1 coffee");
    assert.equal(kindNoun("beer", 0), "0 beers");
    assert.equal(kindNoun("other", 3), "3 entries");
  });
});

describe("bandStrip", () => {
  test("five bands best first, zero bands kept as stubs", () => {
    const strip = bandStrip([5, 5, 4, 2], 4);
    assert.deepEqual(
      strip.segments.map((s) => [s.band, s.count]),
      [
        [5, 2],
        [4, 1],
        [3, 0],
        [2, 1],
        [1, 0],
      ],
    );
    assert.equal(strip.unloaded, 0);
  });

  test("a list longer than the read never invents a band for the rest", () => {
    const strip = bandStrip(new Array(100).fill(5), 113);
    assert.equal(strip.segments[0]?.count, 100);
    assert.equal(strip.unloaded, 13);
  });

  test("Unrated entries (band 0) are not drawn", () => {
    const strip = bandStrip([0, 0, 3], 3);
    assert.equal(
      strip.segments.reduce((sum, s) => sum + s.count, 0),
      1,
    );
  });
});

describe("rankOf", () => {
  const entries = [
    { id: "a", band: 4, position: 0 },
    { id: "b", band: 5, position: 1 },
    { id: "c", band: 5, position: 0 },
  ];
  test("band desc, position asc", () => {
    assert.equal(rankOf(entries, "c"), 1);
    assert.equal(rankOf(entries, "b"), 2);
    assert.equal(rankOf(entries, "a"), 3);
    assert.equal(rankOf(entries, "zz"), null);
  });
});

describe("shortDate", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  test("this year: month and day; earlier: with the year", () => {
    assert.equal(shortDate("2026-09-13T10:00:00Z", now), "Sep 13");
    assert.equal(shortDate("2025-06-15T10:00:00Z", now), "Jun 15, 2025");
    assert.equal(shortDate(null, now), null);
  });
});

describe("fromRatingsLine", () => {
  test("past the cap names the best of the whole count", () => {
    assert.equal(fromRatingsLine("beer", 165), "Best 100 of 165 beers");
    assert.equal(fromRatingsLine("wine", 12), "12 wines");
    assert.equal(fromRatingsLine("place", 1), "1 place");
  });
});

describe("privacyLine", () => {
  test("who can open the link, in the sheet's words", () => {
    assert.equal(privacyLine("PRIVATE"), "Only you can open the link");
    assert.equal(privacyLine("FRIENDS"), "Friends can open the link");
    assert.equal(privacyLine("PUBLIC"), "Anyone with the link can open it");
  });
});

describe("canEditList: only the list's maker writes to it", () => {
  test("a stranger, a signed-out viewer and an unknown owner never can", () => {
    assert.equal(canEditList("u1", "u1"), true);
    assert.equal(canEditList("u2", "u1"), false);
    assert.equal(canEditList(null, "u1"), false);
    assert.equal(canEditList(undefined, "u1"), false);
    assert.equal(canEditList("u1", null), false);
    assert.equal(canEditList("", ""), false);
  });
});
