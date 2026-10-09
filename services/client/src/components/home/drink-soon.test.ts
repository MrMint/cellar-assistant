/**
 * "Drink soon" (X10, D29): a table, labelled, deterministic — and silent for
 * a style it does not know.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  drinkSoonList,
  drinkSoonState,
  formatSpan,
  openLifeFor,
  typicalLine,
} from "./drink-soon";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW - days * 86_400_000 - 60_000).toISOString();

describe("openLifeFor", () => {
  test("reads the style each type keeps it in", () => {
    assert.equal(
      openLifeFor({ type: "WINE", style: "RED" })?.label,
      "red wine",
    );
    assert.equal(
      openLifeFor({ type: "SAKE", style: "namazake" })?.label,
      "namazake",
    );
    assert.equal(
      openLifeFor({ type: "SPIRIT", style: "AMARO_APERITIF_VERMOUTH" })
        ?.maxDays,
      60,
    );
    assert.equal(
      openLifeFor({ type: "TEA", style: "green" })?.label,
      "green tea",
    );
  });

  test("beer and coffee do not depend on style", () => {
    assert.equal(openLifeFor({ type: "BEER", style: null })?.label, "beer");
    assert.equal(
      openLifeFor({ type: "COFFEE", style: "anything" })?.label,
      "coffee beans",
    );
  });

  test("matcha overrides its category", () => {
    assert.equal(
      openLifeFor({ type: "TEA", style: "green", form: "matcha_powder" })
        ?.label,
      "matcha",
    );
  });

  test("a style the table does not name has no window (D29)", () => {
    assert.equal(openLifeFor({ type: "WINE", style: null }), null);
    assert.equal(openLifeFor({ type: "WINE", style: "ORANGE" }), null);
    assert.equal(openLifeFor({ type: "SPIRIT", style: "MOONSHINE" }), null);
    assert.equal(openLifeFor({ type: "SAKE", style: null }), null);
  });
});

describe("formatSpan and typicalLine", () => {
  test("picks the unit a person would say", () => {
    const span = (minDays: number, maxDays: number) =>
      formatSpan({ minDays, maxDays, label: "x" });
    assert.equal(span(3, 5), "3–5 days");
    assert.equal(span(1, 2), "1–2 days");
    assert.equal(span(14, 30), "2–4 weeks");
    assert.equal(span(30, 60), "1–2 months");
    assert.equal(span(180, 365), "6–12 months");
    assert.equal(span(365, 730), "1–2 years");
  });

  test("labels the window with the style it came from", () => {
    const red = openLifeFor({ type: "WINE", style: "RED" });
    assert.ok(red);
    assert.equal(typicalLine(red), "Typical for red wine once open: 3–5 days");
  });
});

describe("drinkSoonState", () => {
  const red = (openAt: string | null, emptyAt: string | null = null) => ({
    type: "WINE" as const,
    style: "RED",
    openAt,
    emptyAt,
  });

  test("nothing before the shortest typical span", () => {
    assert.equal(drinkSoonState(red(daysAgo(2)), NOW), null);
  });

  test("now inside the window, past beyond it", () => {
    assert.equal(drinkSoonState(red(daysAgo(3)), NOW)?.urgency, "now");
    assert.equal(drinkSoonState(red(daysAgo(5)), NOW)?.urgency, "now");
    const past = drinkSoonState(red(daysAgo(6)), NOW);
    assert.equal(past?.urgency, "past");
    assert.equal(past?.openDays, 6);
  });

  test("sealed, finished, future and unparseable bottles are never listed", () => {
    assert.equal(drinkSoonState(red(null), NOW), null);
    assert.equal(drinkSoonState(red(daysAgo(9), daysAgo(1)), NOW), null);
    assert.equal(
      drinkSoonState(red(new Date(NOW + 86_400_000).toISOString()), NOW),
      null,
    );
    assert.equal(drinkSoonState(red("not a date"), NOW), null);
  });

  test("an unknown style is never listed, however long it has been open", () => {
    assert.equal(
      drinkSoonState({ type: "WINE", style: null, openAt: daysAgo(400) }, NOW),
      null,
    );
  });
});

describe("drinkSoonList", () => {
  test("most overdue first", () => {
    const list = drinkSoonList(
      [
        { id: "red", type: "WINE" as const, style: "RED", openAt: daysAgo(4) },
        { id: "beer", type: "BEER" as const, style: null, openAt: daysAgo(3) },
        {
          id: "fizz",
          type: "WINE" as const,
          style: "SPARKLING",
          openAt: daysAgo(1),
        },
        {
          id: "fresh",
          type: "WINE" as const,
          style: "RED",
          openAt: daysAgo(0),
        },
      ],
      NOW,
    );
    assert.deepEqual(
      list.map((entry) => entry.bottle.id),
      ["beer", "red", "fizz"],
    );
  });
});
