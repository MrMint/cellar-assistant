import { describe, expect, it } from "vitest";
import {
  addMonths,
  type BottleDates,
  drinkWindow,
  lookupShelfLife,
  SHELF_LIFE,
  type ShelfLifeEntry,
} from "./shelf-life.ts";

const bottle = (over: Partial<BottleDates> = {}): BottleDates => ({
  packagedOn: null,
  acquiredOn: null,
  openedAt: null,
  vintageYear: null,
  drinkFrom: null,
  drinkUntil: null,
  ...over,
});

const entry = (over: Partial<ShelfLifeEntry> = {}): ShelfLifeEntry => ({
  type: "BEER",
  match: { style: null },
  fromMonths: 0,
  untilMonths: 4,
  basis: "packaged",
  ...over,
});

describe("SHELF_LIFE", () => {
  it("ships empty in seams, so every lookup is null", () => {
    expect(SHELF_LIFE).toEqual([]);
    expect(lookupShelfLife("WINE", { style: "RED" }, "vintage")).toBeNull();
  });
});

describe("lookupShelfLife", () => {
  const table: ShelfLifeEntry[] = [
    entry({ type: "TEA", match: { style: null }, basis: "acquired" }),
    entry({
      type: "TEA",
      match: { style: "green" },
      basis: "acquired",
      untilMonths: 12,
    }),
    entry({
      type: "TEA",
      match: { style: null, form: "matcha_powder" },
      basis: "acquired",
      untilMonths: 2,
    }),
    entry({ type: "WINE", match: { style: "RED" }, basis: "vintage" }),
  ];

  it("prefers a form match over a style match over a type-wide row", () => {
    expect(
      lookupShelfLife(
        "TEA",
        { style: "green", form: "matcha_powder" },
        "acquired",
        table,
      )?.untilMonths,
    ).toBe(2);
    expect(
      lookupShelfLife("TEA", { style: "green" }, "acquired", table)
        ?.untilMonths,
    ).toBe(12);
    expect(
      lookupShelfLife("TEA", { style: "black" }, "acquired", table)
        ?.untilMonths,
    ).toBe(4);
  });

  it("is null for another basis, type or an unnamed style", () => {
    expect(
      lookupShelfLife("TEA", { style: "green" }, "opened", table),
    ).toBeNull();
    expect(
      lookupShelfLife("WINE", { style: "WHITE" }, "vintage", table),
    ).toBeNull();
    expect(
      lookupShelfLife("BEER", { style: null }, "packaged", table),
    ).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2024-11-15", 3)).toBe("2025-02-15");
    expect(addMonths("2024-03-10", 0)).toBe("2024-03-10");
  });

  it("is null for a date it cannot read", () => {
    expect(addMonths("soon", 1)).toBeNull();
  });
});

describe("drinkWindow", () => {
  it("is null when neither the person nor the table gives a date", () => {
    expect(drinkWindow(bottle(), null)).toBeNull();
    expect(drinkWindow(bottle(), entry())).toBeNull();
  });

  it("counts the typical window from the entry's basis", () => {
    expect(drinkWindow(bottle({ packagedOn: "2026-01-15" }), entry())).toEqual({
      from: "2026-01-15",
      fromSource: "typical",
      until: "2026-05-15",
      untilSource: "typical",
    });
    expect(
      drinkWindow(
        bottle({ vintageYear: 2018 }),
        entry({
          type: "WINE",
          basis: "vintage",
          fromMonths: 36,
          untilMonths: 120,
        }),
      ),
    ).toEqual({
      from: "2021-01-01",
      fromSource: "typical",
      until: "2028-01-01",
      untilSource: "typical",
    });
    expect(
      drinkWindow(
        bottle({ openedAt: "2026-03-01T18:30:00.000Z" }),
        entry({ basis: "opened", untilMonths: 1 }),
      )?.until,
    ).toBe("2026-04-01");
  });

  it("lets the person's dates win field by field", () => {
    expect(
      drinkWindow(
        bottle({ packagedOn: "2026-01-15", drinkUntil: "2026-03-01" }),
        entry(),
      ),
    ).toEqual({
      from: "2026-01-15",
      fromSource: "typical",
      until: "2026-03-01",
      untilSource: "user",
    });
    expect(drinkWindow(bottle({ drinkFrom: "2030-06-01" }), null)).toEqual({
      from: "2030-06-01",
      fromSource: "user",
      until: null,
      untilSource: null,
    });
  });

  it("gives no typical date when the bottle lacks the entry's basis", () => {
    expect(
      drinkWindow(
        bottle({ acquiredOn: "2026-01-01", drinkUntil: "2027-01-01" }),
        entry({ basis: "packaged" }),
      ),
    ).toEqual({
      from: null,
      fromSource: null,
      until: "2027-01-01",
      untilSource: "user",
    });
  });
});
