/**
 * The bottle page's freshness card (ux-c L02): the window, where each end
 * came from, and the "This bottle" rows — and no window where the table has
 * no row and the owner gave no date (D29: never an estimate).
 */
import { describe, expect, test } from "bun:test";
import {
  draftOf,
  type FreshnessBottle,
  type FreshnessItem,
  formatPrice,
  freshnessModel,
  freshnessPatch,
  localDay,
} from "./freshness";

const TODAY = "2026-11-22";

const bottle = (over: Partial<FreshnessBottle> = {}): FreshnessBottle => ({
  openAt: null,
  emptyAt: null,
  packagedOn: null,
  acquiredOn: null,
  drinkFrom: null,
  drinkUntil: null,
  priceAmount: null,
  priceCurrency: null,
  location: null,
  ...over,
});

const red2020: FreshnessItem = {
  type: "WINE",
  style: "RED",
  form: null,
  vintageYear: 2020,
};

const row = (model: ReturnType<typeof freshnessModel>, field: string) =>
  model.rows.find((r) => r.field === field);

describe("freshnessModel — sealed", () => {
  test("a red wine's typical window from its vintage", () => {
    const m = freshnessModel(bottle(), red2020, TODAY);
    expect(m.window).toEqual({
      from: "2022-01-01",
      fromSource: "typical",
      until: "2030-01-01",
      untilSource: "typical",
    });
    expect(m.heading).toBe("2022 – 2030");
    expect(m.status).toEqual({ label: "Ready now", tone: "good" });
    expect(m.sourceLine).toBe(
      "From: typical for red wine, 2 years from vintage. Until: typical for red wine, 10 years from vintage. Set your own to override.",
    );
    expect(row(m, "drinkUntil")?.value).toBe("Jan 2030 · typical");
    expect(row(m, "drinkUntil")?.source).toBe("typical");
  });

  test("the owner's date overrides its end, and says so", () => {
    const m = freshnessModel(
      bottle({ drinkFrom: "2024-03-01" }),
      red2020,
      TODAY,
    );
    expect(m.window?.fromSource).toBe("user");
    expect(row(m, "drinkFrom")?.value).toBe("Mar 2024 · yours");
    expect(m.sourceLine).toBe(
      "From: your date. Until: typical for red wine, 10 years from vintage. Set your own to override.",
    );
  });

  test("both ends the owner's: no override prompt", () => {
    const m = freshnessModel(
      bottle({ drinkFrom: "2024-03-01", drinkUntil: "2040-12-31" }),
      red2020,
      TODAY,
    );
    expect(m.sourceLine).toBe("From: your date. Until: your date.");
    expect(m.heading).toBe("2024 – 2040");
  });

  test("a style with no row and no date shows no window (no estimate)", () => {
    const m = freshnessModel(
      bottle({ acquiredOn: "2026-01-10" }),
      { type: "SPIRIT", style: "BOURBON", form: null, vintageYear: null },
      TODAY,
    );
    expect(m.window).toBeNull();
    expect(m.heading).toBeNull();
    expect(m.status).toBeNull();
    expect(m.bar).toBeNull();
    expect(m.sourceLine).toBeNull();
    expect(row(m, "drinkFrom")?.value).toBeNull();
    expect(row(m, "acquiredOn")?.value).toBe("10 Jan 2026");
  });

  test("an IPA closing within three months reads Drink soon", () => {
    const m = freshnessModel(
      bottle({ packagedOn: "2026-10-01" }),
      { type: "BEER", style: "INDIA_PALE_ALE", form: null, vintageYear: null },
      TODAY,
    );
    expect(m.window?.until).toBe("2027-01-01");
    expect(m.heading).toBe("Oct 2026 – Jan 2027");
    expect(m.status?.tone).toBe("soon");
    expect(m.sourceLine).toContain("typical for IPA, 3 months from bottling");
  });

  test("not ready yet, and past its window", () => {
    const young = freshnessModel(
      bottle(),
      { ...red2020, vintageYear: 2025 },
      TODAY,
    );
    expect(young.status).toEqual({
      label: "Not ready until Jan 2027",
      tone: "wait",
    });
    const old = freshnessModel(
      bottle(),
      { ...red2020, vintageYear: 2010 },
      TODAY,
    );
    expect(old.status?.tone).toBe("past");
  });

  test("the bar puts today inside the axis and the window within it", () => {
    const m = freshnessModel(bottle(), red2020, TODAY);
    const bar = m.bar;
    expect(bar).not.toBeNull();
    if (bar === null) return;
    expect(bar.start).toBeGreaterThanOrEqual(0);
    expect(bar.start + bar.width).toBeLessThanOrEqual(100);
    expect(bar.today).toBeGreaterThan(bar.start);
    expect(bar.today).toBeLessThan(bar.start + bar.width);
    expect(bar.axisFrom).toBe("2020");
  });

  test("W-6: the axis ends on the owner's Drink until, not the padding past it", () => {
    const m = freshnessModel(
      bottle({ drinkUntil: "2026-12-31" }),
      red2020,
      TODAY,
    );
    expect(m.window?.untilSource).toBe("user");
    expect(m.bar?.axisTo).toBe("2026");
    // The board keeps the prompt while one end is still typical.
    expect(m.sourceLine).toBe(
      "From: typical for red wine, 2 years from vintage. Until: your date. Set your own to override.",
    );
  });
});

describe("freshnessModel — opened", () => {
  test("an open bottle's card is its open life; the rows keep the cellar window", () => {
    const m = freshnessModel(
      bottle({ openAt: "2026-11-20T19:00:00.000Z", drinkUntil: "2035-01-01" }),
      red2020,
      TODAY,
    );
    expect(m.window).toEqual({
      from: "2026-11-23",
      fromSource: "typical",
      until: "2026-11-25",
      untilSource: "typical",
    });
    expect(m.heading).toBe("Best by 25 Nov 2026");
    expect(m.status).toEqual({ label: "Fresh", tone: "good" });
    expect(m.sourceLine).toBe("Typical for red wine once open: 3–5 days.");
    expect(row(m, "drinkUntil")?.value).toBe("Jan 2035 · yours");
  });

  test("open past its days is past its best", () => {
    const m = freshnessModel(
      bottle({ openAt: "2026-11-01T19:00:00.000Z" }),
      red2020,
      TODAY,
    );
    expect(m.status?.tone).toBe("past");
  });

  test("a finished bottle shows the cellar window, not an open life", () => {
    const m = freshnessModel(
      bottle({ openAt: "2026-11-01", emptyAt: "2026-11-02" }),
      red2020,
      TODAY,
    );
    expect(m.heading).toBe("2022 – 2030");
  });
});

describe("rows", () => {
  test("empty values read as Add (null); price and place are the owner's", () => {
    const empty = freshnessModel(bottle(), red2020, TODAY);
    expect(row(empty, "price")?.value).toBeNull();
    expect(row(empty, "location")?.value).toBeNull();
    const full = freshnessModel(
      bottle({
        priceAmount: 58,
        priceCurrency: "EUR",
        location: "Rack B, row 3",
      }),
      red2020,
      TODAY,
    );
    expect(row(full, "price")?.value).toBe("€58.00");
    expect(row(full, "location")?.value).toBe("Rack B, row 3");
    expect(full.rows.map((r) => r.label)).toEqual([
      "Bought",
      "Bottled",
      "Drink from",
      "Drink until",
      "Price",
      "Where it lives",
    ]);
  });

  test("an unknown currency code still shows the amount", () => {
    expect(formatPrice(12.5, "ZZZ")).toMatch(/12\.50/);
  });
});

describe("freshnessPatch", () => {
  const saved = bottle({
    acquiredOn: "2026-01-10",
    priceAmount: 58,
    priceCurrency: "EUR",
    location: "Rack B",
  });

  test("an untouched draft sends nothing", () => {
    expect(freshnessPatch(saved, draftOf(saved))).toEqual({
      ok: true,
      patch: {},
    });
  });

  test("only what changed; empty clears", () => {
    const result = freshnessPatch(saved, {
      ...draftOf(saved),
      acquiredOn: "",
      drinkUntil: "2030-06-01",
      location: "  Rack C  ",
    });
    expect(result).toEqual({
      ok: true,
      patch: { acquiredOn: null, drinkUntil: "2030-06-01", location: "Rack C" },
    });
  });

  test("the price pair travels together; a cleared price clears its currency", () => {
    expect(
      freshnessPatch(saved, { ...draftOf(saved), currency: "usd" }),
    ).toEqual({ ok: true, patch: { priceAmount: 58, priceCurrency: "USD" } });
    expect(freshnessPatch(saved, { ...draftOf(saved), price: "" })).toEqual({
      ok: true,
      patch: { priceAmount: null, priceCurrency: null },
    });
  });

  test("refuses what the server would", () => {
    const d = draftOf(bottle());
    expect(freshnessPatch(bottle(), { ...d, price: "12" }).ok).toBe(false);
    expect(
      freshnessPatch(bottle(), { ...d, price: "-1", currency: "EUR" }).ok,
    ).toBe(false);
    expect(
      freshnessPatch(bottle(), {
        ...d,
        drinkFrom: "2030-01-01",
        drinkUntil: "2029-01-01",
      }).ok,
    ).toBe(false);
    expect(
      freshnessPatch(bottle(), { ...d, location: "x".repeat(81) }).ok,
    ).toBe(false);
  });
});

describe("localDay (CR-12)", () => {
  test("the local calendar day, not the UTC one", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      // 18:00 on 31 Dec in UTC-8 is 02:00 on 1 Jan UTC.
      const evening = new Date(Date.UTC(2026, 11, 31, 2 + 24, 0));
      expect(localDay(evening)).toBe("2026-12-31");
      expect(localDay(new Date(Date.UTC(2026, 0, 5, 12)))).toBe("2026-01-05");
    } finally {
      process.env.TZ = tz;
    }
  });
});
