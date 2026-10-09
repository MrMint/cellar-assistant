import { describe, expect, it } from "vitest";
import {
  CELLAR_SEARCH_MAX_DISTANCE,
  countByMonth,
  groupInOrder,
  monthKey,
  monthsEndingAt,
  type NameScore,
  narrowCandidates,
  resolveTimeZone,
} from "./cellar-search.ts";

const candidate = (id: string, itemId = id) => ({ value: id, itemId, id });
const score = (lexical: number, whole = lexical, name = "x"): NameScore => ({
  lexical,
  whole,
  name,
});

describe("narrowCandidates (X04)", () => {
  it("keeps name matches first, then near meanings, and drops the rest", () => {
    const result = narrowCandidates(
      [candidate("far"), candidate("near"), candidate("named")],
      new Map([["named", score(0.9)]]),
      new Map([
        ["far", 0.9],
        ["near", 0.2],
        ["named", 0.25],
      ]),
      { maxDistance: 0.4, relativeSpread: 0.1 },
    );
    expect(result).toEqual([
      { value: "named", match: "NAME", distance: 0.25 },
      { value: "near", match: "MEANING", distance: 0.2 },
    ]);
  });

  it("holds meaning matches within the spread of the nearest, named or not", () => {
    const result = narrowCandidates(
      [candidate("named"), candidate("close"), candidate("behind")],
      new Map([["named", score(1)]]),
      new Map([
        ["named", 0.1],
        ["close", 0.15],
        ["behind", 0.3],
      ]),
      { maxDistance: 0.4, relativeSpread: 0.1 },
    );
    expect(result.map((hit) => hit.value)).toEqual(["named", "close"]);
  });

  it("is names alone when the phrase could not be embedded", () => {
    const result = narrowCandidates(
      [candidate("a"), candidate("b")],
      new Map([["b", score(0.6)]]),
      null,
    );
    expect(result).toEqual([{ value: "b", match: "NAME", distance: null }]);
  });

  it("returns nothing when nothing is near — a filter, not a sort", () => {
    expect(
      narrowCandidates(
        [candidate("a")],
        new Map(),
        new Map([["a", CELLAR_SEARCH_MAX_DISTANCE + 0.01]]),
      ),
    ).toEqual([]);
  });

  it("ranks names by word and whole similarity, so the exact name leads", () => {
    const result = narrowCandidates(
      [candidate("tripel"), candidate("duvel")],
      new Map([
        ["tripel", score(1, 0.4, "Duvel Tripel Hop")],
        ["duvel", score(1, 1, "Duvel")],
      ]),
      null,
    );
    expect(result.map((hit) => hit.value)).toEqual(["duvel", "tripel"]);
  });

  it("lets two bottles of one item both through", () => {
    const result = narrowCandidates(
      [candidate("b1", "item"), candidate("b2", "item")],
      new Map([["item", score(0.8)]]),
      null,
    );
    expect(result.map((hit) => hit.value)).toEqual(["b1", "b2"]);
  });
});

describe("groupInOrder (X04 ×N)", () => {
  it("folds identical items where the first of them stood", () => {
    const groups = groupInOrder(
      ["wine-a1", "beer", "wine-a2", "wine-b"],
      (value) => value.slice(0, 6),
    );
    expect(groups).toEqual([
      { lead: "wine-a1", members: ["wine-a1", "wine-a2"] },
      { lead: "beer", members: ["beer"] },
      { lead: "wine-b", members: ["wine-b"] },
    ]);
  });

  it("gives one entry per value when grouping is off", () => {
    expect(groupInOrder(["a", "a"], (value) => value, false)).toHaveLength(2);
  });
});

describe("the dashboard's calendar", () => {
  it("cuts months in the viewer's zone", () => {
    const lateOnTheLast = new Date("2026-11-01T03:30:00Z");
    expect(monthKey(lateOnTheLast, "UTC")).toBe("2026-11");
    expect(monthKey(lateOnTheLast, "America/Chicago")).toBe("2026-10");
  });

  it("lists the twelve months ending now, across a new year", () => {
    expect(monthsEndingAt("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("counts instants per month and ignores the rest", () => {
    expect(
      countByMonth(
        [
          new Date("2026-09-03T12:00:00Z"),
          new Date("2026-10-01T12:00:00Z"),
          new Date("2026-10-20T12:00:00Z"),
          new Date("2025-01-01T12:00:00Z"),
        ],
        ["2026-09", "2026-10"],
        "UTC",
      ),
    ).toEqual([1, 2]);
  });

  it("falls back to UTC for a zone it does not know", () => {
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
});
