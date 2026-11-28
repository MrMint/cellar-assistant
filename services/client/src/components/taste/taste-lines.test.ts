import { describe, expect, test } from "bun:test";
import {
  agreementCells,
  agreementCounts,
  agreementLine,
  agreementShown,
  archetypeMeter,
  ratingsLine,
  styleLabel,
  typeBarWidths,
} from "./taste-lines";

describe("agreementLine", () => {
  test("a count of one type, never a percentage", () => {
    const line = agreementLine({
      shared: 9,
      agreed: 7,
      byType: [{ itemType: "WINE", shared: 9, agreed: 7 }],
    });
    expect(line).toBe("You agree on 7 of 9 shared wines");
    expect(line).not.toContain("%");
  });

  test("items when the overlap spans types", () => {
    expect(
      agreementLine({
        shared: 6,
        agreed: 3,
        byType: [
          { itemType: "SPIRIT", shared: 4, agreed: 2 },
          { itemType: "BEER", shared: 2, agreed: 1 },
        ],
      }),
    ).toBe("You agree on 3 of 6 shared items");
  });

  test("below the gate it only says how much you share", () => {
    const counts = { shared: 2, agreed: null, byType: [] };
    expect(agreementShown(counts)).toBe(false);
    expect(agreementLine(counts)).toBe("Not enough in common yet (2 shared)");
  });
});

describe("styleLabel", () => {
  test("enum-shaped values read as words; free text passes through", () => {
    expect(styleLabel("LIGHT_ROAST")).toBe("Light roast");
    expect(styleLabel("WASHED")).toBe("Washed");
    expect(styleLabel("Nebbiolo")).toBe("Nebbiolo");
  });
});

describe("typeBarWidths", () => {
  test("the most-rated type is the full bar", () => {
    expect(
      typeBarWidths([
        { itemType: "WINE", count: 42 },
        { itemType: "SPIRIT", count: 20 },
      ]).map((t) => t.percent),
    ).toEqual([100, 48]);
  });
});

describe("agreementCounts", () => {
  test("reads the API's connection into the line's counts", () => {
    const counts = agreementCounts({
      shared: 9,
      agreed: 7,
      byType: { edges: [{ node: { itemType: "WINE", shared: 9, agreed: 7 } }] },
    });
    expect(agreementLine(counts)).toBe("You agree on 7 of 9 shared wines");
  });
});

describe("taste profile lines (Social-Recap)", () => {
  test("ratings and kinds under the archetype", () => {
    expect(ratingsLine(190, 4)).toBe("190 ratings · 4 kinds");
    expect(ratingsLine(1, 1)).toBe("1 rating · 1 kind");
    expect(ratingsLine(0, 0)).toBe("0 ratings");
  });

  test("the locked meter fills to what you have, never past it", () => {
    expect(archetypeMeter(3, 10)).toEqual({
      cells: [
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      line: "3 of 10",
    });
    expect(archetypeMeter(14, 10).line).toBe("10 of 10");
  });

  test("agreement cells: one per shared item, the agreed lit; none below the gate", () => {
    expect(agreementCells({ shared: 3, agreed: 2 })).toEqual({
      cells: [true, true, false],
      line: "2 of 3",
    });
    expect(agreementCells({ shared: 3, agreed: null })).toBeNull();
    const wide = agreementCells({ shared: 40, agreed: 20 }, 16);
    expect(wide?.cells.length).toBe(16);
    expect(wide?.line).toBe("20 of 40");
  });
});
