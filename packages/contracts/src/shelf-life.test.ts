import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  type BottleDates,
  DRINK_SOON_HORIZON_MONTHS,
  drinkWindow,
  lookupShelfLife,
  type OpenedShelfLife,
  openedDrinkSoon,
  type SealedShelfLife,
  SHELF_LIFE,
  type ShelfLifeEntry,
  sealedDrinkSoon,
  sealedShelfLife,
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

const entry = (over: Partial<SealedShelfLife> = {}): SealedShelfLife => ({
  type: "BEER",
  match: { style: null },
  fromMonths: 0,
  untilMonths: 4,
  basis: "packaged",
  label: "beer",
  ...over,
});

const openedEntry = (over: Partial<OpenedShelfLife> = {}): OpenedShelfLife => ({
  type: "BEER",
  match: { style: null },
  fromDays: 1,
  untilDays: 2,
  basis: "opened",
  label: "beer",
  ...over,
});

describe("SHELF_LIFE", () => {
  it("has a labelled row for the common styles, sealed and opened", () => {
    const red = lookupShelfLife("WINE", { style: "RED" }, "vintage");
    expect(red).toMatchObject({ label: "red wine", fromMonths: 24 });
    expect(
      lookupShelfLife("BEER", { style: "INDIA_PALE_ALE" }, "packaged"),
    ).toMatchObject({ label: "IPA", untilMonths: 3 });
    expect(lookupShelfLife("SAKE", { style: "namazake" }, "opened")).toEqual(
      expect.objectContaining({ fromDays: 3, untilDays: 7 }),
    );
  });

  it("keeps the opened-bottle table home/drink-soon.ts carried (L18)", () => {
    const span = (type: ShelfLifeEntry["type"], style: string | null) => {
      const row = lookupShelfLife(type, { style }, "opened");
      return row === null ? null : [row.fromDays, row.untilDays, row.label];
    };
    expect(span("WINE", "SPARKLING")).toEqual([1, 3, "sparkling wine"]);
    expect(span("WINE", "DESSERT")).toEqual([7, 28, "dessert wine"]);
    expect(span("SAKE", "koshu")).toEqual([30, 90, "koshu"]);
    expect(span("SPIRIT", "AMARO_APERITIF_VERMOUTH")).toEqual([
      30,
      60,
      "vermouth and aperitifs",
    ]);
    expect(span("TEA", "pu_erh")).toEqual([365, 730, "pu-erh"]);
    expect(span("BEER", "STOUT")).toEqual([1, 2, "beer"]);
    expect(span("COFFEE", null)).toEqual([14, 30, "coffee beans"]);
    expect(
      lookupShelfLife(
        "TEA",
        { style: "green", form: "matcha_powder" },
        "opened",
      )?.label,
    ).toBe("matcha");
  });

  it("every row's window opens before it closes", () => {
    for (const row of SHELF_LIFE) {
      const [from, until] =
        row.basis === "opened"
          ? [row.fromDays, row.untilDays]
          : [row.fromMonths, row.untilMonths];
      expect(from, row.label).toBeLessThanOrEqual(until);
      expect(row.label.length, row.type).toBeGreaterThan(0);
    }
  });

  it("abstains for a style with no row: no window, never an estimate (D29)", () => {
    // Sealed spirits keep indefinitely, pu-erh is aged on purpose, and a wine
    // whose style nobody gave has nothing to count from.
    for (const [type, style] of [
      ["SPIRIT", "BOURBON"],
      ["TEA", "pu_erh"],
      ["SAKE", "koshu"],
      ["WINE", null],
      ["WINE", "ORANGE"],
      ["SPIRIT", "MOONSHINE"],
    ] as const) {
      const dated = bottle({
        packagedOn: "2020-01-01",
        acquiredOn: "2020-01-01",
        vintageYear: 2020,
      });
      expect(sealedShelfLife(type, { style }, dated), `${type} ${style}`).toBe(
        null,
      );
      expect(drinkWindow(dated, sealedShelfLife(type, { style }, dated))).toBe(
        null,
      );
    }
    expect(lookupShelfLife("SPIRIT", { style: "MOONSHINE" }, "opened")).toBe(
      null,
    );
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
        openedEntry({ untilDays: 5 }),
      )?.until,
    ).toBe("2026-03-06");
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

describe("addDays", () => {
  it("crosses a month and a year", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("later", 1)).toBeNull();
  });
});

describe("sealedShelfLife", () => {
  it("counts from bottling first, then the vintage, then purchase", () => {
    const red = { style: "WHITE" };
    expect(
      sealedShelfLife("WINE", red, bottle({ vintageYear: 2020 }))?.basis,
    ).toBe("vintage");
    expect(
      sealedShelfLife(
        "WINE",
        red,
        bottle({ vintageYear: 2020, acquiredOn: "2024-01-01" }),
      )?.basis,
    ).toBe("vintage");
    expect(
      sealedShelfLife("WINE", red, bottle({ acquiredOn: "2024-01-01" }))?.basis,
    ).toBe("acquired");
    expect(
      sealedShelfLife(
        "BEER",
        { style: "INDIA_PALE_ALE" },
        bottle({ packagedOn: "2026-01-01", acquiredOn: "2026-02-01" }),
      )?.basis,
    ).toBe("packaged");
  });

  it("skips a basis the bottle has no date for", () => {
    // A red has no purchase-basis row, so a non-vintage red has no window.
    expect(
      sealedShelfLife(
        "WINE",
        { style: "RED" },
        bottle({ acquiredOn: "2024-01-01" }),
      ),
    ).toBeNull();
  });
});

describe("openedDrinkSoon", () => {
  const NOW = Date.parse("2026-10-09T12:00:00.000Z");
  const daysAgo = (days: number) =>
    new Date(NOW - days * 86_400_000 - 60_000).toISOString();

  it("lists an open bottle from its style's shortest span, past beyond the longest", () => {
    const red = (openAt: string) =>
      openedDrinkSoon("WINE", { style: "RED" }, { openAt }, NOW);
    expect(red(daysAgo(2))).toBeNull();
    expect(red(daysAgo(3))?.urgency).toBe("now");
    expect(red(daysAgo(6))).toMatchObject({ urgency: "past", openDays: 6 });
  });

  it("is silent for an unknown style, a sealed or a finished bottle", () => {
    expect(
      openedDrinkSoon("WINE", { style: null }, { openAt: daysAgo(400) }, NOW),
    ).toBeNull();
    expect(
      openedDrinkSoon("WINE", { style: "RED" }, { openAt: null }, NOW),
    ).toBeNull();
    expect(
      openedDrinkSoon(
        "WINE",
        { style: "RED" },
        { openAt: daysAgo(9), emptyAt: daysAgo(1) },
        NOW,
      ),
    ).toBeNull();
  });
});

describe("sealedDrinkSoon", () => {
  const TODAY = "2026-11-22";

  it("joins when the typical window closes within the horizon", () => {
    expect(DRINK_SOON_HORIZON_MONTHS).toBe(3);
    // An IPA canned in September: typical until December.
    const ipa = sealedDrinkSoon(
      "BEER",
      { style: "INDIA_PALE_ALE" },
      bottle({ packagedOn: "2026-09-15" }),
      TODAY,
    );
    expect(ipa).toMatchObject({
      reason: "sealed",
      urgency: "soon",
      window: { until: "2026-12-15", untilSource: "typical" },
      entry: { label: "IPA" },
    });
    // Canned last week: typical until February, inside three months.
    expect(
      sealedDrinkSoon(
        "BEER",
        { style: "INDIA_PALE_ALE" },
        bottle({ packagedOn: "2026-11-15" }),
        TODAY,
      ),
    ).not.toBeNull();
  });

  it("stays off the list while the window closes beyond the horizon", () => {
    expect(
      sealedDrinkSoon(
        "WINE",
        { style: "RED" },
        bottle({ vintageYear: 2022 }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("the person's own date overrides the table and joins on its own", () => {
    const mine = sealedDrinkSoon(
      "WINE",
      { style: "RED" },
      bottle({ vintageYear: 2022, drinkUntil: "2027-02-01" }),
      TODAY,
    );
    expect(mine?.window).toMatchObject({
      until: "2027-02-01",
      untilSource: "user",
    });
    // No table row at all: only the person's date makes a window.
    const bourbon = sealedDrinkSoon(
      "SPIRIT",
      { style: "BOURBON" },
      bottle({ drinkUntil: "2026-10-01" }),
      TODAY,
    );
    expect(bourbon).toMatchObject({ urgency: "past", entry: null });
  });

  it("never lists a style with no row and no date of the person's", () => {
    expect(
      sealedDrinkSoon(
        "SPIRIT",
        { style: "BOURBON" },
        bottle({ packagedOn: "1990-01-01", acquiredOn: "1990-01-01" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("ignores opened and finished bottles", () => {
    const ipa = bottle({ packagedOn: "2026-09-15" });
    expect(
      sealedDrinkSoon(
        "BEER",
        { style: "INDIA_PALE_ALE" },
        { ...ipa, openedAt: "2026-11-01" },
        TODAY,
      ),
    ).toBeNull();
    expect(
      sealedDrinkSoon(
        "BEER",
        { style: "INDIA_PALE_ALE" },
        { ...ipa, emptyAt: "2026-11-01" },
        TODAY,
      ),
    ).toBeNull();
  });
});
