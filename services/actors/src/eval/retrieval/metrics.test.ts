import { describe, expect, it } from "vitest";
import type { MenuLineOutcome, RankedQuery } from "./metrics.ts";
import {
  hitAt,
  recallAt,
  reciprocalRank,
  regressions,
  summariseMenus,
  summariseNarrowing,
  summariseSearch,
} from "./metrics.ts";

const q = (ranked: string[], relevant: string[], id = "q"): RankedQuery => ({
  id,
  ranked,
  relevant,
});

describe("search metrics", () => {
  it("hit@k is whether any relevant key is in the top k", () => {
    const query = q(["a", "b", "c"], ["c"]);
    expect(hitAt(query, 1)).toBe(0);
    expect(hitAt(query, 2)).toBe(0);
    expect(hitAt(query, 3)).toBe(1);
  });

  it("recall@k caps the denominator at k", () => {
    const query = q(["a", "x", "b"], ["a", "b", "c"]);
    expect(recallAt(query, 1)).toBe(1);
    expect(recallAt(query, 2)).toBe(0.5);
    expect(recallAt(query, 3)).toBeCloseTo(2 / 3);
    expect(recallAt(query, 10)).toBeCloseTo(2 / 3);
  });

  it("recall@k counts a key returned twice once", () => {
    expect(recallAt(q(["a", "a"], ["a", "b"]), 2)).toBe(0.5);
  });

  it("refuses a query with nothing relevant rather than dividing by zero", () => {
    expect(() => recallAt(q(["a"], []), 3)).toThrow(/no relevant keys/);
  });

  it("reciprocal rank is 1/rank of the first relevant key, 0 when absent", () => {
    expect(reciprocalRank(q(["a"], ["a"]))).toBe(1);
    expect(reciprocalRank(q(["x", "y", "a"], ["a"]))).toBeCloseTo(1 / 3);
    expect(reciprocalRank(q(["x"], ["a"]))).toBe(0);
  });

  it("summarises means and lists the misses at 3", () => {
    const summary = summariseSearch([
      q(["a"], ["a"], "one"),
      q(["x", "y", "z", "a"], ["a"], "two"),
    ]);
    expect(summary.queries).toBe(2);
    expect(summary.hitAt1).toBe(0.5);
    expect(summary.hitAt3).toBe(0.5);
    expect(summary.hitAt10).toBe(1);
    expect(summary.mrr).toBeCloseTo((1 + 1 / 4) / 2);
    expect(summary.missesAt3).toEqual(["two"]);
  });
});

const line = (overrides: Partial<MenuLineOutcome>): MenuLineOutcome => ({
  id: "l",
  expected: "a",
  candidates: [],
  suggested: [],
  auto: false,
  ...overrides,
});

describe("menu metrics", () => {
  it("scores in-catalog and not-in-catalog lines separately", () => {
    const summary = summariseMenus([
      line({ id: "right", candidates: ["a", "b"], suggested: ["a"] }),
      line({ id: "offered", candidates: ["b", "a"], suggested: ["b"] }),
      line({ id: "missed", candidates: ["b"], suggested: [] }),
      line({ id: "auto", candidates: ["a"], suggested: ["a"], auto: true }),
      line({ id: "absent-quiet", expected: null }),
      line({
        id: "absent-loud",
        expected: null,
        candidates: ["c"],
        suggested: ["c"],
        auto: true,
      }),
    ]);
    expect(summary.lines).toBe(6);
    expect(summary.inCatalog).toBe(4);
    expect(summary.notInCatalog).toBe(2);
    expect(summary.matchRate).toBe(0.5);
    expect(summary.candidateRecall).toBe(0.75);
    expect(summary.autoSuggested).toBe(2);
    expect(summary.autoPrecision).toBe(0.5);
    expect(summary.correctRejections).toBe(0.5);
    expect(summary.falseAutoMatches).toBe(1);
    expect(summary.falseSuggestions).toBe(1);
    expect(summary.misses).toEqual(["offered", "missed"]);
  });

  it("an empty menu set scores zero, not NaN", () => {
    const summary = summariseMenus([]);
    expect(summary.matchRate).toBe(0);
    expect(summary.autoPrecision).toBe(0);
  });
});

describe("regressions against a baseline", () => {
  const search = summariseSearch([q(["a"], ["a"]), q(["x", "a"], ["a"])]);
  const menus = summariseMenus([line({ candidates: ["a"], suggested: ["a"] })]);

  it("is empty when the run matches the baseline", () => {
    expect(regressions({ search, menus }, { search, menus })).toEqual([]);
  });

  it("names each guarded metric that fell, and a rise in false auto-matches", () => {
    const worse = {
      search: { ...search, hitAt1: 0, mrr: 0.1 },
      menus: { ...menus, matchRate: 0, falseAutoMatches: 2 },
    };
    expect(regressions({ search, menus }, worse)).toEqual([
      "search.hitAt1 0.000 < baseline 0.500",
      "search.mrr 0.100 < baseline 0.750",
      "menus.matchRate 0.000 < baseline 1.000",
      "menus.falseAutoMatches 2 > baseline 0",
    ]);
  });

  it("does not flag an improvement", () => {
    const better = { search: { ...search, hitAt1: 1 }, menus };
    expect(regressions({ search, menus }, better)).toEqual([]);
  });
});

describe("narrowing (X12)", () => {
  const plain = [
    q(["a", "x", "y"], ["a"], "named"),
    q(["b", "c", "z"], ["b", "c"], "described"),
  ];

  it("counts the padding a narrowed answer dropped, and keeps recall honest", () => {
    const narrowed = [
      q(["a"], ["a"], "named"),
      q(["b", "c", "z"], ["b", "c"], "described"),
    ];
    expect(summariseNarrowing(plain, narrowed)).toEqual({
      queries: 2,
      narrowed: 1,
      recallAt10: 1,
      hitAt1: 1,
      irrelevantBefore: 3,
      irrelevantAfter: 1,
      paddingBefore: 2,
      paddingAfter: 0,
    });
  });

  it("shows a narrowing that dropped a relevant hit as lost recall", () => {
    const narrowed = [
      q(["a"], ["a"], "named"),
      q(["b"], ["b", "c"], "described"),
    ];
    expect(summariseNarrowing(plain, narrowed).recallAt10).toBe(0.75);
  });

  it("refuses a narrowed query with no plain counterpart", () => {
    expect(() => summariseNarrowing(plain, [q(["a"], ["a"], "new")])).toThrow(
      /no plain counterpart/,
    );
  });

  it("is a regression when narrowing loses recall or lets padding back", () => {
    const search = summariseSearch(plain);
    const menus = summariseMenus([]);
    const good = summariseNarrowing(plain, [
      q(["a"], ["a"], "named"),
      q(["b", "c"], ["b", "c"], "described"),
    ]);
    const bad = { ...good, recallAt10: 0.5, irrelevantAfter: 3 };
    expect(
      regressions(
        { search, menus, narrowed: good },
        { search, menus, narrowed: bad },
      ),
    ).toEqual([
      "narrowed.recallAt10 0.500 < baseline 1.000",
      "narrowed.irrelevantAfter 3 > baseline 0",
    ]);
  });
});
