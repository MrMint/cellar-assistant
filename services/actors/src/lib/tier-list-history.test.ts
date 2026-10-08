/**
 * D4 — the edit history's pure half: the replay that says where Undo and Redo
 * stand, the snapshot parser, and the band planner every Undo/Redo writes
 * through. `tier-list-actor.test.ts` covers the same against Postgres.
 */
import { describe, expect, it } from "vitest";
import {
  historyStacks,
  insertAt,
  movedEntry,
  parseChange,
  planBandOrders,
} from "./tier-list-history.ts";

const edit = (seq: number, kind = "ADD") => ({ seq, kind, targetSeq: null });
const undo = (seq: number, targetSeq: number) => ({
  seq,
  kind: "UNDO",
  targetSeq,
});
const redo = (seq: number, targetSeq: number) => ({
  seq,
  kind: "REDO",
  targetSeq,
});

describe("historyStacks", () => {
  it("is empty for an empty log", () => {
    expect(historyStacks([])).toEqual({
      undo: [],
      redo: [],
      lastSeq: 0,
      editCount: 0,
    });
  });

  it("stacks edits, moves undone ones to redo and back", () => {
    const rows = [edit(1), edit(2, "MOVE"), edit(3, "REMOVE"), undo(4, 3)];
    expect(historyStacks(rows)).toMatchObject({
      undo: [1, 2],
      redo: [3],
      lastSeq: 4,
      editCount: 3,
    });
    expect(historyStacks([...rows, undo(5, 2), redo(6, 2)])).toMatchObject({
      undo: [1, 2],
      redo: [3],
      lastSeq: 6,
    });
  });

  it("a new edit after an undo clears redo", () => {
    const rows = [edit(1), edit(2), undo(3, 2), edit(4)];
    expect(historyStacks(rows)).toMatchObject({
      undo: [1, 4],
      redo: [],
      editCount: 3,
    });
  });

  it("reads rows in seq order whatever order they arrive in", () => {
    const rows = [undo(3, 2), edit(1), edit(2)];
    expect(historyStacks(rows)).toMatchObject({ undo: [1], redo: [2] });
  });

  it("ignores an UNDO or REDO that does not name the top of its stack", () => {
    const rows = [edit(1), edit(2), undo(3, 1), redo(4, 2)];
    expect(historyStacks(rows)).toMatchObject({
      undo: [1, 2],
      redo: [],
      lastSeq: 4,
    });
  });
});

describe("parseChange", () => {
  const row = {
    id: "r1",
    entry: { type: "WINE", id: "w1" },
    band: 3,
    position: 1,
    notes: null,
    createdAt: "2026-10-08T00:00:00.000Z",
  };

  it("reads ADD and REMOVE snapshots", () => {
    expect(parseChange("ADD", { kind: "ADD", row })).toEqual({
      kind: "ADD",
      row,
    });
    expect(parseChange("REMOVE", { row })).toMatchObject({ kind: "REMOVE" });
  });

  it("reads a MOVE with and without a subject", () => {
    const move = {
      before: { "0": ["a", "b"] },
      after: { "5": ["a"], "0": ["b"] },
      subject: {
        id: "a",
        entry: { type: "PLACE", id: "p" },
        fromBand: 0,
        toBand: 5,
      },
    };
    expect(parseChange("MOVE", move)).toMatchObject({
      kind: "MOVE",
      subject: { id: "a", fromBand: 0, toBand: 5 },
    });
    expect(parseChange("MOVE", { ...move, subject: null })).toMatchObject({
      subject: null,
    });
  });

  it("refuses what it cannot apply", () => {
    expect(parseChange("UNDO", {})).toBeNull();
    expect(parseChange("ADD", { row: { ...row, band: 9 } })).toBeNull();
    expect(
      parseChange("ADD", { row: { ...row, entry: { type: "CAR", id: "x" } } }),
    ).toBeNull();
    expect(parseChange("MOVE", { before: { "7": ["a"] }, after: {} })).toBe(
      null,
    );
    expect(parseChange("MOVE", null)).toBeNull();
  });
});

describe("planBandOrders", () => {
  const rows = [
    { id: "a", band: 5, position: 0 },
    { id: "b", band: 5, position: 1 },
    { id: "c", band: 0, position: 0 },
    { id: "d", band: 0, position: 1 },
  ];

  it("restores a cross-band move: both bands, complete", () => {
    // `c` was moved up to Outstanding; undo puts the old orders back.
    const now = [
      { id: "a", band: 5, position: 0 },
      { id: "c", band: 5, position: 1 },
      { id: "b", band: 5, position: 2 },
      { id: "d", band: 0, position: 0 },
    ];
    const plan = planBandOrders(now, { "5": ["a", "b"], "0": ["c", "d"] });
    expect(Object.fromEntries(plan)).toEqual({
      5: ["a", "b"],
      0: ["c", "d"],
    });
  });

  it("returns only the bands that change", () => {
    const plan = planBandOrders(rows, { "5": ["b", "a"], "0": ["c", "d"] });
    expect(Object.fromEntries(plan)).toEqual({ 5: ["b", "a"] });
  });

  it("drops ids that are gone and keeps members the wish did not name", () => {
    const plan = planBandOrders(rows, { "5": ["gone", "b"] });
    expect(Object.fromEntries(plan)).toEqual({ 5: ["b", "a"] });
  });

  it("renumbers the band an id is pulled out of, even when not named", () => {
    const plan = planBandOrders(rows, { "4": ["c"] });
    expect(Object.fromEntries(plan)).toEqual({ 4: ["c"], 0: ["d"] });
  });

  it("puts an id named twice in the higher band", () => {
    const plan = planBandOrders(rows, { "3": ["d"], "4": ["d"] });
    expect(Object.fromEntries(plan)).toEqual({ 4: ["d"], 0: ["c"] });
  });

  it("is empty when the list already looks like the wish", () => {
    expect(planBandOrders(rows, { "5": ["a", "b"] }).size).toBe(0);
  });
});

describe("insertAt", () => {
  it("places, clamps, and never duplicates", () => {
    expect(insertAt(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
    expect(insertAt(["a", "b"], "x", 99)).toEqual(["a", "b", "x"]);
    expect(insertAt(["a", "b"], "x", -3)).toEqual(["x", "a", "b"]);
    expect(insertAt(["a", "x", "b"], "x", 0)).toEqual(["x", "a", "b"]);
  });
});

describe("movedEntry", () => {
  it("names the one entry that changed band", () => {
    expect(
      movedEntry(
        { "0": ["c", "d"], "5": ["a"] },
        { "0": ["d"], "5": ["a", "c"] },
      ),
    ).toEqual({ id: "c", fromBand: 0, toBand: 5 });
  });

  it("names the dragged entry within one band", () => {
    expect(
      movedEntry({ "3": ["a", "b", "c", "d"] }, { "3": ["b", "c", "d", "a"] }),
    ).toEqual({
      id: "a",
      fromBand: 3,
      toBand: 3,
    });
    expect(
      movedEntry({ "3": ["a", "b", "c", "d"] }, { "3": ["d", "a", "b", "c"] }),
    ).toEqual({
      id: "d",
      fromBand: 3,
      toBand: 3,
    });
  });

  it("takes the one that moved up on a swap of neighbours", () => {
    expect(movedEntry({ "3": ["a", "b"] }, { "3": ["b", "a"] })).toMatchObject({
      id: "b",
    });
  });

  it("is null when several entries moved", () => {
    expect(
      movedEntry({ "3": ["a", "b", "c"] }, { "3": ["c", "b", "a"] }),
    ).toBeNull();
    expect(
      movedEntry({ "0": ["a", "b"], "5": [] }, { "0": [], "5": ["a", "b"] }),
    ).toBeNull();
  });
});
