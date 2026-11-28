/**
 * L04 — what the cards and stamps say: every card kind has copy, a stamp card
 * carries its stamp instead of a numeral, and no copy speaks of volume.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RECAP_CARD_KINDS } from "@cellar-assistant/contracts/recap";
import { renderToStaticMarkup } from "react-dom/server";
import { stampDescription, stampLabel } from "@/lib/stamps/stamps";
import { RecapShareCard } from "./RecapShareCard";
import { RecapStamp } from "./RecapStamp";
import {
  currentRecapPeriod,
  type RecapCardView,
  recapCardCopy,
  recapEndStats,
  recapMoreText,
  recapPeriodFoot,
  recapPeriodLabel,
  recapPeriodList,
  recapTotalsLine,
} from "./recap-copy";

const card = (fields: Partial<RecapCardView>): RecapCardView => ({
  kind: "REGIONS",
  count: 6,
  newCount: 4,
  chips: ["Jura", "Etna"],
  stamp: null,
  ...fields,
});

describe("recapCardCopy", () => {
  test("every card kind has an overline and a title", () => {
    for (const kind of RECAP_CARD_KINDS) {
      const copy = recapCardCopy(
        card({
          kind,
          stamp:
            kind === "STAMP" ? { kind: "REGIONS", count: 5, tier: 5 } : null,
        }),
      );
      assert.ok(copy.overline.length > 0, kind);
      assert.ok(copy.title.includes("\n"), kind);
      assert.doesNotMatch(
        `${copy.overline} ${copy.title}`,
        /drinks? logged|glasses|bottles drunk|streak|per week|per day/i,
      );
    }
  });

  test("regions card says how many were new", () => {
    assert.deepEqual(recapCardCopy(card({})), {
      overline: "Breadth",
      big: "6",
      title: "regions,\n4 of them new",
      chips: ["Jura", "Etna"],
      tone: "claret",
      accent: "claret",
    });
  });

  test("a stamp card carries the stamp, not a numeral", () => {
    const copy = recapCardCopy(
      card({ kind: "STAMP", stamp: { kind: "REGIONS", count: 6, tier: 5 } }),
    );
    assert.equal(copy.big, "");
    assert.equal(copy.title, "5+ regions\ntried");
  });
});

describe("stamps", () => {
  test("labels a tier with its noun", () => {
    assert.equal(stampLabel({ kind: "TYPES", tier: 3 }), "3+ kinds of drink");
    assert.equal(
      stampDescription({ kind: "STYLES", tier: 5, count: 7 }),
      "Stamp: 5+ styles (7 so far)",
    );
  });

  test("renders the stamp face with an accessible name", () => {
    const html = renderToStaticMarkup(
      <RecapStamp stamp={{ kind: "RECIPES", tier: 3, count: 3 }} />,
    );
    assert.match(html, /aria-label="Stamp: 3\+ recipes made"/);
  });
});

describe("periods", () => {
  test("labels a month, another year's month, and a year", () => {
    const now = new Date(2026, 10, 23);
    assert.equal(
      recapPeriodLabel({ kind: "month", year: 2026, month: 10 }, now),
      "Your October",
    );
    assert.equal(
      recapPeriodLabel({ kind: "month", year: 2025, month: 10 }, now),
      "Your October 2025",
    );
    assert.equal(
      recapPeriodLabel({ kind: "year", year: 2026 }, now),
      "Your 2026",
    );
    assert.equal(currentRecapPeriod(now), "2026-11");
  });
});

describe("RecapShareCard", () => {
  test("carries no URL or link", () => {
    const html = renderToStaticMarkup(
      <RecapShareCard
        card={card({})}
        period={{ kind: "month", year: 2026, month: 10 }}
      />,
    );
    assert.match(html, /4 of them new|regions/);
    assert.doesNotMatch(html, /https?:|www\.|<a /);
  });
});

describe("MC-recap words", () => {
  const now = new Date(2026, 10, 27);

  test("the Recaps list: this month, then each year and its months, newest first", () => {
    const list = recapPeriodList(
      { months: ["2026-05", "2026-04", "2024-11"], years: ["2026", "2024"] },
      now,
    );
    assert.deepEqual(
      list.map((o) => [o.key, o.label, o.sub]),
      [
        ["2026-11", "November 2026", "This month"],
        ["2026", "2026", "So far"],
        ["2026-05", "May 2026", ""],
        ["2026-04", "April 2026", ""],
        ["2024", "2024", "Whole year"],
        ["2024-11", "November 2024", ""],
      ],
    );
  });

  test("a new account's list is this month and this year only", () => {
    assert.deepEqual(
      recapPeriodList({ months: [], years: [] }, now).map((o) => o.key),
      ["2026-11", "2026"],
    );
  });

  test("totals: counted things, singular when one, zeros left out", () => {
    assert.equal(
      recapTotalsLine({ checkIns: 12, ratings: 1, bottlesAdded: 0 }),
      "12 check-ins · 1 rating",
    );
    assert.equal(
      recapTotalsLine({ checkIns: 0, ratings: 0, bottlesAdded: 2 }),
      "2 bottles added",
    );
    assert.equal(
      recapTotalsLine({ checkIns: 0, ratings: 0, bottlesAdded: 0 }),
      "",
    );
  });

  test("end tiles come from the counted cards; a stamp or top rated adds none", () => {
    assert.deepEqual(
      recapEndStats([
        card({ kind: "NEW_TO_YOU", count: 3 }),
        card({ kind: "TOP_RATED", count: 5 }),
        card({ kind: "REGIONS", count: 6 }),
      ]),
      [
        { value: 3, label: "new to you" },
        { value: 6, label: "regions" },
      ],
    );
  });

  test("+N more only when the card counts more than its chips", () => {
    assert.equal(recapMoreText(card({ count: 6 })), "+4 more");
    assert.equal(recapMoreText(card({ count: 2 })), "");
  });

  test("the share image's foot names the period short", () => {
    assert.equal(
      recapPeriodFoot({ kind: "month", year: 2023, month: 12 }),
      "Dec 2023",
    );
    assert.equal(recapPeriodFoot({ kind: "year", year: 2024 }), "2024");
  });
});
