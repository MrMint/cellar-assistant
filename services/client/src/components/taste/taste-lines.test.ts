import { describe, expect, test } from "bun:test";
import {
  agreementLine,
  agreementShown,
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
