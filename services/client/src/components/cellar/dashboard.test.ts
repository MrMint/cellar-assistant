import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CellarGridItem } from "./adapter";
import { recentShelf } from "./CellarDashboard";
import {
  byTypeLine,
  type DashboardData,
  dashboardHasContent,
  dashboardTiles,
  drinkSoonRows,
  monthKeysEndingAt,
  monthLabel,
  pourTrend,
  sparkBars,
} from "./dashboard";

const data: DashboardData = {
  bottleCount: 12,
  openCount: 3,
  almostEmptyCount: 1,
  almostEmptyAt: 25,
  finishedThisMonth: 2,
  finishedCount: 9,
  addedRecently: 4,
  recentDays: 30,
  logsByMonth: [0, 0, 1, 0, 0, 0, 0, 9, 3, 0, 2, 5],
  currentMonth: "2026-10",
  timeZone: "America/Chicago",
};

describe("the cellar dashboard's numbers (X04, D3)", () => {
  test("months are named from a fixed table, across a new year", () => {
    assert.equal(monthLabel("2026-10", "short"), "Oct");
    assert.equal(monthLabel("2026-01", "long"), "January 2026");
    assert.equal(monthLabel("bogus", "long"), "bogus");
    assert.deepEqual(monthKeysEndingAt("2026-02", 3), [
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  test("by type: canonical order, the three biggest named, the rest folded", () => {
    assert.equal(
      byTypeLine({ WINE: 8, BEER: 1, SPIRIT: 3, SAKE: 1, TEA: 2 }),
      "8 wine · 3 spirit · 2 tea · 2 more",
    );
    assert.equal(byTypeLine({ SPIRIT: 1 }), "1 spirit");
    assert.equal(byTypeLine({}), null);
  });

  test("the tiles count bottles and land on the matching collection", () => {
    const tiles = dashboardTiles("c1", data, { WINE: 12 });
    assert.deepEqual(
      tiles.map((tile) => [tile.key, tile.value, tile.href]),
      [
        ["in-cellar", 12, "/cellars/c1/items#collection"],
        ["open", 3, "/cellars/c1/items?sort=open#collection"],
        ["almost-empty", 1, "/cellars/c1/items?sort=almost-empty#collection"],
        ["finished", 2, "/cellars/c1/items?status=finished#collection"],
      ],
    );
    assert.equal(tiles[0]?.detail, "12 wine");
    assert.equal(tiles[1]?.detail, "9 sealed");
    assert.equal(tiles[3]?.detail, "9 in the diary");
  });

  test("the trend says the whole series in a sentence", () => {
    const trend = pourTrend(data);
    assert.equal(trend.total, 20);
    assert.equal(trend.thisMonth, 5);
    assert.equal(trend.peak?.long, "June 2026");
    assert.equal(trend.months[0]?.key, "2025-11");
    assert.equal(
      trend.spoken,
      "20 pours in the last 12 months, 5 pours this month; the most in June 2026 (9).",
    );
    assert.equal(
      pourTrend({ logsByMonth: [0, 0], currentMonth: "2026-10" }).spoken,
      "No pours logged from this cellar in the last 2 months.",
    );
  });

  test("bars scale to the busiest month, and a single pour is still visible", () => {
    const bars = sparkBars([0, 1, 10], { width: 32, height: 40, gap: 1 });
    assert.equal(bars.length, 3);
    assert.equal(bars[0]?.height, 0);
    assert.equal(bars[1]?.height, 4);
    assert.equal(bars[2]?.height, 40);
    assert.equal(bars[2]?.y, 0);
    assert.equal(bars[1]?.x, 11);
    assert.deepEqual(sparkBars([0, 0], { width: 10, height: 5, gap: 0 }), [
      { x: 0, y: 5, width: 5, height: 0 },
      { x: 5, y: 5, width: 5, height: 0 },
    ]);
  });

  test("a cellar with nothing in it and nothing finished has no dashboard", () => {
    assert.equal(
      dashboardHasContent({ ...data, bottleCount: 0, finishedCount: 0 }),
      false,
    );
    assert.equal(dashboardHasContent({ ...data, bottleCount: 0 }), true);
  });

  test("recently added: within the window, and not already open above it", () => {
    const cell = (id: string, createdAt: string | null): CellarGridItem => ({
      type: "WINE",
      item: { id, itemId: `i-${id}`, name: id },
      bottle: {
        openAt: null,
        emptyAt: null,
        percentageRemaining: 100,
        createdAt,
      },
    });
    const asOf = Date.parse("2026-10-09T00:00:00Z");
    const shelf = recentShelf(
      [
        cell("new", "2026-10-01T00:00:00Z"),
        cell("open", "2026-10-02T00:00:00Z"),
        cell("old", "2026-08-01T00:00:00Z"),
        cell("undated", null),
      ],
      [cell("open", "2026-10-02T00:00:00Z")],
      { asOf, days: 30 },
    );
    assert.deepEqual(
      shelf.map((entry) => entry.item.id),
      ["new"],
    );
  });
});

describe("drinkSoonRows (L02)", () => {
  type Node = Parameters<typeof drinkSoonRows>[0][number];
  const node = (over: Record<string, unknown>): Node =>
    ({
      reason: "SEALED",
      urgency: "SOON",
      openDays: null,
      openLifeFromDays: null,
      openLifeUntilDays: null,
      typicalFor: "IPA",
      window: { until: "2027-01-01", untilSource: "TYPICAL" },
      bottle: {
        __typename: "CellarItem",
        id: "b1",
        cellarId: "c1",
        item: { __typename: "Beer", id: "i1", type: "BEER", name: "hazy one" },
      },
      ...over,
    }) as unknown as Node;

  test("opened, then sealed, worded as the board words them", () => {
    const rows = drinkSoonRows([
      node({
        reason: "OPENED",
        urgency: "PAST",
        openDays: 9,
        openLifeFromDays: 3,
        openLifeUntilDays: 5,
        typicalFor: "red wine",
        window: null,
        bottle: {
          __typename: "CellarItem",
          id: "w1",
          cellarId: "c1",
          item: {
            __typename: "Wine",
            id: "i2",
            type: "WINE",
            name: "barolo",
            vintage: "2016-01-01",
          },
        },
      }),
      node({}),
      node({ window: { until: "2027-02-14", untilSource: "USER" } }),
    ]);
    assert.deepEqual(
      rows.map((r) => r.line),
      [
        "Open 9 days · typical for red wine once open: 3–5 days",
        "Sealed · window ends Jan 2027 · typical for IPA",
        "Sealed · your date: drink by Feb 2027",
      ],
    );
    assert.equal(rows[0]?.past, true);
    assert.match(rows[0]?.title ?? "", /^2016 /);
    assert.equal(rows[1]?.href, "/cellars/c1/beers/b1");
  });

  test("a sealed row with no end is not drawn", () => {
    assert.deepEqual(drinkSoonRows([node({ window: null })]), []);
  });
});
