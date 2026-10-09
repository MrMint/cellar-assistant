/**
 * X16's pure parts: which section claims an entry, whose verdict picks its
 * band, how the two retrieval arms fuse per seed, and how friends' picks
 * and "like this" picks share the row. The SQL is exercised against
 * Postgres in `tier-list-actor-x16.test.ts`.
 */
import { bandForScore } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { appendedSnapshots, movedCount } from "./tier-list-history.ts";
import {
  claimSections,
  interleave,
  myScoreOf,
  pickSimilar,
  SIMILAR_MAX_DISTANCE,
} from "./tier-list-suggestions.ts";

describe("claimSections", () => {
  it("keeps an entry in the first section that has it, in order", () => {
    const rows = (...ids: string[]) => ids.map((entryId) => ({ entryId }));
    expect(
      claimSections([
        ["IN_CELLARS", rows("a", "b")],
        ["TASTED", rows("b", "c")],
        ["FRIENDS_RANKED", rows("c", "d", "a")],
      ]).map(({ section, row }) => `${section}:${row.entryId}`),
    ).toEqual(["IN_CELLARS:a", "IN_CELLARS:b", "TASTED:c", "FRIENDS_RANKED:d"]);
  });
});

describe("myScoreOf", () => {
  it("prefers the review, then a logged score, else none", () => {
    expect(myScoreOf(4, 2)).toBe(4);
    expect(myScoreOf(null, 2.5)).toBe(2.5);
    expect(myScoreOf(null, null)).toBeNull();
  });
});

describe("bandForScore (shared with the client)", () => {
  it("rounds a half star up into the band above; nothing is Unrated", () => {
    expect([5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map(bandForScore)).toEqual([
      5, 5, 4, 4, 3, 3, 2, 2, 1, 1,
    ]);
    expect(bandForScore(null)).toBe(0);
    expect(bandForScore(Number.NaN)).toBe(0);
  });
});

describe("pickSimilar", () => {
  it("fuses the arms per seed, takes two per seed round-robin, never a seed or an excluded entry", () => {
    const picks = pickSimilar(
      [
        { seedId: "s1", byVector: ["a", "b", "c"], byName: ["b", "x"] },
        { seedId: "s2", byVector: ["a", "d"], byName: [] },
        { seedId: "s3", byVector: ["s1", "e"], byName: [] },
      ],
      new Set(["s1", "s2", "s3", "c"]),
      10,
    );
    // s1: b is in both arms, so it leads; s2's best (a) was taken by s1.
    expect(picks).toEqual([
      { seedId: "s1", entryId: "b" },
      { seedId: "s2", entryId: "a" },
      { seedId: "s3", entryId: "e" },
      { seedId: "s1", entryId: "x" },
      { seedId: "s2", entryId: "d" },
    ]);
  });

  it("stops at the limit and returns nothing for no neighbours", () => {
    expect(
      pickSimilar(
        [{ seedId: "s", byVector: ["a", "b", "c"], byName: [] }],
        new Set(),
        1,
      ),
    ).toEqual([{ seedId: "s", entryId: "a" }]);
    expect(pickSimilar([], new Set(), 6)).toEqual([]);
  });

  it("holds its cutoff tight: 0.85 similar, a cosine distance of 0.3", () => {
    expect(SIMILAR_MAX_DISTANCE).toBeCloseTo(0.3, 5);
  });
});

describe("interleave", () => {
  const card = (id: string) => ({ entry: { type: "WINE" as const, id } });
  it("alternates, first list first, dropping repeats, up to the limit", () => {
    expect(
      interleave(
        [card("f1"), card("f2"), card("f3")],
        [card("s1"), card("f1")],
        4,
      ).map((row) => row.entry.id),
    ).toEqual(["f1", "s1", "f2", "f3"]);
  });
});

describe("appendedSnapshots", () => {
  it("appends each to the end of its band, counting what is there and what came before", () => {
    const entry = (id: string) => ({ type: "WINE" as const, id });
    const rows = appendedSnapshots(
      [{ band: 5 }, { band: 5 }, { band: 0 }],
      [
        { id: "a", entry: entry("w1"), band: 5, notes: null },
        { id: "b", entry: entry("w2"), band: 3, notes: null },
        { id: "c", entry: entry("w3"), band: 5, notes: "x" },
      ],
      "2026-10-09T00:00:00.000Z",
    );
    expect(rows.map((row) => [row.id, row.band, row.position])).toEqual([
      ["a", 5, 2],
      ["b", 3, 0],
      ["c", 5, 3],
    ]);
    expect(rows[2]?.notes).toBe("x");
  });
});

describe("movedCount", () => {
  it("counts entries whose band or place changed", () => {
    expect(
      movedCount(
        { "5": ["a", "b"], "0": ["c"] },
        { "5": ["b", "a", "c"], "0": [] },
      ),
    ).toBe(3);
    expect(movedCount({ "5": ["a"] }, { "5": ["a"] })).toBe(0);
  });
});
