/**
 * The dashboard's figures under happy-dom (X04, D3): the pours trend — one
 * series, the current month at rest, a native range for keyboards and screen
 * readers, a table of the whole series — and the stat tiles, which are links
 * into the collection.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/items" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PourTrend } = await import("./PourTrend");
const { StatTiles } = await import("./StatTiles");
const { dashboardTiles } = await import("./dashboard");

const LOGS = [0, 0, 1, 0, 0, 0, 0, 9, 3, 0, 2, 5];

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const readout = () =>
  container.querySelector('[data-slot="pour-trend-readout"]')?.textContent;

describe("PourTrend", () => {
  test("rests on this month, and says the whole series as a table", async () => {
    await act(async () =>
      root.render(<PourTrend logsByMonth={LOGS} currentMonth="2026-10" />),
    );
    assert.equal(readout(), "5pours in this month");
    assert.equal(container.querySelectorAll("tbody tr").length, 12);
    assert.match(
      container.querySelector("caption")?.textContent ?? "",
      /^20 pours in the last 12 months/,
    );
    // Months with pours are bars; empty months are only the baseline.
    assert.equal(container.querySelectorAll("svg path").length, 5);
    // The current month is drawn in full ink.
    assert.equal(container.querySelectorAll("path.fill-ink-1").length, 1);
  });

  test("the range moves the readout, and speaks the month", async () => {
    await act(async () =>
      root.render(<PourTrend logsByMonth={LOGS} currentMonth="2026-10" />),
    );
    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    assert.ok(range, "a range for keyboards");
    assert.equal(range.getAttribute("aria-label"), "Pours per month");
    assert.equal(range.getAttribute("aria-valuetext"), "October 2026: 5 pours");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(range, "7");
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(readout(), "9pours in June 2026");
    assert.equal(range.getAttribute("aria-valuetext"), "June 2026: 9 pours");
  });
});

describe("StatTiles", () => {
  test("four links, each a number and where it leads", async () => {
    const tiles = dashboardTiles(
      "c1",
      {
        bottleCount: 3,
        openCount: 1,
        almostEmptyCount: 0,
        almostEmptyAt: 25,
        finishedThisMonth: 2,
        finishedCount: 4,
        addedRecently: 0,
        recentDays: 30,
        logsByMonth: LOGS,
        currentMonth: "2026-10",
        timeZone: "UTC",
      },
      { WINE: 2, TEA: 1 },
    );
    await act(async () => root.render(<StatTiles tiles={tiles} />));
    const links = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        'a[data-slot="stat-tile"]',
      ),
    ];
    assert.deepEqual(
      links.map((link) => [link.getAttribute("href"), link.textContent]),
      [
        ["/cellars/c1/items#collection", "In the cellar32 wine · 1 tea"],
        ["/cellars/c1/items?sort=open#collection", "Open1"],
        [
          "/cellars/c1/items?sort=almost-empty#collection",
          "Almost empty025% left or less",
        ],
        [
          "/cellars/c1/items?status=finished#collection",
          "Finished this month24 in the diary",
        ],
      ],
    );
  });
});
