/**
 * The cellar list's rules (C1): arrangements, groups with "Others", the
 * count strip within a search, jump letters and shelves.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  arrange,
  bottlesLabel,
  filterBottles,
  type ListBottle,
  letterOf,
  lettersOf,
  needsDetailsLabel,
  noMatchTitle,
  OTHERS,
  openBadge,
  parseArrangement,
  parseListFilter,
  shelvesOf,
  sortBottles,
  stripCounts,
} from "./model";

let n = 0;
const bottle = (over: Partial<ListBottle>): ListBottle => {
  n += 1;
  return {
    key: `b${n}`,
    itemId: `i${n}`,
    type: "BEER",
    name: `Bottle ${n}`,
    maker: null,
    style: null,
    photoUrl: null,
    plate: null,
    rating: null,
    publicScore: null,
    publicCount: null,
    favorite: false,
    open: false,
    percent: 100,
    count: 1,
    match: null,
    note: null,
    noteDate: null,
    addedAt: null,
    href: `/cellars/c/beers/b${n}`,
    ...over,
  };
};

describe("arrangements", () => {
  test("A–Z is the default; old sort values land somewhere sensible", () => {
    assert.equal(parseArrangement(undefined), "a-z");
    assert.equal(parseArrangement("nonsense"), "a-z");
    assert.equal(parseArrangement("recent"), "newest");
    assert.equal(parseArrangement("almost-empty"), "least-left");
    assert.equal(parseArrangement("maker"), "maker");
  });

  test("A–Z sorts by name, numbers in number order, accents ignored", () => {
    const list = [
      bottle({ name: "Zinfandel" }),
      bottle({ name: "10 Barrel" }),
      bottle({ name: "2 Towns" }),
      bottle({ name: "Àbbaye" }),
    ];
    assert.deepEqual(
      sortBottles(list, "a-z").map((b) => b.name),
      ["2 Towns", "10 Barrel", "Àbbaye", "Zinfandel"],
    );
  });

  test("my rating best first, unrated last; not rated yet first", () => {
    const a = bottle({ name: "A", rating: 3 });
    const b = bottle({ name: "B", rating: null });
    const c = bottle({ name: "C", rating: 5 });
    assert.deepEqual(
      sortBottles([a, b, c], "rating").map((x) => x.name),
      ["C", "A", "B"],
    );
    assert.deepEqual(
      sortBottles([a, b, c], "unrated").map((x) => x.name),
      ["B", "A", "C"],
    );
  });

  test("by maker: groups A to Z, a group of one joins Others at the end", () => {
    const list = [
      bottle({ name: "Dance Math", maker: "Young Blood", rating: 5 }),
      bottle({ name: "Bathtub", maker: "young blood", rating: 3 }),
      bottle({ name: "Lone", maker: "Allagash" }),
      bottle({ name: "Nameless", maker: null }),
      bottle({ name: "Apple", maker: "Bells" }),
      bottle({ name: "Two Hearted", maker: "Bells" }),
    ];
    const sections = arrange(list, "maker");
    assert.deepEqual(
      sections.map((s) => [s.title, s.bottles.map((b) => b.name)]),
      [
        ["Bells", ["Apple", "Two Hearted"]],
        ["Young Blood", ["Bathtub", "Dance Math"]],
        [OTHERS, ["Lone", "Nameless"]],
      ],
    );
    assert.equal(sections[1]?.average, 4);
    assert.equal(sections[0]?.average, null);
  });

  test("a sort is one untitled section; an empty list has none", () => {
    const sections = arrange([bottle({}), bottle({})], "newest");
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.title, undefined);
    assert.deepEqual(arrange([], "a-z"), []);
  });
});

describe("filters and the count strip", () => {
  test("Open and a kind are one choice; ?open=1 wins", () => {
    assert.equal(parseListFilter(["WINE"], "1"), "OPEN");
    assert.equal(parseListFilter(["NOPE", "WINE"], null), "WINE");
    assert.equal(parseListFilter([], null), null);
  });

  test("counts are bottles within what is shown, in the owner's kind order", () => {
    const list = [
      bottle({ type: "WINE", count: 2, open: true }),
      bottle({ type: "BEER" }),
      bottle({ type: "TEA" }),
    ];
    const strip = stripCounts(list);
    assert.equal(strip.open.count, 1);
    assert.deepEqual(
      strip.kinds.map((k) => [k.label, k.count]),
      [
        ["Beer", 1],
        ["Wine", 2],
        ["Spirit", 0],
        ["Coffee", 0],
        ["Tea", 1],
        ["Sake", 0],
      ],
    );
    assert.equal(filterBottles(list, "OPEN").length, 1);
    assert.equal(filterBottles(list, "TEA").length, 1);
    assert.equal(filterBottles(list, null).length, 3);
  });
});

describe("jump to a letter", () => {
  test("accents fold, digits and symbols are #, # comes first", () => {
    assert.equal(letterOf("Àbbaye"), "A");
    assert.equal(letterOf("60th Anniversary"), "#");
    const letters = lettersOf([
      bottle({ name: "Coffee" }),
      bottle({ name: "30th" }),
      bottle({ name: "cider" }),
      bottle({ name: "Ale" }),
    ]);
    assert.deepEqual(
      letters.map((l) => [l.letter, l.count]),
      [
        ["#", 1],
        ["A", 1],
        ["C", 2],
      ],
    );
  });
});

describe("shelves", () => {
  test("open, best, not rated, newest; an empty shelf is left out", () => {
    const list = [
      bottle({ name: "Open one", open: true, percent: 16, rating: 3 }),
      bottle({ name: "Good", rating: 4.5, addedAt: "2026-01-02T00:00:00Z" }),
      bottle({ name: "Meh", rating: 2, addedAt: "2026-01-01T00:00:00Z" }),
    ];
    const shelves = shelvesOf(list);
    assert.deepEqual(
      shelves.map((s) => [s.title, s.count]),
      [
        ["Open now", 1],
        ["Your best", 1],
        ["Newest", 3],
      ],
    );
    assert.deepEqual(shelves[0]?.seeAll, {
      arrangement: "least-left",
      filter: "OPEN",
    });
  });
});

describe("words", () => {
  test("counts, badge, needs details, no match", () => {
    assert.equal(bottlesLabel(240), "240 bottles");
    assert.equal(bottlesLabel(1), "1 bottle");
    assert.equal(bottlesLabel(0), "Empty");
    assert.equal(bottlesLabel(2000, true), "2,000+ bottles");
    assert.equal(
      openBadge(bottle({ open: true, percent: 16.4 })),
      "Open · 16%",
    );
    assert.equal(openBadge(bottle({})), null);
    assert.equal(needsDetailsLabel(1), "1 needs details");
    assert.equal(needsDetailsLabel(3), "3 need details");
    assert.equal(noMatchTitle(" ipa "), "No bottle matches “ipa”");
  });
});
