/**
 * BottleCard (N13b) and the rules behind it: the state line ("Sealed",
 * "Open · 8d", "Finished"), the level, your stars, the LabelPlate fallback —
 * and none of the catalog's favourite and review counts that read
 * "0 ♥ 0 💬" on every bottle.
 *
 * Server-rendered, asserting what a person or assistive tech observes.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NextImageConfig,
  nextImageModule,
  optimizedSrc,
} from "../../test-support/next-image";

mock.module("next/image", () => nextImageModule("art"));

const { BottleCard } = await import("./BottleCard");
const { bottleAge, bottleState } = await import("./bottle-state");
const { openTag } = await import("../../test-support/markup");

const render = (node: ReactNode) =>
  renderToStaticMarkup(<NextImageConfig>{node}</NextImageConfig>);

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("bottleAge", () => {
  const cases: [number, string, string][] = [
    [0, "<1h", "less than an hour"],
    [1, "1d", "1 day"],
    [8, "8d", "8 days"],
    [13, "13d", "13 days"],
    [14, "2w", "2 weeks"],
    [55, "7w", "7 weeks"],
    [56, "1mo", "1 month"],
    [200, "6mo", "6 months"],
    [365, "1y", "1 year"],
    [800, "2y", "2 years"],
  ];
  for (const [days, short, long] of cases) {
    test(`${days} days → ${short}`, () => {
      assert.deepEqual(bottleAge(daysAgo(days), NOW), { short, long });
    });
  }

  test("under a day: hours, not 'today' (opened last night, read tonight)", () => {
    const hoursAgo = (hours: number) =>
      new Date(NOW - hours * 3_600_000).toISOString();
    assert.deepEqual(bottleAge(hoursAgo(1), NOW), {
      short: "1h",
      long: "1 hour",
    });
    assert.deepEqual(bottleAge(hoursAgo(23), NOW), {
      short: "23h",
      long: "23 hours",
    });
    assert.deepEqual(bottleAge(hoursAgo(24), NOW), {
      short: "1d",
      long: "1 day",
    });
  });

  test("a future or broken instant has no age", () => {
    assert.equal(bottleAge(daysAgo(-2), NOW), null);
    assert.equal(bottleAge("not a date", NOW), null);
  });
});

describe("bottleState", () => {
  test("never opened, full: Sealed, a full level", () => {
    assert.deepEqual(
      bottleState(
        { openAt: null, emptyAt: null, percentageRemaining: 100 },
        NOW,
      ),
      { kind: "sealed", label: "Sealed", spoken: "Sealed", level: 100 },
    );
  });

  test("opened 8 days ago, 40% left", () => {
    assert.deepEqual(
      bottleState(
        { openAt: daysAgo(8), emptyAt: null, percentageRemaining: 40 },
        NOW,
      ),
      {
        kind: "open",
        label: "Open · 8d",
        spoken: "Open 8 days, 40% left",
        level: 40,
      },
    );
  });

  test("opened under a day ago: hours", () => {
    const state = bottleState(
      { openAt: daysAgo(0.25), emptyAt: null, percentageRemaining: 90 },
      NOW,
    );
    assert.equal(state.label, "Open · 6h");
    assert.equal(state.spoken, "Open 6 hours, 90% left");
  });

  test("no clock yet (or no openAt): Open without an age", () => {
    assert.equal(
      bottleState({ openAt: daysAgo(3), percentageRemaining: 70 }, null).label,
      "Open",
    );
    // Poured from without being marked open: the level says it is open.
    assert.equal(
      bottleState({ openAt: null, percentageRemaining: 60 }, NOW).kind,
      "open",
    );
  });

  test("emptied: Finished, whatever the level or openAt say", () => {
    assert.deepEqual(
      bottleState(
        { openAt: daysAgo(30), emptyAt: daysAgo(1), percentageRemaining: 20 },
        NOW,
      ),
      { kind: "finished", label: "Finished", spoken: "Finished", level: 0 },
    );
  });

  test("an out-of-range level is clamped", () => {
    assert.equal(
      bottleState({ openAt: daysAgo(1), percentageRemaining: -5 }, NOW).level,
      0,
    );
  });
});

const cell = (over: {
  bottle?: Partial<{
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  }>;
  item?: Record<string, unknown>;
  type?: "WINE" | "BEER" | "TEA";
}) => ({
  type: over.type ?? ("WINE" as const),
  item: {
    id: "bottle-1",
    itemId: "item-1",
    name: "Barolo",
    vintage: "2016",
    plate: { producer: "Vietti", name: "Barolo", vintage: "2016" },
    favoriteCount: 0,
    reviewCount: 0,
    ...over.item,
  },
  bottle: {
    openAt: null,
    emptyAt: null,
    percentageRemaining: 100,
    ...over.bottle,
  },
});

describe("BottleCard", () => {
  test("sealed, no photo: the LabelPlate, a linked title, 'Sealed'", () => {
    const html = render(
      <BottleCard
        cell={cell({})}
        href="/cellars/c1/wines/bottle-1"
        now={NOW}
      />,
    );
    assert.match(
      openTag(html, 'data-slot="bottle-card"'),
      /data-state="sealed"/,
    );
    assert.match(openTag(html, 'data-slot="label-plate"'), /data-type="WINE"/);
    assert.match(
      openTag(html, 'href="/cellars/c1/wines/bottle-1"'),
      /^<a\b/,
      "the title is the card's link",
    );
    assert.match(html, />2016 Barolo<\/a>/);
    assert.match(html, />Sealed</);
    assert.match(html, /class="sr-only">Sealed</);
  });

  test("open: 'Open · 8d', the percentage, and a spoken line", () => {
    const html = render(
      <BottleCard
        cell={cell({
          bottle: { openAt: daysAgo(8), percentageRemaining: 40 },
        })}
        href="/x"
        now={NOW}
      />,
    );
    assert.match(openTag(html, 'data-slot="bottle-card"'), /data-state="open"/);
    assert.match(html, />Open · 8d</);
    assert.match(html, />40%</);
    assert.match(html, /class="sr-only">Open 8 days, 40% left</);
    // The level bar draws 40% of its width.
    assert.match(html, /transform:scaleX\(0\.4\)/);
  });

  test("no catalog counts: the '0 ♥ 0 💬' footer is gone", () => {
    const html = render(<BottleCard cell={cell({})} href="/x" now={NOW} />);
    assert.doesNotMatch(html, /aria-pressed|favorites|reviews/);
    assert.doesNotMatch(html, />0</);
  });

  test("your stars: a score pill when you rated it, nothing when not", () => {
    const rated = render(
      <BottleCard
        cell={cell({ item: { myScore: 4.5 } })}
        href="/x"
        now={NOW}
      />,
    );
    assert.match(rated, /data-slot="bottle-card-score"/);
    assert.match(rated, /aria-label="Rated 4\.5 out of 5"/);
    const unrated = render(
      <BottleCard
        cell={cell({ item: { myScore: null } })}
        href="/x"
        now={NOW}
      />,
    );
    assert.doesNotMatch(unrated, /bottle-card-score/);
  });

  test("a photo replaces the plate, through the optimizer", () => {
    const photo = "https://files.test/b.jpg?sig=1";
    const html = render(
      <BottleCard
        cell={cell({ item: { displayImageUrl: photo } })}
        href="/x"
        now={NOW}
      />,
    );
    assert.doesNotMatch(html, /data-slot="label-plate"/);
    // A half-width tile on a phone: the 400 px rendition is in the set.
    assert.ok(html.includes(`${optimizedSrc(photo, 400)} 400w`), html);
    assert.doesNotMatch(html, /src="https:\/\/files\.test/);
  });

  test("finished: 'Finished', and the plate is muted", () => {
    const html = render(
      <BottleCard
        cell={cell({
          bottle: {
            openAt: daysAgo(30),
            emptyAt: daysAgo(2),
            percentageRemaining: 0,
          },
        })}
        href="/x"
        now={NOW}
      />,
    );
    assert.match(
      openTag(html, 'data-slot="bottle-card"'),
      /data-state="finished"/,
    );
    assert.match(html, />Finished</);
    assert.doesNotMatch(html, />0%</);
  });

  test("a non-wine title does not lead with a vintage", () => {
    const html = render(
      <BottleCard
        cell={cell({
          type: "BEER",
          item: { name: "Pliny", vintage: "2020", plate: { name: "Pliny" } },
        })}
        href="/x"
        now={NOW}
      />,
    );
    assert.match(html, />Pliny<\/a>/);
  });

  test("X04: identical bottles show ×N, and say it", () => {
    const html = render(
      <BottleCard
        cell={{
          ...cell({ bottle: { openAt: daysAgo(8), percentageRemaining: 40 } }),
          group: { count: 3, openCount: 1, match: null },
        }}
        href="/x"
        now={NOW}
      />,
    );
    assert.match(html, /data-slot="bottle-card-count"[^>]*>×3</);
    assert.match(html, /Open 8 days, 40% left\. 3 bottles, 1 open\./);
    assert.doesNotMatch(html, /data-slot="bottle-card-match"/);
  });

  test("X04: one bottle shows no ×1; a meaning match says so", () => {
    const html = render(
      <BottleCard
        cell={{
          ...cell({}),
          group: { count: 1, openCount: 0, match: "MEANING" },
        }}
        href="/x"
        now={NOW}
      />,
    );
    assert.doesNotMatch(html, /bottle-card-count/);
    assert.match(html, /Similar to your search/);
  });
});
