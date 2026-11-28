import { describe, expect, it } from "vitest";
import { scoreNarrowed, summariseNarrowing } from "./cellar-metrics.ts";

describe("in-cellar search metrics (X04)", () => {
  it("scores what a narrowed list keeps", () => {
    expect(
      scoreNarrowed({
        id: "q",
        kind: "name",
        relevant: ["a", "b"],
        kept: ["a", "x", "y"],
      }),
    ).toEqual({ hit: true, recall: 0.5, precision: 1 / 3, f1: 0.4, extra: 2 });
  });

  it("an empty list is a miss with no precision, not a perfect one", () => {
    expect(
      scoreNarrowed({ id: "q", kind: "name", relevant: ["a"], kept: [] }),
    ).toEqual({ hit: false, recall: 0, precision: 0, f1: 0, extra: 0 });
  });

  it("averages per query and names the misses", () => {
    const summary = summariseNarrowing([
      { id: "found", kind: "name", relevant: ["a"], kept: ["a"] },
      { id: "lost", kind: "typo", relevant: ["b"], kept: [] },
    ]);
    expect(summary).toMatchObject({
      queries: 2,
      hitRate: 0.5,
      recall: 0.5,
      precision: 0.5,
      f1: 0.5,
      extra: 0,
      empty: 1,
      misses: ["lost"],
    });
  });
});
