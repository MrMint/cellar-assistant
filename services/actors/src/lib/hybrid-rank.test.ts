import { describe, expect, it } from "vitest";
import { RRF_K, reciprocalRankFusion, tiedRanks } from "./hybrid-rank.ts";

const keys = (fused: readonly { key: string }[]) => fused.map((f) => f.key);
const id = (item: string) => item;

describe("reciprocalRankFusion (N08)", () => {
  it("scores each list's item weight / (k + rank) and sums across lists", () => {
    const fused = reciprocalRankFusion(
      [{ items: ["a", "b"] }, { items: ["b"] }],
      id,
    );
    expect(keys(fused)).toEqual(["b", "a"]);
    const b = fused[0];
    expect(b?.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1));
    expect(b?.ranks).toEqual([2, 1]);
    expect(fused[1]?.ranks).toEqual([1, null]);
  });

  /**
   * The case it exists for: the vector list's nearest item is not the one
   * named, the named one is second there and first by name, and agreement
   * wins.
   */
  it("lets agreement between lists beat a single list's first place", () => {
    const vector = ["near-but-wrong", "named", "other"];
    const lexical = ["named"];
    expect(
      keys(reciprocalRankFusion([{ items: vector }, { items: lexical }], id)),
    ).toEqual(["named", "near-but-wrong", "other"]);
  });

  it("keeps the first list's order when the second list is empty", () => {
    expect(
      keys(
        reciprocalRankFusion([{ items: ["x", "y", "z"] }, { items: [] }], id),
      ),
    ).toEqual(["x", "y", "z"]);
  });

  it("counts an item listed twice in one list once, at its first rank", () => {
    const [only] = reciprocalRankFusion([{ items: ["a", "a"] }], id);
    expect(only?.score).toBeCloseTo(1 / (RRF_K + 1));
  });

  it("weights a list's contribution", () => {
    const fused = reciprocalRankFusion(
      [{ items: ["a"] }, { items: ["b"], weight: 2 }],
      id,
    );
    expect(keys(fused)).toEqual(["b", "a"]);
  });

  it("carries each list's entry for the caller to merge", () => {
    type Hit = { id: string; from: string };
    const [first] = reciprocalRankFusion<Hit>(
      [
        { items: [{ id: "a", from: "vector" }] },
        { items: [{ id: "a", from: "lexical" }] },
      ],
      (hit) => hit.id,
    );
    expect(first?.entries.map((e) => e?.from)).toEqual(["vector", "lexical"]);
  });

  it("refuses a negative or non-finite k", () => {
    expect(() => reciprocalRankFusion([], id, -1)).toThrow(/non-negative/);
    expect(() => reciprocalRankFusion([], id, Number.NaN)).toThrow();
  });
});

describe("tiedRanks", () => {
  it("gives scores within the tolerance of their group's best the same rank", () => {
    expect(tiedRanks([1, 0.99, 0.9, 0.89, 0.5], 0.05)).toEqual([1, 1, 3, 3, 5]);
  });

  it("measures the tolerance from the group's best, so a chain does not creep", () => {
    expect(tiedRanks([1, 0.97, 0.94, 0.91], 0.05)).toEqual([1, 1, 3, 3]);
  });

  it("is the position when nothing is close", () => {
    expect(tiedRanks([0.9, 0.5, 0.1], 0.05)).toEqual([1, 2, 3]);
    expect(tiedRanks([], 0.05)).toEqual([]);
  });

  it("lets the other list decide between tied items", () => {
    const fused = reciprocalRankFusion(
      [
        { items: ["standard", "sibling"] },
        { items: ["sibling", "standard"], ranks: [1, 1] },
      ],
      id,
    );
    expect(keys(fused)).toEqual(["standard", "sibling"]);
  });
});
