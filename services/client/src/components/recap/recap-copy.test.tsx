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
  recapPeriodLabel,
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
    assert.equal(copy.title, "5 regions\ntried");
  });
});

describe("stamps", () => {
  test("labels a tier with its noun", () => {
    assert.equal(stampLabel({ kind: "TYPES", tier: 3 }), "3 kinds of drink");
    assert.equal(
      stampDescription({ kind: "STYLES", tier: 5, count: 7 }),
      "Stamp: 5 styles (7 so far)",
    );
  });

  test("renders the stamp face with an accessible name", () => {
    const html = renderToStaticMarkup(
      <RecapStamp stamp={{ kind: "RECIPES", tier: 3, count: 3 }} />,
    );
    assert.match(html, /aria-label="Stamp: 3 recipes made"/);
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
