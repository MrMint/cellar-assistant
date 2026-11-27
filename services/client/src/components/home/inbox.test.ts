/**
 * Waiting on you's new rows (Needs details, n to check) and "Limit reached"
 * with its reset (MC-quota) — `inbox.ts`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildInbox,
  limitResetLine,
  NEEDS_DETAILS_HREF,
  toCheckFromNodes,
} from "./inbox";

const NOW = new Date("2026-11-27T12:00:00Z");
const options = { now: NOW, timeZone: "UTC", locale: "en-US" };

describe("limitResetLine (MC-quota)", () => {
  test("names the reset the refusal carries", () => {
    assert.equal(
      limitResetLine("2026-12-01T00:00:00Z", [], options),
      "Limit reached · resets after Dec 1",
    );
  });

  test("else the soonest reset of a spent allowance; an unspent one is not a limit", () => {
    const quotas = [
      {
        kind: "ai_model/a",
        used: 3,
        limit: 10,
        resetsAt: "2026-11-28T09:00:00Z",
      },
      {
        kind: "ai_model/b",
        used: 10,
        limit: 10,
        resetsAt: "2026-12-01T00:00:00Z",
      },
    ];
    assert.equal(
      limitResetLine(null, quotas, options),
      "Limit reached · resets after Dec 1",
    );
    assert.equal(limitResetLine(null, quotas.slice(0, 1), options), null);
  });
});

describe("toCheckFromNodes", () => {
  const node = (id: string, itemId: string, fields: string[]) => ({
    id,
    cellarId: "c1",
    item: {
      id: itemId,
      type: "BEER",
      name: "wipers times",
      unconfirmedFields: fields,
    },
  });

  test("one row per item with a guessed field, linked to the first bottle", () => {
    const check = toCheckFromNodes([
      node("b0", "i0", []),
      node("b1", "i1", ["country"]),
      node("b2", "i1", ["country"]),
      node("b3", "i3", ["alcoholContentPercentage"]),
    ]);
    assert.equal(check?.count, 2);
    assert.equal(check?.fields, "country, from the label");
    assert.equal(check?.href, "/cellars/c1/beers/b1");
  });

  test("nothing guessed: no row", () => {
    assert.equal(toCheckFromNodes([node("b0", "i0", [])]), null);
  });
});

describe("buildInbox: drafts sit after matches, before requests", () => {
  test("Needs details only when the viewer has drafts", () => {
    const base = { jobs: [], suggestions: [], seen: new Set<string>() };
    const requests = [
      {
        id: "f1",
        status: "PENDING" as const,
        user: { id: "u1", displayName: "Test Two", avatarUrl: null },
      },
    ];
    assert.deepEqual(
      buildInbox({ ...base, requests, needsDetails: 0 }).map((i) => i.kind),
      ["request"],
    );
    const items = buildInbox({ ...base, requests, needsDetails: 50 });
    assert.deepEqual(
      items.map((i) => i.kind),
      ["needs-details", "request"],
    );
    const [first] = items;
    assert.ok(first?.kind === "needs-details");
    assert.equal(first.count, 50);
    assert.equal(first.href, NEEDS_DETAILS_HREF);
  });
});
