/**
 * Waiting on you's new rows (Needs details, n to check) and "Limit reached"
 * with its reset (MC-quota) — `inbox.ts`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { print } from "graphql";
import {
  buildInbox,
  limitResetLine,
  NEEDS_DETAILS_HREF,
  toCheckFromNodes,
} from "./inbox";
import { HomeInboxQuery } from "./queries";

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

describe("F-231 / FR-16: Places' own allowance beside AI's", () => {
  const places = {
    kind: "google_places",
    service: "GOOGLE_PLACES" as const,
    used: 200,
    limit: 200,
    resetsAt: "2026-12-01T00:00:00Z",
  };
  const ai = {
    kind: "ai_model/menu_scan",
    service: "AI_MODEL" as const,
    used: 4,
    limit: 10,
    resetsAt: "2026-11-28T09:00:00Z",
  };
  test("a spent Places allowance says it is Places, with its use", () => {
    assert.equal(
      limitResetLine(null, [ai, places], options),
      "Places limit reached · 200 of 200 · resets after Dec 1",
    );
  });
  test("the refusal's own reset picks which allowance it was", () => {
    const spentAi = { ...ai, used: 10 };
    assert.equal(
      limitResetLine("2026-11-28T09:00:00Z", [spentAi, places], options),
      "Limit reached · resets tomorrow after 9:00 AM",
    );
    assert.equal(
      limitResetLine("2026-12-01T00:00:00Z", [spentAi, places], options),
      "Places limit reached · 200 of 200 · resets after Dec 1",
    );
  });
  test("an unspent Places allowance is no limit", () => {
    assert.equal(limitResetLine(null, [{ ...places, used: 3 }], options), null);
  });
});

describe("HomeInboxQuery", () => {
  const source = print(HomeInboxQuery as never);
  test("reads which allowance each quota row is (F-230)", () => {
    assert.match(source, /myAiQuota[\s\S]*\bservice\b/);
  });
  test("reads the server's n-to-check count over sealed bottles too (F-123, H-86)", () => {
    assert.match(source, /\bunconfirmedBottleCount\b/);
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

  test("a sealed bottle's guesses count too: the server's count over every bottle (F-123)", () => {
    // `me.unconfirmedBottleCount` (F-76) sees sealed bottles the open read cannot.
    const sealedOnly = toCheckFromNodes([node("b0", "i0", [])], 2);
    assert.equal(sealedOnly?.count, 2);
    assert.equal(sealedOnly?.name, null);
    assert.equal(sealedOnly?.fields, "Guessed from a label");
    assert.equal(sealedOnly?.href, "/cellars");
    const both = toCheckFromNodes([node("b1", "i1", ["country"])], 3);
    assert.equal(both?.count, 3, "the open one named, the sealed ones counted");
    assert.equal(both?.href, "/cellars/c1/beers/b1");
    assert.equal(
      toCheckFromNodes([node("b1", "i1", ["country"])], 0)?.count,
      1,
    );
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
